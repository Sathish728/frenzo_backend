import { User } from '../models/User.model.js';
import { Call } from '../models/Call.model.js';
import { CallService } from '../services/call.service.js';
import { SocketService } from '../services/socket.service.js';
import { logger } from '../config/logger.js';
import { CALL_STATUS } from '../config/constants.js';

const callService = new CallService();

// Track active calls in memory for quick lookup
const activeCallsMap = new Map(); // womanId -> { callId, menUserId, startTime }

export const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // User goes online
    socket.on('user_online', async (userId) => {
      try {
        await SocketService.handleUserOnline(userId, socket.id);
        
        // Store userId on socket for later use
        socket.userId = userId;

        // Broadcast updated women list to all men
        const availableWomen = await SocketService.getAvailableWomen();
        io.emit('women_list_updated', { women: availableWomen });
        
        logger.info(`User ${userId} is online with socket ${socket.id}`);
      } catch (error) {
        logger.error('user_online error:', error);
      }
    });

    // Toggle availability (for women)
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

        // Broadcast updated women list
        const availableWomen = await SocketService.getAvailableWomen();
        io.emit('women_list_updated', { women: availableWomen });
      } catch (error) {
        logger.error('toggle_availability error:', error);
      }
    });

    // Set availability via socket
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

          // Broadcast updated women list
          const availableWomen = await SocketService.getAvailableWomen();
          io.emit('women_list_updated', { women: availableWomen });
        }
      } catch (error) {
        logger.error('set_availability error:', error);
      }
    });

    // ========== CALL FLOW ==========

    // Men initiates call to woman
    socket.on('initiate_call', async (data) => {
      try {
        const { womanId } = data;
        const menUserId = socket.userId;

        if (!menUserId) {
          socket.emit('call_failed', { message: 'Not authenticated' });
          return;
        }

        const menUser = await User.findById(menUserId);
        const womanUser = await User.findById(womanId);

        // Validate men user
        if (!menUser) {
          socket.emit('call_failed', { message: 'User not found' });
          return;
        }

        // Check coins (minimum for 1 minute)
        if (menUser.coins < 40) {
          socket.emit('insufficient_coins', { message: 'Need at least 40 coins to call' });
          return;
        }

        // Validate woman user
        if (!womanUser) {
          socket.emit('call_failed', { message: 'User not available' });
          return;
        }

        // Check if woman is online and available
        if (!womanUser.isOnline || !womanUser.isAvailable) {
          socket.emit('call_failed', { message: 'User is offline or unavailable' });
          return;
        }

        // Check if woman has a socket connection
        if (!womanUser.socketId) {
          socket.emit('call_failed', { message: 'User is not connected' });
          return;
        }

        // *** CHECK IF WOMAN IS BUSY ON ANOTHER CALL ***
        const existingCall = activeCallsMap.get(womanId);
        if (existingCall) {
          socket.emit('user_busy', { 
            message: 'User is busy on another call',
            busyWith: existingCall.menUserId 
          });
          logger.info(`Woman ${womanId} is busy, rejecting call from ${menUserId}`);
          return;
        }

        // Also check database for ongoing calls
        const ongoingCall = await Call.findOne({
          womenUserId: womanId,
          status: CALL_STATUS.ONGOING
        });

        if (ongoingCall) {
          socket.emit('user_busy', { message: 'User is busy on another call' });
          logger.info(`Woman ${womanId} has ongoing call in DB`);
          return;
        }

        // Generate a temporary call ID for tracking
        const tempCallId = `call_${Date.now()}_${menUserId}_${womanId}`;

        // Send incoming call to woman with CORRECT structure
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

        // Store pending call
        socket.pendingCall = {
          tempCallId,
          womanId,
          womanSocketId: womanUser.socketId,
        };

        logger.info(`Call initiated: ${menUserId} -> ${womanId}, tempCallId: ${tempCallId}`);

        // Set a timeout for call rejection (30 seconds)
        setTimeout(async () => {
          if (socket.pendingCall?.tempCallId === tempCallId) {
            socket.emit('call_failed', { message: 'No answer' });
            delete socket.pendingCall;
            logger.info(`Call timeout: ${tempCallId}`);
          }
        }, 30000);

      } catch (error) {
        logger.error('initiate_call error:', error);
        socket.emit('call_failed', { message: 'Failed to initiate call' });
      }
    });

    // Woman answers call
    socket.on('answer_call', async (data) => {
      try {
        const { callId } = data;
        const womanUserId = socket.userId;

        if (!womanUserId) {
          socket.emit('call_failed', { message: 'Not authenticated' });
          return;
        }

        // Find the men's socket that initiated this call
        let menSocket = null;
        let menUserId = null;

        for (const [socketId, s] of io.sockets.sockets) {
          if (s.pendingCall?.tempCallId === callId) {
            menSocket = s;
            menUserId = s.userId;
            break;
          }
        }

        if (!menSocket) {
          socket.emit('call_failed', { message: 'Call no longer available' });
          return;
        }

        const menUser = await User.findById(menUserId);
        const womanUser = await User.findById(womanUserId);

        if (!menUser || !womanUser) {
          socket.emit('call_failed', { message: 'Users not found' });
          return;
        }

        // Create call record in database
        const call = await callService.createCall(menUserId, womanUserId);

        // Mark woman as busy
        activeCallsMap.set(womanUserId.toString(), {
          callId: call._id.toString(),
          menUserId: menUserId.toString(),
          startTime: new Date()
        });

        // Clear pending call
        delete menSocket.pendingCall;

        // Store call info on both sockets
        socket.activeCall = { callId: call._id, remoteSocketId: menSocket.id };
        menSocket.activeCall = { callId: call._id, remoteSocketId: socket.id };

        // Notify both parties
        menSocket.emit('call_answered', { 
          callId: call._id,
          woman: {
            _id: womanUser._id,
            name: womanUser.name,
            profileImage: womanUser.profileImage,
          }
        });

        socket.emit('call_connected', {
          callId: call._id,
          caller: {
            _id: menUser._id,
            name: menUser.name,
            profileImage: menUser.profileImage,
          }
        });

        // Start coin deduction
        callService.startCoinDeduction(call._id, menUserId, womanUserId, io);

        logger.info(`Call answered: ${call._id}, ${menUserId} <-> ${womanUserId}`);

      } catch (error) {
        logger.error('answer_call error:', error);
        socket.emit('call_failed', { message: error.message || 'Failed to answer call' });
      }
    });

    // Reject call
    socket.on('reject_call', async (data) => {
      try {
        const { callId } = data;

        // Find men's socket
        for (const [socketId, s] of io.sockets.sockets) {
          if (s.pendingCall?.tempCallId === callId) {
            s.emit('call_rejected', { message: 'Call was declined' });
            delete s.pendingCall;
            break;
          }
        }

        logger.info(`Call rejected: ${callId}`);

      } catch (error) {
        logger.error('reject_call error:', error);
      }
    });

    // End call
    socket.on('end_call', async (data) => {
      try {
        const { callId } = data;
        
        if (callId) {
          const call = await callService.endCall(callId, io);
          
          if (call) {
            // Remove from active calls map
            activeCallsMap.delete(call.womenUserId.toString());
          }
        }

        // Also check socket's active call
        if (socket.activeCall) {
          const { callId: activeCallId, remoteSocketId } = socket.activeCall;
          
          // Notify remote party
          const remoteSocket = io.sockets.sockets.get(remoteSocketId);
          if (remoteSocket) {
            remoteSocket.emit('call_ended', { 
              reason: 'remote_ended',
              callId: activeCallId 
            });
            delete remoteSocket.activeCall;
          }

          delete socket.activeCall;
        }

        logger.info(`Call ended: ${callId}`);

      } catch (error) {
        logger.error('end_call error:', error);
      }
    });

    // Legacy call_request handler for compatibility
    socket.on('call_request', async (data) => {
      // Redirect to new handler
      socket.emit('initiate_call', { womanId: data.womenUserId });
    });

    // Legacy call_accepted handler
    socket.on('call_accepted', async (data) => {
      socket.emit('answer_call', { callId: data.callId || data.tempCallId });
    });

    // ICE candidate exchange (for WebRTC if implemented)
    socket.on('ice_candidate', async (data) => {
      try {
        const { targetUserId, candidate } = data;
        const targetUser = await User.findById(targetUserId);

        if (targetUser?.socketId) {
          io.to(targetUser.socketId).emit('ice_candidate', { 
            candidate,
            from: socket.userId 
          });
        }
      } catch (error) {
        logger.error('ice_candidate error:', error);
      }
    });

    // WebRTC offer
    socket.on('webrtc_offer', async (data) => {
      try {
        const { targetUserId, offer } = data;
        const targetUser = await User.findById(targetUserId);

        if (targetUser?.socketId) {
          io.to(targetUser.socketId).emit('webrtc_offer', { 
            offer,
            from: socket.userId 
          });
        }
      } catch (error) {
        logger.error('webrtc_offer error:', error);
      }
    });

    // WebRTC answer
    socket.on('webrtc_answer', async (data) => {
      try {
        const { targetUserId, answer } = data;
        const targetUser = await User.findById(targetUserId);

        if (targetUser?.socketId) {
          io.to(targetUser.socketId).emit('webrtc_answer', { 
            answer,
            from: socket.userId 
          });
        }
      } catch (error) {
        logger.error('webrtc_answer error:', error);
      }
    });

    // User disconnects
    socket.on('disconnect', async () => {
      try {
        // Handle any active call
        if (socket.activeCall) {
          const { callId, remoteSocketId } = socket.activeCall;
          
          // End the call
          if (callId) {
            const call = await callService.endCall(callId, io);
            if (call) {
              activeCallsMap.delete(call.womenUserId.toString());
            }
          }

          // Notify remote party
          const remoteSocket = io.sockets.sockets.get(remoteSocketId);
          if (remoteSocket) {
            remoteSocket.emit('call_ended', { 
              reason: 'disconnected',
              callId 
            });
            delete remoteSocket.activeCall;
          }
        }

        // Handle pending call
        if (socket.pendingCall) {
          // Notify woman that caller disconnected
          io.to(socket.pendingCall.womanSocketId).emit('call_ended', {
            reason: 'caller_disconnected'
          });
        }

        // Handle user going offline
        await SocketService.handleUserOffline(socket.id);

        // If this was a woman, remove from active calls
        if (socket.userId) {
          activeCallsMap.delete(socket.userId.toString());
        }

        // Broadcast updated women list
        const availableWomen = await SocketService.getAvailableWomen();
        io.emit('women_list_updated', { women: availableWomen });

        logger.info(`Socket disconnected: ${socket.id}`);
      } catch (error) {
        logger.error('disconnect error:', error);
      }
    });
  });
};
