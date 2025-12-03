import { Call } from '../models/Call.model.js';
import { User } from '../models/User.model.js';
import { ApiError } from '../utils/apiError.js';
import { HTTP_STATUS, CALL_STATUS } from '../config/constants.js';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

export class CallService {
  constructor() {
    this.activeCallTimers = new Map();
  }

  async createCall(menUserId, womenUserId) {
    const menUser = await User.findById(menUserId);
    const womenUser = await User.findById(womenUserId);

    if (!menUser || menUser.role !== 'men') {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid caller');
    }

    if (!womenUser || womenUser.role !== 'women') {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid receiver');
    }

    if (menUser.coins < config.app.coinsPerMinute) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Insufficient coins');
    }

    if (!womenUser.isOnline || !womenUser.isAvailable) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'User not available');
    }

    const call = await Call.create({
      menUserId,
      womenUserId,
      startTime: new Date(),
      status: CALL_STATUS.ONGOING,
    });

    return call;
  }

  startCoinDeduction(callId, menUserId, womenUserId, io) {
    const intervalMs = 60000; // 1 minute

    const timer = setInterval(async () => {
      try {
        const menUser = await User.findById(menUserId);
        
        if (!menUser || menUser.coins < config.app.coinsPerMinute) {
          // Insufficient coins, end call
          clearInterval(timer);
          this.activeCallTimers.delete(callId.toString());
          await this.endCall(callId, io);
          
          if (menUser?.socketId) {
            io.to(menUser.socketId).emit('call_ended', {
              reason: 'insufficient_coins',
            });
          }
          return;
        }

        // Deduct coins from men
        await User.findByIdAndUpdate(menUserId, {
          $inc: { coins: -config.app.coinsPerMinute },
        });

        // Add coins to women
        await User.findByIdAndUpdate(womenUserId, {
          $inc: { coins: config.app.coinsPerMinute },
        });

        // Update call record
        await Call.findByIdAndUpdate(callId, {
          $inc: { coinsUsed: config.app.coinsPerMinute },
        });

        // Notify users
        const [updatedMenUser, updatedWomenUser] = await Promise.all([
          User.findById(menUserId),
          User.findById(womenUserId),
        ]);

        if (updatedMenUser?.socketId) {
          io.to(updatedMenUser.socketId).emit('coins_updated', {
            coins: updatedMenUser.coins,
          });
        }

        if (updatedWomenUser?.socketId) {
          io.to(updatedWomenUser.socketId).emit('coins_updated', {
            coins: updatedWomenUser.coins,
          });
        }

        logger.info(`Coins deducted for call ${callId}: ${config.app.coinsPerMinute}`);
      } catch (error) {
        logger.error('Coin deduction error:', error);
        clearInterval(timer);
        this.activeCallTimers.delete(callId.toString());
      }
    }, intervalMs);

    this.activeCallTimers.set(callId.toString(), timer);
  }

  async endCall(callId, io) {
    try {
      const call = await Call.findById(callId);
      
      if (!call || call.status === CALL_STATUS.COMPLETED) {
        return;
      }

      const endTime = new Date();
      const duration = Math.floor((endTime - call.startTime) / 1000);

      call.endTime = endTime;
      call.duration = duration;
      call.status = CALL_STATUS.COMPLETED;
      await call.save();

      // Clear timer
      const timer = this.activeCallTimers.get(callId.toString());
      if (timer) {
        clearInterval(timer);
        this.activeCallTimers.delete(callId.toString());
      }

      // Notify both users
      const [menUser, womenUser] = await Promise.all([
        User.findById(call.menUserId),
        User.findById(call.womenUserId),
      ]);

      if (menUser?.socketId) {
        io.to(menUser.socketId).emit('call_completed', { duration });
      }

      if (womenUser?.socketId) {
        io.to(womenUser.socketId).emit('call_completed', { duration });
      }

      logger.info(`Call ${callId} completed. Duration: ${duration}s`);
      return call;
    } catch (error) {
      logger.error('End call error:', error);
      throw error;
    }
  }

  getICEServers() {
    return {
      iceServers: [
        { urls: config.webrtc.stunUrl },
        ...(config.webrtc.turnUrl
          ? [
              {
                urls: config.webrtc.turnUrl,
                username: config.webrtc.turnUsername,
                credential: config.webrtc.turnPassword,
              },
            ]
          : []),
      ],
    };
  }
}