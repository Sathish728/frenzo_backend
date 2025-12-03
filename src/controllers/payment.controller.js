import { Transaction } from '../models/Transaction.model.js';
import { PaymentService } from '../services/payment.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { HTTP_STATUS, COIN_PACKAGES } from '../config/constants.js';
import { helpers } from '../utils/helpers.js';
import { logger } from '../config/logger.js';

const paymentService = new PaymentService();

export class PaymentController {
  static async getPackages(req, res, next) {
    try {
      res
        .status(HTTP_STATUS.OK)
        .json(
          new ApiResponse(HTTP_STATUS.OK, COIN_PACKAGES, 'Packages retrieved')
        );
    } catch (error) {
      next(error);
    }
  }

  static async createOrder(req, res, next) {
    try {
      const { amount, coins } = req.body;

      const order = await paymentService.createOrder(
        req.userId,
        amount,
        coins
      );

      logger.info(`Order created for user ${req.userId}: ${order.orderId}`);

      res
        .status(HTTP_STATUS.CREATED)
        .json(
          new ApiResponse(HTTP_STATUS.CREATED, order, 'Order created')
        );
    } catch (error) {
      next(error);
    }
  }

  static async verifyPayment(req, res, next) {
    try {
      const { orderId, paymentId, signature } = req.body;

      const result = await paymentService.verifyAndCreditCoins(
        orderId,
        paymentId,
        signature
      );

      logger.info(`Payment verified for order ${orderId}`);

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          HTTP_STATUS.OK,
          {
            coins: result.user.coins,
            transaction: result.transaction,
          },
          'Payment verified successfully'
        )
      );
    } catch (error) {
      next(error);
    }
  }

  static async getTransactionHistory(req, res, next) {
    try {
      const { page, limit, skip } = helpers.getPaginationParams(
        req.query.page,
        req.query.limit
      );

      const [transactions, total] = await Promise.all([
        Transaction.find({ userId: req.userId })
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip(skip),
        Transaction.countDocuments({ userId: req.userId }),
      ]);

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          HTTP_STATUS.OK,
          {
            transactions,
            pagination: {
              page,
              limit,
              total,
              totalPages: Math.ceil(total / limit),
            },
          },
          'Transaction history retrieved'
        )
      );
    } catch (error) {
      next(error);
    }
  }
}