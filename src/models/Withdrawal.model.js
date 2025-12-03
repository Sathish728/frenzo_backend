import mongoose from 'mongoose';
import { WITHDRAWAL_STATUS } from '../config/constants.js';

const withdrawalSchema = new mongoose.Schema(
  {
    womenUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    coins: {
      type: Number,
      required: [true, 'Coins amount is required'],
      min: [1000, 'Minimum 1000 coins required'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [1, 'Amount must be at least 1'],
    },
    upiId: {
      type: String,
      required: [true, 'UPI ID is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(WITHDRAWAL_STATUS),
      default: WITHDRAWAL_STATUS.PENDING,
    },
    requestDate: {
      type: Date,
      default: Date.now,
    },
    processedDate: {
      type: Date,
      default: null,
    },
    payoutId: {
      type: String,
      default: null,
    },
    failureReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

withdrawalSchema.index({ womenUserId: 1, requestDate: -1 });
withdrawalSchema.index({ status: 1, requestDate: 1 });

export const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);