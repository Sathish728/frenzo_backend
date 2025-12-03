
import { Withdrawal } from '../models/Withdrawal.model.js';
import { User } from '../models/User.model.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { HTTP_STATUS } from '../config/constants.js';
import { helpers } from '../utils/helpers.js';
import { logger } from '../config/logger.js';

export class WithdrawalController {
  static async requestWithdrawal(req, res, next) {
    try {
      const { upiId } = req.body;

      const user = await User.findById(req.userId);

      if (user.role !== 'women') {
        throw new ApiError(
          HTTP_STATUS.FORBIDDEN,
          'Only women can request withdrawals'
        );
      }

      if (user.coins < 1000) {
        throw new ApiError(
          HTTP_STATUS.BAD_REQUEST,
          'Minimum 1000 coins required for withdrawal'
        );
      }

      const amount = helpers.coinsToMoney(user.coins);

      const withdrawal = await Withdrawal.create({
        womenUserId: req.userId,
        coins: user.coins,
        amount,
        upiId,
      });

      logger.info(`Withdrawal requested by user ${req.userId}: ₹${amount}`);

      res.status(HTTP_STATUS.CREATED).json(
        new ApiResponse(
          HTTP_STATUS.CREATED,
          withdrawal,
          'Withdrawal requested. Will be processed weekly on Sunday.'
        )
      );
    } catch (error) {
      next(error);
    }
  }

  static async getWithdrawalHistory(req, res, next) {
    try {
      const { page, limit, skip } = helpers.getPaginationParams(
        req.query.page,
        req.query.limit
      );

      const [withdrawals, total] = await Promise.all([
        Withdrawal.find({ womenUserId: req.userId })
          .sort({ requestDate: -1 })
          .limit(limit)
          .skip(skip),
        Withdrawal.countDocuments({ womenUserId: req.userId }),
      ]);

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          HTTP_STATUS.OK,
          {
            withdrawals,
            pagination: {
              page,
              limit,
              total,
              totalPages: Math.ceil(total / limit),
            },
          },
          'Withdrawal history retrieved'
        )
      );
    } catch (error) {
      next(error);
    }
  }

  static async getEarnings(req, res, next) {
    try {
      const user = await User.findById(req.userId);

      if (user.role !== 'women') {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Only for women');
      }

      const totalWithdrawals = await Withdrawal.aggregate([
        {
          $match: {
            womenUserId: user._id,
            status: 'completed',
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            totalCoins: { $sum: '$coins' },
          },
        },
      ]);

      const currentEarnings = helpers.coinsToMoney(user.coins);

      const result = {
        currentCoins: user.coins,
        currentEarnings,
        totalWithdrawn: totalWithdrawals[0]?.totalAmount || 0,
        totalLifetimeCoins:
          (totalWithdrawals[0]?.totalCoins || 0) + user.coins,
        canWithdraw: user.coins >= 1000,
      };

      res
        .status(HTTP_STATUS.OK)
        .json(
          new ApiResponse(HTTP_STATUS.OK, result, 'Earnings retrieved')
        );
    } catch (error) {
      next(error);
    }
  }
}