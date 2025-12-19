/**
 * Socket Handler for FrndZone - FULLY FIXED VERSION
 * 
 * CRITICAL FIXES:
 * 1. Fixed CALL_STATUS enum (was using ENDED which doesn't exist)
 * 2. Fixed WebRTC signaling order - receiver must be ready BEFORE caller sends offer
 * 3. Fixed socket userId tracking
 * 4. Fixed coin deduction timing
 * 5. Added proper error handling
 */

import { User } from '../models/User.model.js';
import { Call } from '../models/Call.model.js';
import { SocketService } from '../services/socket.service.js';
import { logger } from '../config/logger.js';
import { CALL_STATUS } from '../config/constants.js';
import { config } from '../config/env.js';

// Track active calls: visitorId -> { callId, menUserId, womanUserId, startTime, coinIntervalId }
const activeCallsMap = new Map();

// Track pending calls (ringing): tempCallId -> { menSocketId, menUserId, womanId, womanSocketId, timeout }
const pendingCallsMap = new Map();

// Track socket to user mapping
const socketToUserMap = new Map();
const userToSocketMap = new Map();

// Helper: Get socket by userId
const getSocketByUserId = (io, userId) => {
  const socketId = userToSocketMap.get(userId?.toString());
  if (socketId) {
    return io.sockets.sockets.get(socketId);
  }
  return null;
};

// Helper: End call and notify both parties
const endCallAndNotify = async (io, callId, reason = 'ended') => {
  try {
    const call = await Call.findById(callId);
    if (!call) {
      logger.warn(`Call ${callId} not found`);
      return;
    }

    // Use COMPLETED instead of ENDED (ENDED doesn't exist in schema!)
    if (call.status === CALL_STATUS.COMPLETED) {
      logger.info(`Call ${callId} already completed`);
      return;
    }

    const duration = Math.floor((Date.now() - new Date(call.startTime).getTime()) / 1000);
    const minutesUsed = Math.ceil(duration / 60);
    const coinsPerMinute = config.app?.coinsPerMinute || 40;
    const coinsUsed = minutesUsed * coinsPerMinute;

    // Update call record - use COMPLETED status
    await Call.findByIdAndUpdate(callId, {
      status: CALL_STATUS.COMPLETED,
      endTime: new Date(),
      duration: duration,
      coinsUsed: coinsUsed,
    });

    logger.info(`📞 Call ${callId} ended. Duration: ${duration}s, Coins: ${coinsUsed}, Reason: ${reason}`);

    // Clear active call tracking
    for (const [visitorId, callData] of activeCallsMap.entries()) {
      if (callData.callId === callId?.toString()) {
        if (callData.coinIntervalId) {
          clearInterval(callData.coinIntervalId);
        }
        activeCallsMap.delete(visitorId);
        break;
      }
    }

    // Get both users' sockets
    const menSocket = getSocketByUserId(io, call.menUserId);
    const womanSocket = getSocketByUserId(io, call.womenUserId);

    // Notify both parties
    const endPayload = { callId, reason, duration, coinsUsed };
    
    if (menSocket) {
      menSocket.emit('call_ended', endPayload);
      delete menSocket.activeCall;
    }
    
    if (womanSocket) {
      womanSocket.emit('call_ended', { ...endPayload, coinsEarned: coinsUsed });
      delete womanSocket.activeCall;
    }

    // Update available women list
    const availableWomen = await SocketService.getAvailableWomen();
    io.emit('women_list_updated', { women: availableWomen });

  } catch (error) {
    logger.error('endCallAndNotify error:', error);
  }
};

