import Razorpay from 'razorpay';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { Transaction } from '../models/Transaction.model.js';
import { User } from '../models/User.model.js';
import { ApiError } from '../utils/apiError.js';
import { HTTP_STATUS, TRANSACTION_STATUS } from '../config/constants.js';
import { logger } from '../config/logger.js';

export class PaymentService {
  constructor() {
    this.razorpay = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }

  async createOrder(userId, amount, coins) {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
    if (user.role !== 'men') throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Only men can purchase');

    const options = {
      amount: amount * 100,
      currency: 'INR',
      receipt: `order_${Date.now()}`,
      payment_capture: 1,
      notes: { userId: userId.toString(), coins: coins.toString() },
    };

    try {
      const order = await this.razorpay.orders.create(options);

      await Transaction.create({
        userId,
        amount,
        coins,
        orderId: order.id,
        status: TRANSACTION_STATUS.PENDING,
      });

      logger.info(`Order created: ${order.id}`);

      return {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: config.razorpay.keyId,
      };
    } catch (error) {
      logger.error('Order creation failed:', error);
      throw new ApiError(HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Failed to create order');
    }
  }

  verifySignature(orderId, paymentId, signature) {
    const generated = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return generated === signature;
  }

  async verifyAndCreditCoins(orderId, paymentId, signature) {
    if (!this.verifySignature(orderId, paymentId, signature)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid signature');
    }

    const transaction = await Transaction.findOne({ orderId });
    if (!transaction) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Transaction not found');
    if (transaction.status === TRANSACTION_STATUS.SUCCESS) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Already processed');
    }

    transaction.paymentId = paymentId;
    transaction.status = TRANSACTION_STATUS.SUCCESS;
    await transaction.save();

    const user = await User.findByIdAndUpdate(
      transaction.userId,
      { $inc: { coins: transaction.coins } },
      { new: true }
    );

    logger.info(`Coins credited: ${transaction.coins} to ${transaction.userId}`);
    return { transaction, user };
  }

  async checkPaymentStatus(orderId) {
    try {
      const order = await this.razorpay.orders.fetch(orderId);
      const payments = await this.razorpay.orders.fetchPayments(orderId);
      
      const successfulPayment = payments.items?.find(
        p => p.status === 'captured' || p.status === 'authorized'
      );

      return {
        paid: order.status === 'paid' || !!successfulPayment,
        status: order.status,
        paymentId: successfulPayment?.id || null,
      };
    } catch (error) {
      logger.error('Check payment status error:', error);
      return { paid: false, status: 'unknown' };
    }
  }

  async processWithdrawal(withdrawal) {
    // Implement Razorpay Payouts in production
    return { id: `payout_${Date.now()}`, status: 'processed', amount: withdrawal.amount };
  }
}