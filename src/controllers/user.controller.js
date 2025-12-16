import { User } from '../models/User.model.js';
import { Report } from '../models/Report.model.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { HTTP_STATUS } from '../config/constants.js';
import { logger } from '../config/logger.js';

export class UserController {
  static async getProfile(req, res, next) {
    try {
      const user = await User.findById(req.userId).select('-socketId');

      if (!user) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
      }

      res
        .status(HTTP_STATUS.OK)
        .json(new ApiResponse(HTTP_STATUS.OK, user, 'Profile retrieved'));
    } catch (error) {
      next(error);
    }
  }

  static async updateProfile(req, res, next) {
    try {
      const { name, upiId } = req.body;
      const updates = {};

      if (name) updates.name = name;
      if (upiId) updates.upiId = upiId;
      if (req.file) updates.profileImage = `/uploads/${req.file.filename}`;

      const user = await User.findByIdAndUpdate(
        req.userId,
        updates,
        { new: true, runValidators: true }
      ).select('-socketId');

      logger.info(`Profile updated for user ${req.userId}`);

      res
        .status(HTTP_STATUS.OK)
        .json(new ApiResponse(HTTP_STATUS.OK, user, 'Profile updated'));
    } catch (error) {
      next(error);
    }
  }

  // FIXED: Show women who have isAvailable=true
  // isOnline shows their real-time status (can call only if online)
  static async getAvailableWomen(req, res, next) {
    try {
      const women = await User.find({
        role: 'women',
        isAvailable: true,  // Removed isOnline requirement - show all available
        isBanned: false,
      }).select('name profileImage isOnline isAvailable');

      // Return as 'data' array for frontend compatibility
      res
        .status(HTTP_STATUS.OK)
        .json(
          new ApiResponse(HTTP_STATUS.OK, { women }, 'Available women retrieved')
        );
    } catch (error) {
      next(error);
    }
  }

  static async toggleAvailability(req, res, next) {
    try {
      const { isAvailable } = req.body;

      const user = await User.findById(req.userId);

      if (user.role !== 'women') {
        throw new ApiError(
          HTTP_STATUS.FORBIDDEN,
          'Only women can toggle availability'
        );
      }

      user.isAvailable = isAvailable;
      // Also set isOnline when toggling availability
      user.isOnline = isAvailable;
      await user.save();

      logger.info(`User ${req.userId} availability: ${isAvailable}`);

      res
        .status(HTTP_STATUS.OK)
        .json(
          new ApiResponse(
            HTTP_STATUS.OK,
            { isAvailable, isOnline: user.isOnline },
            'Availability updated'
          )
        );
    } catch (error) {
      next(error);
    }
  }

  static async reportUser(req, res, next) {
    try {
      const { userId, reason } = req.body;

      // Check if already reported
      const existingReport = await Report.findOne({
        reporterId: req.userId,
        reportedUserId: userId,
      });

      if (existingReport) {
        throw new ApiError(
          HTTP_STATUS.BAD_REQUEST,
          'You have already reported this user'
        );
      }

      // Create report
      await Report.create({
        reporterId: req.userId,
        reportedUserId: userId,
        reason,
      });

      // Increment report count and check for auto-ban
      const reportedUser = await User.findById(userId);
      await reportedUser.incrementReports();

      logger.info(`User ${userId} reported by ${req.userId}`);

      res
        .status(HTTP_STATUS.CREATED)
        .json(
          new ApiResponse(
            HTTP_STATUS.CREATED,
            null,
            'Report submitted successfully'
          )
        );
    } catch (error) {
      next(error);
    }
  }
}