import axios from 'axios';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

export class MSG91Service {
  constructor() {
    this.baseUrl = 'https://api.msg91.com/api/v5';
    this.authKey = config.msg91.authKey;
  }

  async sendOTP(phone, otp) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/otp`,
        {
          template_id: config.msg91.dltTemplateId,
          mobile: phone,
          authkey: this.authKey,
          otp: otp,
          otp_expiry: 5, // 5 minutes
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`MSG91 OTP sent to ${phone}: ${response.data.type}`);
      return response.data;
    } catch (error) {
      logger.error('MSG91 sending error:', error.response?.data || error.message);
      throw new Error('Failed to send OTP via SMS');
    }
  }

  async verifyOTP(phone, otp) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/otp/verify`,
        {
          params: {
            authkey: this.authKey,
            mobile: phone,
            otp: otp,
          },
        }
      );

      logger.info(`MSG91 OTP verified for ${phone}`);
      return response.data.type === 'success';
    } catch (error) {
      logger.error('MSG91 verification error:', error.response?.data || error.message);
      return false;
    }
  }

  async resendOTP(phone) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/otp/retry`,
        {
          authkey: this.authKey,
          mobile: phone,
          retrytype: 'text', // or 'voice'
        }
      );

      logger.info(`MSG91 OTP resent to ${phone}`);
      return response.data;
    } catch (error) {
      logger.error('MSG91 resend error:', error.response?.data || error.message);
      throw new Error('Failed to resend OTP');
    }
  }
}