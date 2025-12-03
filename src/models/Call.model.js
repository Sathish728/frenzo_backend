import mongoose from 'mongoose';
import { CALL_STATUS } from '../config/constants.js';

const callSchema = new mongoose.Schema(
  {
    menUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    womenUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    startTime: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endTime: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },
    coinsUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: Object.values(CALL_STATUS),
      default: CALL_STATUS.ONGOING,
    },
  },
  {
    timestamps: true,
  }
);

callSchema.index({ menUserId: 1, startTime: -1 });
callSchema.index({ womenUserId: 1, startTime: -1 });
callSchema.index({ status: 1, startTime: -1 });

// Virtual for call duration in minutes
callSchema.virtual('durationMinutes').get(function () {
  return Math.floor(this.duration / 60);
});

// Instance method to calculate duration
callSchema.methods.calculateDuration = function () {
  if (this.endTime && this.startTime) {
    this.duration = Math.floor((this.endTime - this.startTime) / 1000);
  }
  return this.duration;
};

export const Call = mongoose.model('Call', callSchema);