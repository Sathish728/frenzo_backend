import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User } from '../models/User.model.js';
import { OTP } from '../models/OTP.model.js';
import { ApiError } from '../utils/apiError.js';
import { HTTP_STATUS } from '../config/constants.js';
import { helpers } from '../utils/helpers.js';

export class AuthService {
  static async generateOTP(phone) {
    const sanitizedPhone = helpers.sanitizePhone(phone);
    const otp = helpers.generateOTP();

    // Delete existing OTP
    await OTP.deleteMany({ phone: sanitizedPhone });

    // Create new OTP
    await OTP.create({ phone: sanitizedPhone, otp });

    return otp;
  }

  static async verifyOTP(phone, otp) {
    const sanitizedPhone = helpers.sanitizePhone(phone);
    
    const otpRecord = await OTP.findOne({ 
      phone: sanitizedPhone, 
      otp 
    });

    if (!otpRecord) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid or expired OTP');
    }

    // Delete OTP after verification
    await OTP.deleteOne({ _id: otpRecord._id });

    return true;
  }

  static async findOrCreateUser(phone, role, name) {
    const sanitizedPhone = helpers.sanitizePhone(phone);
    
    let user = await User.findOne({ phone: sanitizedPhone });

    if (!user && (!role || !name)) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        'Role and name required for new users'
      );
    }

    if (!user) {
      user = await User.create({
        phone: sanitizedPhone,
        role,
        name,
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    return user;
  }

  static generateToken(userId, role) {
    return jwt.sign(
      { userId, role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
  }

  static getUserResponse(user, token) {
    return {
      token,
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        coins: user.coins,
        profileImage: user.profileImage,
        isOnline: user.isOnline,
      },
    };
  }
}