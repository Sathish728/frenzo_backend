import { Transaction } from '../models/Transaction.model.js';
import { User } from '../models/User.model.js';
import { PaymentService } from '../services/payment.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { HTTP_STATUS, COIN_PACKAGES } from '../config/constants.js';
import { helpers } from '../utils/helpers.js';
import { logger } from '../config/logger.js';

const paymentService = new PaymentService();

export class PaymentController {
  static async getPackages(req, res, next) {
    try {
      const packages = COIN_PACKAGES.map((pkg, index) => ({
        id: index + 1,
        ...pkg,
      }));
      
      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(HTTP_STATUS.OK, { packages }, 'Packages retrieved')
      );
    } catch (error) {
      next(error);
    }
  }

  static async createOrder(req, res, next) {
    try {
      const { amount, coins } = req.body;
      const userId = req.userId;

      const user = await User.findById(userId);
      if (!user) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
      if (user.role !== 'men') throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Only men can purchase');

      const order = await paymentService.createOrder(userId, amount, coins);
      logger.info(`Order created: ${order.orderId} for user ${userId}`);

      res.status(HTTP_STATUS.CREATED).json(
        new ApiResponse(HTTP_STATUS.CREATED, order, 'Order created')
      );
    } catch (error) {
      next(error);
    }
  }

  static async verifyPayment(req, res, next) {
    try {
      const { orderId, paymentId, signature } = req.body;
      const result = await paymentService.verifyAndCreditCoins(orderId, paymentId, signature);

      logger.info(`Payment verified: ${orderId}`);

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(HTTP_STATUS.OK, {
          success: true,
          coins: result.user.coins,
          transaction: result.transaction,
        }, 'Payment verified')
      );
    } catch (error) {
      next(error);
    }
  }

  static async verifyUPIPayment(req, res, next) {
    try {
      const { orderId } = req.body;
      const transaction = await Transaction.findOne({ orderId });
      
      if (!transaction) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Transaction not found');

      if (transaction.status === 'success') {
        return res.status(HTTP_STATUS.OK).json(
          new ApiResponse(HTTP_STATUS.OK, { success: true }, 'Already processed')
        );
      }

      const paymentStatus = await paymentService.checkPaymentStatus(orderId);

      if (paymentStatus.paid) {
        transaction.status = 'success';
        transaction.paymentId = paymentStatus.paymentId;
        await transaction.save();

        const user = await User.findByIdAndUpdate(
          transaction.userId,
          { $inc: { coins: transaction.coins } },
          { new: true }
        );

        logger.info(`UPI verified: ${orderId}, coins: ${transaction.coins}`);

        return res.status(HTTP_STATUS.OK).json(
          new ApiResponse(HTTP_STATUS.OK, {
            success: true,
            coins: user.coins,
            coinsAdded: transaction.coins,
          }, 'Payment verified')
        );
      }

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(HTTP_STATUS.OK, { success: false, status: paymentStatus.status }, 'Not confirmed')
      );
    } catch (error) {
      next(error);
    }
  }

  static async checkPaymentStatus(req, res, next) {
    try {
      const { orderId } = req.params;
      const transaction = await Transaction.findOne({ orderId });
      
      if (!transaction) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Transaction not found');

      if (transaction.status === 'pending') {
        const paymentStatus = await paymentService.checkPaymentStatus(orderId);
        return res.status(HTTP_STATUS.OK).json(
          new ApiResponse(HTTP_STATUS.OK, {
            status: paymentStatus.paid ? 'success' : transaction.status,
            transaction,
          }, 'Status retrieved')
        );
      }

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(HTTP_STATUS.OK, { status: transaction.status, transaction }, 'Status retrieved')
      );
    } catch (error) {
      next(error);
    }
  }

  static async getTransactionHistory(req, res, next) {
    try {
      const { page, limit, skip } = helpers.getPaginationParams(req.query.page, req.query.limit);

      const [transactions, total] = await Promise.all([
        Transaction.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(limit).skip(skip),
        Transaction.countDocuments({ userId: req.userId }),
      ]);

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(HTTP_STATUS.OK, {
          transactions,
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        }, 'History retrieved')
      );
    } catch (error) {
      next(error);
    }
  }
}