export const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    logger.info(`🔌 Socket connected: ${socket.id}`);

    // ========== USER ONLINE ==========
    socket.on('user_online', async (userId) => {
      try {
        if (!userId) {
          logger.warn('user_online called without userId');
          return;
        }

        // Store socket <-> user mapping
        socket.userId = userId;
        socketToUserMap.set(socket.id, userId);
        userToSocketMap.set(userId.toString(), socket.id);

        await SocketService.handleUserOnline(userId, socket.id);

        const availableWomen = await SocketService.getAvailableWomen();
        io.emit('women_list_updated', { women: availableWomen });
        
        logger.info(`👤 User ${userId} online with socket ${socket.id}`);
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
          logger.info(`👤 User ${userId} availability: ${isAvailable}`);
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
          await User.findByIdAndUpdate(
            socket.userId,
            { isAvailable, isOnline: isAvailable },
            { new: true }
          );

          const availableWomen = await SocketService.getAvailableWomen();
          io.emit('women_list_updated', { women: availableWomen });
        }
      } catch (error) {
        logger.error('set_availability error:', error);
      }
    });

    // ========== INITIATE CALL (Men calls Women) ==========
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

        const coinsPerMinute = config.app?.coinsPerMinute || 40;
        if (menUser.coins < coinsPerMinute) {
          socket.emit('insufficient_coins', { 
            message: `Need at least ${coinsPerMinute} coins to call`,
            required: coinsPerMinute,
            current: menUser.coins
          });
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

        // Get woman's socket
        const womanSocketId = userToSocketMap.get(womanId.toString());
        if (!womanSocketId) {
          socket.emit('call_failed', { message: 'User is not connected' });
          return;
        }

        // Check if woman is busy
        const existingCall = activeCallsMap.get(womanId.toString());
        if (existingCall) {
          socket.emit('user_busy', { message: 'User is busy on another call' });
          return;
        }

        const tempCallId = `call_${Date.now()}_${menUserId}_${womanId}`;

        // Send incoming call notification to woman
        io.to(womanSocketId).emit('incoming_call', {
          callId: tempCallId,
          caller: {
            _id: menUser._id,
            name: menUser.name,
            profileImage: menUser.profileImage,
          },
          menUserId: menUser._id.toString(),
          menName: menUser.name,
        });

        logger.info(`📞 Incoming call sent to ${womanId}, tempCallId: ${tempCallId}`);

        // Set 30 second timeout for no answer
        const callTimeout = setTimeout(() => {
          const pending = pendingCallsMap.get(tempCallId);
          if (pending) {
            logger.info(`📞 Call timeout: ${tempCallId}`);
            socket.emit('no_answer', { message: 'No answer' });
            
            const womanSock = io.sockets.sockets.get(pending.womanSocketId);
            if (womanSock) {
              womanSock.emit('call_missed', { callId: tempCallId });
            }
            
            pendingCallsMap.delete(tempCallId);
          }
        }, 30000);

        pendingCallsMap.set(tempCallId, {
          menSocketId: socket.id,
          menUserId: menUserId,
          womanId: womanId,
          womanSocketId: womanSocketId,
          timeout: callTimeout,
        });

        socket.pendingCallId = tempCallId;

      } catch (error) {
        logger.error('initiate_call error:', error);
        socket.emit('call_failed', { message: 'Failed to initiate call' });
      }
    });

    // ========== ANSWER CALL (Women answers) ==========
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

        // Create call record in database - status ONGOING
        const call = await Call.create({
          menUserId: menUserId,
          womenUserId: womanUserId,
          startTime: new Date(),
          status: CALL_STATUS.ONGOING,
        });

        const callIdStr = call._id.toString();

        // Mark woman as busy
        activeCallsMap.set(womanUserId.toString(), {
          callId: callIdStr,
          menUserId: menUserId.toString(),
          womanUserId: womanUserId.toString(),
          startTime: new Date(),
          coinIntervalId: null,
        });

        // Store call info on sockets
        socket.activeCall = { 
          callId: call._id, 
          remoteSocketId: menSocketId, 
          remoteUserId: menUserId,
          isCaller: false
        };
        menSocket.activeCall = { 
          callId: call._id, 
          remoteSocketId: socket.id, 
          remoteUserId: womanUserId,
          isCaller: true
        };

        delete menSocket.pendingCallId;

        // *** CRITICAL: Tell WOMAN to prepare WebRTC first ***
        // Woman (receiver) needs to be ready BEFORE caller sends offer
        socket.emit('prepare_webrtc', {
          callId: call._id,
          remoteUserId: menUserId.toString(),
          caller: {
            _id: menUser._id,
            name: menUser.name,
            profileImage: menUser.profileImage,
          }
        });

        // *** After 500ms, tell CALLER to create offer ***
        // This gives receiver time to setup peer connection
        setTimeout(() => {
          menSocket.emit('call_answered', { 
            callId: call._id,
            remoteUserId: womanUserId.toString(),
            woman: {
              _id: womanUser._id,
              name: womanUser.name,
              profileImage: womanUser.profileImage,
            },
            // Tell caller they should initiate WebRTC now
            shouldCreateOffer: true
          });
        }, 500);

        logger.info(`📞 Call ${callIdStr} - Woman preparing, Caller will be notified shortly`);

      } catch (error) {
        logger.error('answer_call error:', error);
        socket.emit('call_failed', { message: 'Failed to answer call' });
      }
    });

    // ========== WEBRTC READY (Woman signals she's ready for offer) ==========
    socket.on('webrtc_ready', async (data) => {
      try {
        const { callId } = data;
        
        if (!socket.activeCall) {
          logger.warn('webrtc_ready: No active call');
          return;
        }

        const menSocket = io.sockets.sockets.get(socket.activeCall.remoteSocketId);
        if (menSocket) {
          // Now tell caller to create and send the WebRTC offer
          menSocket.emit('create_offer', { callId });
          logger.info(`📞 Call ${callId}: Woman ready, telling caller to create offer`);
        }
      } catch (error) {
        logger.error('webrtc_ready error:', error);
      }
    });

    // ========== CALL CONNECTED (Both sides have audio) ==========
    socket.on('call_connected_ack', async (data) => {
      try {
        const { callId } = data;
        
        if (!socket.activeCall || socket.activeCall.callId.toString() !== callId) {
          return;
        }

        // If this is the first connection ack, start coin deduction
        const activeCall = activeCallsMap.get(socket.activeCall.remoteUserId?.toString()) ||
                          Array.from(activeCallsMap.values()).find(c => c.callId === callId);

        if (activeCall && !activeCall.coinIntervalId) {
          const coinsPerMinute = config.app?.coinsPerMinute || 40;
          
          logger.info(`📞 Call ${callId}: Starting coin deduction (${coinsPerMinute}/min)`);

          // Start coin deduction
          const coinInterval = setInterval(async () => {
            try {
              const call = await Call.findById(callId);
              if (!call || call.status !== CALL_STATUS.ONGOING) {
                clearInterval(coinInterval);
                return;
              }

              const currentMenUser = await User.findById(call.menUserId);
              
              if (!currentMenUser || currentMenUser.coins < coinsPerMinute) {
                logger.info(`💰 Insufficient coins for call ${callId}, ending call`);
                clearInterval(coinInterval);
                await endCallAndNotify(io, callId, 'insufficient_coins');
                return;
              }

              // Deduct from men
              const updatedMen = await User.findByIdAndUpdate(
                call.menUserId, 
                { $inc: { coins: -coinsPerMinute } },
                { new: true }
              );

              // Add to women
              const updatedWoman = await User.findByIdAndUpdate(
                call.womenUserId, 
                { $inc: { coins: coinsPerMinute } },
                { new: true }
              );

              // Update call record
              await Call.findByIdAndUpdate(callId, {
                $inc: { coinsUsed: coinsPerMinute }
              });

              logger.info(`💰 Coin transfer: Men ${call.menUserId} (-${coinsPerMinute}) -> Women ${call.womenUserId} (+${coinsPerMinute})`);

              // Notify men about coin update
              const menSock = getSocketByUserId(io, call.menUserId);
              if (menSock?.connected) {
                menSock.emit('coins_updated', { 
                  coins: updatedMen.coins,
                  deducted: coinsPerMinute
                });
              }

              // Notify women about earnings
              const womanSock = getSocketByUserId(io, call.womenUserId);
              if (womanSock?.connected) {
                womanSock.emit('coins_updated', { 
                  coins: updatedWoman.coins,
                  earned: coinsPerMinute
                });
              }

            } catch (error) {
              logger.error('Coin deduction error:', error);
            }
          }, 60000); // Every 60 seconds

          activeCall.coinIntervalId = coinInterval;
        }

        // Emit call_connected to both parties
        const remoteSocket = io.sockets.sockets.get(socket.activeCall.remoteSocketId);
        socket.emit('call_connected', { callId });
        if (remoteSocket) {
          remoteSocket.emit('call_connected', { callId });
        }

        logger.info(`📞 Call ${callId} fully connected`);

      } catch (error) {
        logger.error('call_connected_ack error:', error);
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

        logger.info(`📞 End call: ${callId}, reason: ${reason}`);

        if (socket.activeCall) {
          await endCallAndNotify(io, socket.activeCall.callId, reason);
        } else if (callId) {
          await endCallAndNotify(io, callId, reason);
        }

      } catch (error) {
        logger.error('end_call error:', error);
      }
    });

    // ========== WEBRTC SIGNALING ==========
    
    // WebRTC Offer (Caller -> Receiver)
    socket.on('webrtc_offer', async (data) => {
      try {
        const { offer, targetUserId } = data;
        
        logger.info(`🎥 WebRTC OFFER from ${socket.userId} to ${targetUserId}`);

        const targetSocketId = userToSocketMap.get(targetUserId?.toString());
        if (targetSocketId) {
          io.to(targetSocketId).emit('webrtc_offer', {
            offer,
            fromUserId: socket.userId,
          });
          logger.info(`🎥 WebRTC OFFER forwarded to ${targetUserId}`);
        } else {
          logger.warn(`🎥 Target user ${targetUserId} not connected`);
          socket.emit('call_failed', { message: 'Remote user disconnected' });
        }

      } catch (error) {
        logger.error('webrtc_offer error:', error);
      }
    });

    // WebRTC Answer (Receiver -> Caller)
    socket.on('webrtc_answer', async (data) => {
      try {
        const { answer, targetUserId } = data;
        
        logger.info(`🎥 WebRTC ANSWER from ${socket.userId} to ${targetUserId}`);

        const targetSocketId = userToSocketMap.get(targetUserId?.toString());
        if (targetSocketId) {
          io.to(targetSocketId).emit('webrtc_answer', {
            answer,
            fromUserId: socket.userId,
          });
          logger.info(`🎥 WebRTC ANSWER forwarded to ${targetUserId}`);
        } else {
          logger.warn(`🎥 Target user ${targetUserId} not connected`);
        }

      } catch (error) {
        logger.error('webrtc_answer error:', error);
      }
    });

    // ICE Candidate exchange
    socket.on('ice_candidate', async (data) => {
      try {
        const { candidate, targetUserId } = data;

        const targetSocketId = userToSocketMap.get(targetUserId?.toString());
        if (targetSocketId) {
          io.to(targetSocketId).emit('ice_candidate', {
            candidate,
            fromUserId: socket.userId,
          });
        }

      } catch (error) {
        logger.error('ice_candidate error:', error);
      }
    });

    // ========== HEARTBEAT ==========
    socket.on('ping', () => {
      socket.emit('pong');
    });

    // ========== DISCONNECT ==========
    socket.on('disconnect', async () => {
      try {
        logger.info(`🔌 Socket disconnected: ${socket.id}`);

        // Handle active call cleanup
        if (socket.activeCall) {
          await endCallAndNotify(io, socket.activeCall.callId, 'disconnected');
        }

        // Handle pending call cleanup
        if (socket.pendingCallId) {
          const pendingCall = pendingCallsMap.get(socket.pendingCallId);
          if (pendingCall?.timeout) {
            clearTimeout(pendingCall.timeout);
          }
          pendingCallsMap.delete(socket.pendingCallId);
        }

        // Remove socket mappings
        const userId = socketToUserMap.get(socket.id);
        if (userId) {
          userToSocketMap.delete(userId.toString());
        }
        socketToUserMap.delete(socket.id);

        // Update user online status
        if (socket.userId) {
          await User.findByIdAndUpdate(socket.userId, {
            isOnline: false,
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