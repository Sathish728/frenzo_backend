import mongoose from 'mongoose';
import { USER_ROLES } from '../config/constants.js';

const userSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    firebaseUid: {
      type: String,
      sparse: true,
    },
    authType: {
      type: String,
      enum: ['phone'],
      default: 'phone',
    },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    profileImage: {
      type: String,
      default: '/uploads/default-avatar.png',
    },
    coins: {
      type: Number,
      default: 0,
      min: 0,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isBanned: {
      type: Boolean,
      default: false,
    },
    reportCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    socketId: String,
    upiId: String,
    razorpayFundAccountId: String,
    lastLogin: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.socketId;
        delete ret.firebaseUid;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes
userSchema.index({ phone: 1 });
userSchema.index({ firebaseUid: 1 });
userSchema.index({ role: 1, isOnline: 1, isAvailable: 1, isBanned: 1 });

// Instance methods
userSchema.methods.toSafeObject = function () {
  const user = this.toObject();
  delete user.socketId;
  delete user.firebaseUid;
  return user;
};

userSchema.methods.addCoins = async function (amount) {
  this.coins += amount;
  return this.save();
};

userSchema.methods.deductCoins = async function (amount) {
  if (this.coins < amount) {
    throw new Error('Insufficient coins');
  }
  this.coins -= amount;
  return this.save();
};

userSchema.methods.incrementReports = async function () {
  this.reportCount += 1;
  if (this.reportCount >= 5) {
    this.isBanned = true;
  }
  return this.save();
};

export const User = mongoose.model('User', userSchema);