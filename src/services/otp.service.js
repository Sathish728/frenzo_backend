import { MSG91Service } from './msg91.service.js';
import { EmailService } from './email.service.js';
import { OTP } from '../models/OTP.model.js';
import { ApiError } from '../utils/apiError.js';
import { HTTP_STATUS } from '../config/constants.js';
import { helpers } from '../utils/helpers.js';
import { logger } from '../config/logger.js';

export class OTPService {
  constructor() {
    this.msg91Service = new MSG91Service();
    this.emailService = new EmailService();
  }

  async sendOTP(identifier, type = 'phone') {
    try {
      const otp = helpers.generateOTP();

      // Delete existing OTP
      await OTP.deleteMany({ identifier });

      // Create new OTP
      await OTP.create({ identifier, otp, type });

      // Send based on type
      if (type === 'phone') {
        await this.msg91Service.sendOTP(identifier, otp);
      } else if (type === 'email') {
        await this.emailService.sendOTP(identifier, otp);
      }

      logger.info(`OTP sent via ${type} to ${identifier}`);
      return { success: true };
    } catch (error) {
      logger.error('Send OTP error:', error);
      throw new ApiError(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        `Failed to send OTP via ${type}`
      );
    }
  }

  async verifyOTP(identifier, otp) {
    try {
      const otpRecord = await OTP.findOne({ identifier, otp });

      if (!otpRecord) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid or expired OTP');
      }

      // Delete OTP after verification
      await OTP.deleteOne({ _id: otpRecord._id });

      return true;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(HTTP_STATUS.INTERNAL_SERVER_ERROR, 'OTP verification failed');
    }
  }

  async resendOTP(identifier, type = 'phone') {
    try {
      // Delete existing OTP
      await OTP.deleteMany({ identifier });

      const otp = helpers.generateOTP();

      // Create new OTP
      await OTP.create({ identifier, otp, type });

      // Send based on type
      if (type === 'phone') {
        await this.msg91Service.sendOTP(identifier, otp);
      } else if (type === 'email') {
        await this.emailService.sendOTP(identifier, otp);
      }

      logger.info(`OTP resent via ${type} to ${identifier}`);
      return { success: true };
    } catch (error) {
      logger.error('Resend OTP error:', error);
      throw new ApiError(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        `Failed to resend OTP`
      );
    }
  }
}