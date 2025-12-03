import { OTPService } from '../services/otp.service.js';
import { User } from '../models/User.model.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { HTTP_STATUS } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { helpers } from '../utils/helpers.js';

const otpService = new OTPService();

export class AuthController {
  // Send OTP (Phone or Email)
  static async sendOTP(req, res, next) {
    try {
      const { identifier, type } = req.body; // type: 'phone' or 'email'

      // Validate type
      if (!type || !['phone', 'email'].includes(type)) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Type must be phone or email');
      }

      // Sanitize identifier
      const cleanIdentifier = type === 'phone' 
        ? helpers.sanitizePhone(identifier)
        : identifier.toLowerCase().trim();

      // Send OTP
      await otpService.sendOTP(cleanIdentifier, type);

      logger.info(`OTP sent to ${cleanIdentifier} via ${type}`);

      res
        .status(HTTP_STATUS.OK)
        .json(
          new ApiResponse(
            HTTP_STATUS.OK,
            { type },
            `OTP sent successfully via ${type}`
          )
        );
    } catch (error) {
      next(error);
    }
  }

  // Verify OTP and Login/Register
  static async verifyOTP(req, res, next) {
    try {
      const { identifier, otp, type, role, name } = req.body;

      // Sanitize identifier
      const cleanIdentifier = type === 'phone'
        ? helpers.sanitizePhone(identifier)
        : identifier.toLowerCase().trim();

      // Verify OTP
      await otpService.verifyOTP(cleanIdentifier, otp);

      // Find user by phone or email
      const query = type === 'phone' 
        ? { phone: cleanIdentifier }
        : { email: cleanIdentifier };

      let user = await User.findOne(query);

      // New user - need registration
      if (!user) {
        if (!role || !name) {
          return res.status(HTTP_STATUS.OK).json(
            new ApiResponse(
              HTTP_STATUS.OK,
              { isNewUser: true },
              'Please complete registration'
            )
          );
        }

        // Create new user
        const userData = {
          authType: type,
          role,
          name,
        };

        if (type === 'phone') {
          userData.phone = cleanIdentifier;
        } else {
          userData.email = cleanIdentifier;
        }

        user = await User.create(userData);
      }

      // Check if banned
      if (user.isBanned) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Account has been banned');
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      logger.info(`User ${user._id} authenticated via ${type}`);

      res.status(HTTP_STATUS.OK).json(
        new ApiResponse(
          HTTP_STATUS.OK,
          {
            token,
            user: {
              id: user._id,
              phone: user.phone,
              email: user.email,
              name: user.name,
              role: user.role,
              coins: user.coins,
              profileImage: user.profileImage,
              authType: user.authType,
            },
          },
          'Login successful'
        )
      );
    } catch (error) {
      next(error);
    }
  }

  // Resend OTP
  static async resendOTP(req, res, next) {
    try {
      const { identifier, type } = req.body;

      const cleanIdentifier = type === 'phone'
        ? helpers.sanitizePhone(identifier)
        : identifier.toLowerCase().trim();

      await otpService.resendOTP(cleanIdentifier, type);

      logger.info(`OTP resent to ${cleanIdentifier} via ${type}`);

      res
        .status(HTTP_STATUS.OK)
        .json(
          new ApiResponse(
            HTTP_STATUS.OK,
            null,
            'OTP resent successfully'
          )
        );
    } catch (error) {
      next(error);
    }
  }
}