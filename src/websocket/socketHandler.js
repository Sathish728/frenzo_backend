import { User } from '../models/User.model.js';
import { Call } from '../models/Call.model.js';
import { CallService } from '../services/call.service.js';
import { SocketService } from '../services/socket.service.js';
import { logger } from '../config/logger.js';
import { CALL_STATUS } from '../config/constants.js';
import { config } from '../config/env.js';

const callService = new CallService();

// Track active calls
const activeCallsMap = new Map(); // visitorId -> { callId, menUserId, startTime, intervalId }

// Track pending calls (ringing)
const pendingCallsMap = new Map(); // tempCallId -> { menSocketId, womanId, timeout }

// Helper function to end call and notify both parties
const endCallAndNotify = async (io, callId, menSocket, womanSocket, reason = 'ended') => {
  try {
    // Update call record
    const call = await Call.findById(callId);
    if (call && call.status !== CALL_STATUS.ENDED) {
      const duration = Math.floor((Date.now() - call.startTime) / 1000);
      const minutesUsed = Math.ceil(duration / 60);
      const coinsUsed = minutesUsed * config.app.coinsPerMinute;

      await Call.findByIdAndUpdate(callId, {
        status: CALL_STATUS.ENDED,
        endTime: new Date(),
        duration: duration,
        coinsUsed: coinsUsed,
        coinsEarned: coinsUsed,
        endReason: reason
      });

      logger.info(`📞 Call ${callId} ended. Duration: ${duration}s, Coins: ${coinsUsed}`);
    }

    // Clear active call tracking
    if (womanSocket?.userId) {
      const activeCall = activeCallsMap.get(womanSocket.userId.toString());
      if (activeCall?.intervalId) {
        clearInterval(activeCall.intervalId);
      }
      activeCallsMap.delete(womanSocket.userId.toString());
    }

    // Notify both parties
    const endPayload = { callId, reason, duration: call?.duration || 0 };
    
    if (menSocket) {
      menSocket.emit('call_ended', endPayload);
      delete menSocket.activeCall;
    }
    
    if (womanSocket) {
      womanSocket.emit('call_ended', endPayload);
      delete womanSocket.activeCall;
    }

    // Update women availability
    const availableWomen = await SocketService.getAvailableWomen();
    io.emit('women_list_updated', { women: availableWomen });

  } catch (error) {
    logger.error('endCallAndNotify error:', error);
  }
};

