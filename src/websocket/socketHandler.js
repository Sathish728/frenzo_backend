import { User } from '../models/User.model.js';
import { CallService } from '../services/call.service.js';
import { SocketService } from '../services/socket.service.js';
import { logger } from '../config/logger.js';

const callService = new CallService();

export const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // User goes online
    socket.on('user_online', async (userId) => {
      try {
        await SocketService.handleUserOnline(userId, socket.id);

        // Broadcast updated women list
        const availableWomen = await SocketService.getAvailableWomen();
        io.emit('women_list_updated', availableWomen);
      } catch (error) {
        logger.error('user_online error:', error);
      }
    });

    // Toggle availability
    socket.on('toggle_availability', async ({ userId, isAvailable }) => {
      try {
        await User.findByIdAndUpdate(userId, { isAvailable });

        const availableWomen = await SocketService.getAvailableWomen();
        io.emit('women_list_updated', availableWomen);
      } catch (error) {
        logger.error('toggle_availability error:', error);
      }
    });

    // Call request
    socket.on('call_request', async (data) => {
      try {
        const { menUserId, womenUserId, offer } = data;

        const menUser = await User.findById(menUserId);
        const womenUser = await User.findById(womenUserId);

        if (!menUser || menUser.coins < 40) {
          socket.emit('call_failed', { message: 'Insufficient coins' });
          return;
        }

        if (!womenUser || !womenUser.socketId || !womenUser.isAvailable) {
          socket.emit('call_failed', { message: 'User not available' });
          return;
        }

        io.to(womenUser.socketId).emit('incoming_call', {
          menUserId,
          menName: menUser.name,
          offer,
        });

        logger.info(`Call request: ${menUserId} → ${womenUserId}`);
      } catch (error) {
        logger.error('call_request error:', error);
        socket.emit('call_failed', { message: 'Call failed' });
      }
    });

    // Call accepted
    socket.on('call_accepted', async (data) => {
      try {
        const { menUserId, womenUserId, answer } = data;

        const call = await callService.createCall(menUserId, womenUserId);
        const menUser = await User.findById(menUserId);

        io.to(menUser.socketId).emit('call_answered', {
          callId: call._id,
          answer,
        });

        // Start coin deduction
        callService.startCoinDeduction(call._id, menUserId, womenUserId, io);

        logger.info(`Call accepted: ${call._id}`);
      } catch (error) {
        logger.error('call_accepted error:', error);
        socket.emit('call_failed', { message: error.message });
      }
    });

    // ICE candidate
    socket.on('ice_candidate', async (data) => {
      try {
        const { targetUserId, candidate } = data;
        const targetUser = await User.findById(targetUserId);

        if (targetUser?.socketId) {
          io.to(targetUser.socketId).emit('ice_candidate', { candidate });
        }
      } catch (error) {
        logger.error('ice_candidate error:', error);
      }
    });

    // Call ended
    socket.on('call_ended', async (data) => {
      try {
        const { callId } = data;
        await callService.endCall(callId, io);
      } catch (error) {
        logger.error('call_ended error:', error);
      }
    });

    // User disconnects
    socket.on('disconnect', async () => {
      try {
        await SocketService.handleUserOffline(socket.id);

        const availableWomen = await SocketService.getAvailableWomen();
        io.emit('women_list_updated', availableWomen);

        logger.info(`Socket disconnected: ${socket.id}`);
      } catch (error) {
        logger.error('disconnect error:', error);
      }
    });
  });
};