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
      const { idToken, role, name } = req.body;

      if (!idToken) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Firebase ID token is required');
      }

      // Verify Firebase token
      const decodedToken = await verifyFirebaseToken(idToken);
      const phoneNumber = decodedToken.phone_number;

      if (!phoneNumber) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Phone number not found in token');
      }

      // Normalize phone number (remove +91 or +)
      const normalizedPhone = phoneNumber.replace(/^\+/, '');

      // Check if user exists
      let user = await User.findOne({ phone: normalizedPhone });

      // If user exists - just log them in (ignore role/name sent)
      if (user) {
        if (user.isBanned) {
          throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Account has been banned');
        }

        // Update Firebase UID if needed
        if (!user.firebaseUid) {
          user.firebaseUid = decodedToken.uid;
        }
        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign(
          { userId: user._id, role: user.role },
          config.jwt.secret,
          { expiresIn: config.jwt.expiresIn }
        );

        logger.info(`Existing user ${user._id} logged in`);

        return res.status(HTTP_STATUS.OK).json(
          new ApiResponse(HTTP_STATUS.OK, {
            token,
            user: {
              id: user._id,
              phone: user.phone,
              role: user.role,
              name: user.name,
              profileImage: user.profileImage,
              coins: user.coins,
              isOnline: user.isOnline,
              isAvailable: user.isAvailable,
              isNewUser: false,
            },
          }, 'Login successful')
        );
      }

      // User doesn't exist - check if we have registration data
      if (!role || !['men', 'women'].includes(role)) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, 'NEW_USER_REQUIRED');
      }

      // Create new user
      const userName = name && name.trim() ? name.trim() : `User${Date.now()}`;
      
      user = await User.create({
        phone: normalizedPhone,
        authType: 'phone',
        role,
        name: userName,
        firebaseUid: decodedToken.uid,
        isVerified: true,
        coins: role === 'men' ? 50 : 0, // 50 free coins for new men
      });

      logger.info(`New user registered: ${user._id} as ${role}`);

      const token = jwt.sign(
        { userId: user._id, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      res.status(HTTP_STATUS.CREATED).json(
        new ApiResponse(HTTP_STATUS.CREATED, {
          token,
          user: {
            id: user._id,
            phone: user.phone,
            role: user.role,
            name: user.name,
            profileImage: user.profileImage,
            coins: user.coins,
            isNewUser: true,
          },
        }, 'Registration successful')
      );
    } catch (error) {
      logger.error('Firebase verification error:', error);
      if (error instanceof ApiError) return next(error);
      next(new ApiError(HTTP_STATUS.UNAUTHORIZED, error.message || 'Invalid token'));
    }
  }

  static async refreshToken(req, res, next) {
    try {
      const { userId } = req.user;
      const user = await User.findById(userId);

      if (!user) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
      if (user.isBanned) throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Account banned');

      const token = jwt.sign(
        { userId: user._id, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      res.json(new ApiResponse(HTTP_STATUS.OK, {
        token,
        user: {
          id: user._id,
          phone: user.phone,
          role: user.role,
          name: user.name,
          profileImage: user.profileImage,
          coins: user.coins,
        },
      }, 'Token refreshed'));
    } catch (error) {
      next(error);
    }
  }

  static async getCurrentUser(req, res, next) {
    try {
      const user = await User.findById(req.userId).select('-socketId -firebaseUid');
      if (!user) throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
      if (user.isBanned) throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Account banned');

      res.json(new ApiResponse(HTTP_STATUS.OK, { user }, 'User retrieved'));
    } catch (error) {
      next(error);
    }
  }
}