export const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // ========== USER ONLINE ==========
    socket.on('user_online', async (userId) => {
      try {
        await SocketService.handleUserOnline(userId, socket.id);
        socket.userId = userId;

        const availableWomen = await SocketService.getAvailableWomen();
        io.emit('women_list_updated', { women: availableWomen });
        
        logger.info(`User ${userId} is online with socket ${socket.id}`);
      } catch (error) {
        logger.error('user_online error:', error);
      }
    });

    // ========== AVAILABILITY ==========
    socket.on('toggle_availability', async ({ userId, isAvailable }) => {
      try {
        const user = await User.findByIdAndUpdate(
          userId, 
          { isAvailable, isOnline: isAvailable },
          { new: true }
        );

        if (user) {
          logger.info(`User ${userId} availability: ${isAvailable}`);
        }

        const availableWomen = await SocketService.getAvailableWomen();
        io.emit('women_list_updated', { women: availableWomen });
      } catch (error) {
        logger.error('toggle_availability error:', error);
      }
    });

    socket.on('set_availability', async ({ isAvailable }) => {
      try {
        if (socket.userId) {
          const user = await User.findByIdAndUpdate(
            socket.userId,
            { isAvailable, isOnline: isAvailable },
            { new: true }
          );
          
          if (user) {
            logger.info(`User ${socket.userId} set availability: ${isAvailable}`);
          }

          const availableWomen = await SocketService.getAvailableWomen();
          io.emit('women_list_updated', { women: availableWomen });
        }
      } catch (error) {
        logger.error('set_availability error:', error);
      }
    });

    // ========== INITIATE CALL ==========
    socket.on('initiate_call', async (data) => {
      try {
        const { womanId } = data;
        const menUserId = socket.userId;

        logger.info(`📞 Call initiation: ${menUserId} -> ${womanId}`);

        if (!menUserId) {
          socket.emit('call_failed', { message: 'Not authenticated' });
          return;
        }

        const menUser = await User.findById(menUserId);
        const womanUser = await User.findById(womanId);

        if (!menUser) {
          socket.emit('call_failed', { message: 'User not found' });
          return;
        }

        // Check coins
        if (menUser.coins < config.app.coinsPerMinute) {
          socket.emit('insufficient_coins', { message: `Need at least ${config.app.coinsPerMinute} coins to call` });
          return;
        }

        if (!womanUser) {
          socket.emit('call_failed', { message: 'User not available' });
          return;
        }

        if (!womanUser.isOnline || !womanUser.isAvailable) {
          socket.emit('call_failed', { message: 'User is offline or unavailable' });
          return;
        }

        if (!womanUser.socketId) {
          socket.emit('call_failed', { message: 'User is not connected' });
          return;
        }

        // Check if busy
        const existingCall = activeCallsMap.get(womanId.toString());
        if (existingCall) {
          socket.emit('user_busy', { message: 'User is busy on another call' });
          return;
        }

        const ongoingCall = await Call.findOne({
          womenUserId: womanId,
          status: CALL_STATUS.ONGOING
        });

        if (ongoingCall) {
          socket.emit('user_busy', { message: 'User is busy on another call' });
          return;
        }

        const tempCallId = `call_${Date.now()}_${menUserId}_${womanId}`;

        // Send incoming call notification to woman
        io.to(womanUser.socketId).emit('incoming_call', {
          callId: tempCallId,
          caller: {
            _id: menUser._id,
            name: menUser.name,
            profileImage: menUser.profileImage,
          },
          menUserId: menUser._id.toString(),
          menName: menUser.name,
        });

        logger.info(`📞 Incoming call sent to woman ${womanId}, tempCallId: ${tempCallId}`);

        // Set timeout (30 seconds)
        const callTimeout = setTimeout(() => {
          const pending = pendingCallsMap.get(tempCallId);
          if (pending) {
            logger.info(`📞 Call timeout: ${tempCallId}`);
            socket.emit('no_answer', { message: 'No answer' });
            
            if (womanUser.socketId) {
              io.to(womanUser.socketId).emit('call_missed', { callId: tempCallId });
            }
            
            pendingCallsMap.delete(tempCallId);
          }
        }, 30000);

        pendingCallsMap.set(tempCallId, {
          menSocketId: socket.id,
          menUserId: menUserId,
          womanId: womanId,
          womanSocketId: womanUser.socketId,
          timeout: callTimeout,
        });

        socket.pendingCallId = tempCallId;

      } catch (error) {
        logger.error('initiate_call error:', error);
        socket.emit('call_failed', { message: 'Failed to initiate call' });
      }
    });

    // ========== ANSWER CALL ==========
    socket.on('answer_call', async (data) => {
      try {
        const { callId } = data;
        const womanUserId = socket.userId;

        logger.info(`📞 Answer call: ${callId} by ${womanUserId}`);

        if (!womanUserId) {
          socket.emit('call_failed', { message: 'Not authenticated' });
          return;
        }

        const pendingCall = pendingCallsMap.get(callId);
        
        if (!pendingCall) {
          socket.emit('call_failed', { message: 'Call no longer available' });
          return;
        }

        // Clear timeout
        if (pendingCall.timeout) {
          clearTimeout(pendingCall.timeout);
        }
        pendingCallsMap.delete(callId);

        const menUserId = pendingCall.menUserId;
        const menSocketId = pendingCall.menSocketId;

        const menUser = await User.findById(menUserId);
        const womanUser = await User.findById(womanUserId);

        if (!menUser || !womanUser) {
          socket.emit('call_failed', { message: 'Users not found' });
          return;
        }

        const menSocket = io.sockets.sockets.get(menSocketId);
        if (!menSocket) {
          socket.emit('call_failed', { message: 'Caller disconnected' });
          return;
        }

        // Create call record
        const call = await callService.createCall(menUserId, womanUserId);
        const callIdStr = call._id.toString();

        // Mark woman as busy
        activeCallsMap.set(womanUserId.toString(), {
          callId: callIdStr,
          menUserId: menUserId.toString(),
          startTime: new Date(),
          intervalId: null,
        });

        // Store call info
        socket.activeCall = { callId: call._id, remoteSocketId: menSocketId, remoteUserId: menUserId };
        menSocket.activeCall = { callId: call._id, remoteSocketId: socket.id, remoteUserId: womanUserId };

        delete menSocket.pendingCallId;

        // Notify both parties
        menSocket.emit('call_answered', { 
          callId: call._id,
          woman: {
            _id: womanUser._id,
            name: womanUser.name,
            profileImage: womanUser.profileImage,
          }
        });

        menSocket.emit('call_connected', { callId: call._id });
        socket.emit('call_connected', {
          callId: call._id,
          caller: {
            _id: menUser._id,
            name: menUser.name,
            profileImage: menUser.profileImage,
          }
        });

        // ========== START COIN DEDUCTION (Every 60 seconds) ==========
        const coinInterval = setInterval(async () => {
          try {
            const currentMenUser = await User.findById(menUserId);
            const currentWomanUser = await User.findById(womanUserId);
            
            if (!currentMenUser || currentMenUser.coins < config.app.coinsPerMinute) {
              // Insufficient coins - end call
              logger.info(`💰 Insufficient coins for call ${callIdStr}, ending call`);
              clearInterval(coinInterval);
              
              const activeCall = activeCallsMap.get(womanUserId.toString());
              if (activeCall) {
                activeCall.intervalId = null;
              }
              
              // End the call
              await endCallAndNotify(io, call._id, menSocket, socket, 'insufficient_coins');
              return;
            }

            // Deduct from men
            const updatedMen = await User.findByIdAndUpdate(
              menUserId, 
              { $inc: { coins: -config.app.coinsPerMinute } },
              { new: true }
            );

            // Add to women
            const updatedWoman = await User.findByIdAndUpdate(
              womanUserId, 
              { $inc: { coins: config.app.coinsPerMinute } },
              { new: true }
            );

            // Update call record
            await Call.findByIdAndUpdate(call._id, {
              $inc: { 
                duration: 60,
                coinsUsed: config.app.coinsPerMinute,
                coinsEarned: config.app.coinsPerMinute
              }
            });

            logger.info(`💰 Coin transfer: Men ${menUserId} (-${config.app.coinsPerMinute}) -> Women ${womanUserId} (+${config.app.coinsPerMinute})`);

            // Notify men about coin update
            menSocket.emit('coins_updated', { 
              coins: updatedMen.coins,
              deducted: config.app.coinsPerMinute
            });

            // Notify women about earnings
            socket.emit('coins_updated', { 
              coins: updatedWoman.coins,
              earned: config.app.coinsPerMinute
            });

            // Also emit call duration update
            const currentDuration = Math.floor((Date.now() - activeCallsMap.get(womanUserId.toString())?.startTime) / 1000);
            menSocket.emit('call_duration_update', { duration: currentDuration });
            socket.emit('call_duration_update', { duration: currentDuration });

          } catch (error) {
            logger.error('Coin deduction error:', error);
          }
        }, 60000); // Every 60 seconds

        // Store interval ID
        const activeCall = activeCallsMap.get(womanUserId.toString());
        if (activeCall) {
          activeCall.intervalId = coinInterval;
        }

        logger.info(`📞 Call ${callIdStr} connected between ${menUserId} and ${womanUserId}`);

      } catch (error) {
        logger.error('answer_call error:', error);
        socket.emit('call_failed', { message: 'Failed to answer call' });
      }
    });

    // ========== REJECT CALL ==========
    socket.on('reject_call', async (data) => {
      try {
        const { callId } = data;

        logger.info(`📞 Reject call: ${callId}`);

        const pendingCall = pendingCallsMap.get(callId);
        
        if (pendingCall) {
          if (pendingCall.timeout) {
            clearTimeout(pendingCall.timeout);
          }

          const menSocket = io.sockets.sockets.get(pendingCall.menSocketId);
          if (menSocket) {
            menSocket.emit('call_rejected', { callId, message: 'Call was rejected' });
            delete menSocket.pendingCallId;
          }

          pendingCallsMap.delete(callId);
        }

      } catch (error) {
        logger.error('reject_call error:', error);
      }
    });

    // ========== END CALL ==========
    socket.on('end_call', async (data) => {
      try {
        const { callId, reason = 'user_ended' } = data;

        logger.info(`📞 End call request: ${callId}, reason: ${reason}`);

        if (socket.activeCall) {
          const remoteSocket = io.sockets.sockets.get(socket.activeCall.remoteSocketId);
          await endCallAndNotify(io, socket.activeCall.callId, socket, remoteSocket, reason);
        }

      } catch (error) {
        logger.error('end_call error:', error);
      }
    });

    // ========== WEBRTC SIGNALING ==========
    
    // WebRTC Offer (from caller to receiver)
    socket.on('webrtc_offer', async (data) => {
      try {
        const { offer, targetUserId } = data;
        
        logger.info(`🎥 WebRTC offer from ${socket.userId} to ${targetUserId}`);

        const targetUser = await User.findById(targetUserId);
        if (targetUser?.socketId) {
          io.to(targetUser.socketId).emit('webrtc_offer', {
            offer,
            fromUserId: socket.userId
          });
        }

      } catch (error) {
        logger.error('webrtc_offer error:', error);
      }
    });

    // WebRTC Answer (from receiver to caller)
    socket.on('webrtc_answer', async (data) => {
      try {
        const { answer, targetUserId } = data;
        
        logger.info(`🎥 WebRTC answer from ${socket.userId} to ${targetUserId}`);

        const targetUser = await User.findById(targetUserId);
        if (targetUser?.socketId) {
          io.to(targetUser.socketId).emit('webrtc_answer', {
            answer,
            fromUserId: socket.userId
          });
        }

      } catch (error) {
        logger.error('webrtc_answer error:', error);
      }
    });

    // ICE Candidate exchange
    socket.on('ice_candidate', async (data) => {
      try {
        const { candidate, targetUserId } = data;
        
        // logger.info(`🧊 ICE candidate from ${socket.userId} to ${targetUserId}`);

        const targetUser = await User.findById(targetUserId);
        if (targetUser?.socketId) {
          io.to(targetUser.socketId).emit('ice_candidate', {
            candidate,
            fromUserId: socket.userId
          });
        }

      } catch (error) {
        logger.error('ice_candidate error:', error);
      }
    });

    // ========== DISCONNECT ==========
    socket.on('disconnect', async () => {
      try {
        logger.info(`Socket disconnected: ${socket.id}`);

        // Handle active call cleanup
        if (socket.activeCall) {
          const remoteSocket = io.sockets.sockets.get(socket.activeCall.remoteSocketId);
          await endCallAndNotify(io, socket.activeCall.callId, socket, remoteSocket, 'disconnected');
        }

        // Handle pending call cleanup
        if (socket.pendingCallId) {
          const pendingCall = pendingCallsMap.get(socket.pendingCallId);
          if (pendingCall?.timeout) {
            clearTimeout(pendingCall.timeout);
          }
          pendingCallsMap.delete(socket.pendingCallId);
        }

        // Update user online status
        if (socket.userId) {
          await User.findByIdAndUpdate(socket.userId, {
            isOnline: false,
            isAvailable: false,
            socketId: null
          });

          const availableWomen = await SocketService.getAvailableWomen();
          io.emit('women_list_updated', { women: availableWomen });
        }

      } catch (error) {
        logger.error('disconnect error:', error);
      }
    });

  });
};

export default setupSocketHandlers;