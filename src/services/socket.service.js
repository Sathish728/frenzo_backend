import { User } from '../models/User.model.js';
import { logger } from '../config/logger.js';

export class SocketService {
  static async handleUserOnline(userId, socketId) {
    try {
      await User.findByIdAndUpdate(userId, {
        isOnline: true,
        socketId,
      });

      logger.info(`User ${userId} is now online`);
    } catch (error) {
      logger.error('User online error:', error);
    }
  }

  static async handleUserOffline(socketId) {
    try {
      const user = await User.findOneAndUpdate(
        { socketId },
        { isOnline: false, socketId: null }
      );

      if (user) {
        logger.info(`User ${user._id} is now offline`);
      }
    } catch (error) {
      logger.error('User offline error:', error);
    }
  }

  static async getAvailableWomen() {
    return User.find({
      role: 'women',
      isOnline: true,
      isAvailable: true,
      isBanned: false,
    }).select('name profileImage isOnline');
  }
}