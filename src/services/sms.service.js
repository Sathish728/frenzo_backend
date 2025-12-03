import twilio from 'twilio';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

export class SMSService {
  constructor() {
    this.client = twilio(
      config.twilio.accountSid,
      config.twilio.authToken
    );
  }

  async sendOTP(phone, otp) {
    try {
      const message = await this.client.messages.create({
        body: `Your OTP for Calling App is: ${otp}. Valid for 5 minutes.`,
        from: config.twilio.phoneNumber,
        to: phone,
      });

      logger.info(`OTP sent to ${phone}: ${message.sid}`);
      return message;
    } catch (error) {
      logger.error('SMS sending error:', error);
      throw new ApiError(
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        'Failed to send OTP'
      );
    }
  }
}
