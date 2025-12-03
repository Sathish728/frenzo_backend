
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { Transaction } from '../models/Transaction.model.js';
import { User } from '../models/User.model.js';
import { ApiError } from '../utils/apiError.js';
import { HTTP_STATUS, TRANSACTION_STATUS } from '../config/constants.js';

export class PaymentService {
  constructor() {
    this.razorpay = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }

  async createOrder(userId, amount, coins) {
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
    }

    if (user.role !== 'men') {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        'Only men can purchase coins'
      );
    }

    const options = {
      amount: amount * 100, // Amount in paise
      currency: 'INR',
      receipt: `order_${Date.now()}`,
      notes: {
        userId: userId.toString(),
        coins: coins.toString(),
      },
    };

    const order = await this.razorpay.orders.create(options);

    // Create transaction record
    await Transaction.create({
      userId,
      amount,
      coins,
      orderId: order.id,
      status: TRANSACTION_STATUS.PENDING,
    });

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: config.razorpay.keyId,
    };
  }

  verifySignature(orderId, paymentId, signature) {
    const generatedSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    return generatedSignature === signature;
  }

  async verifyAndCreditCoins(orderId, paymentId, signature) {
    if (!this.verifySignature(orderId, paymentId, signature)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid payment signature');
    }

    const transaction = await Transaction.findOne({ orderId });

    if (!transaction) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Transaction not found');
    }

    if (transaction.status === TRANSACTION_STATUS.SUCCESS) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Transaction already processed');
    }

    // Update transaction
    transaction.paymentId = paymentId;
    transaction.status = TRANSACTION_STATUS.SUCCESS;
    await transaction.save();

    // Credit coins to user
    const user = await User.findByIdAndUpdate(
      transaction.userId,
      { $inc: { coins: transaction.coins } },
      { new: true }
    );

    return {
      transaction,
      user,
    };
  }

  async processWithdrawal(withdrawal) {
    try {
      // In production, implement Razorpay Payout API
      // For now, we'll simulate success
      
      const payout = {
        id: `payout_${Date.now()}`,
        status: 'processed',
        amount: withdrawal.amount,
      };

      return payout;
    } catch (error) {
      throw new ApiError(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        'Payout processing failed'
      );
    }
  }
}