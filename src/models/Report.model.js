import mongoose from 'mongoose';
import { REPORT_STATUS } from '../config/constants.js';

const reportSchema = new mongoose.Schema(
  {
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reportedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: [true, 'Report reason is required'],
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters'],
    },
    status: {
      type: String,
      enum: Object.values(REPORT_STATUS),
      default: REPORT_STATUS.PENDING,
    },
  },
  {
    timestamps: true,
  }
);

reportSchema.index({ reportedUserId: 1, createdAt: -1 });
reportSchema.index({ reporterId: 1, reportedUserId: 1 }, { unique: true });

export const Report = mongoose.model('Report', reportSchema);