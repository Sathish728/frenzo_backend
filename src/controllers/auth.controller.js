import { User } from '../models/User.model.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { verifyFirebaseToken } from '../config/firebase.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { HTTP_STATUS } from '../config/constants.js';
import { logger } from '../config/logger.js';

export class AuthController {
  // Firebase Phone Auth - Verify Token and Login/Register
  static async verifyFirebaseToken(req, res, next) {
    try {
      const { idToken, role } = req.body;

      if (!idToken || !role) {
        throw new ApiError(
          HTTP_STATUS.BAD_REQUEST,
          'Firebase ID token and role are required'
        );
      }

      // Verify Firebase token
      const decodedToken = await verifyFirebaseToken(idToken);
      const phoneNumber = decodedToken.phone_number;

      if (!phoneNumber) {
        throw new ApiError(
          HTTP_STATUS.BAD_REQUEST,
          'Phone number not found in token'
        );
      }

      // Normalize phone number (remove +91 or +)
      const normalizedPhone = phoneNumber.replace(/^\+/, '');

      // Check if user exists
      let user = await User.findOne({ phone: normalizedPhone });

      if (!user) {
        // Create new user
        user = await User.create({
          phone: normalizedPhone,
          authType: 'phone',
          role,
          name: `User${Date.now()}`, // Temporary name
          firebaseUid: decodedToken.uid,
          isVerified: true,
        });

        logger.info(`New user registered: ${user._id}`);
      } else {
        // Update Firebase UID if needed
        if (!user.firebaseUid) {
          user.firebaseUid = decodedToken.uid;
          await user.save();
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();
      }

      // Check if banned
      if (user.isBanned) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Account has been banned');
      }

      // Generate JWT token for app
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      logger.info(`User ${user._id} authenticated via Firebase`);

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          HTTP_STATUS.OK,
          {
            token,
            user: {
              id: user._id,
              phone: user.phone,
              role: user.role,
              name: user.name,
              profileImage: user.profileImage,
              coins: user.coins,
              isNewUser: !user.name || user.name.startsWith('User'),
            },
          },
          'Authentication successful'
        )
      );
    } catch (error) {
      logger.error('Firebase verification error:', error);
      next(
        new ApiError(
          HTTP_STATUS.UNAUTHORIZED,
          error.message || 'Invalid or expired token'
        )
      );
    }
  }

  // Refresh Token
  static async refreshToken(req, res, next) {
    try {
      const { userId } = req.user;
      const user = await User.findById(userId);

      if (!user) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
      }

      if (user.isBanned) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Account has been banned');
      }

      const token = jwt.sign(
        { userId: user._id, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      res.json(
        new ApiResponse(
          HTTP_STATUS.OK,
          {
            token,
            user: {
              id: user._id,
              phone: user.phone,
              role: user.role,
              name: user.name,
              profileImage: user.profileImage,
              coins: user.coins,
            },
          },
          'Token refreshed'
        )
      );
    } catch (error) {
      next(error);
    }
  }
}