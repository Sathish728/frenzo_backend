import sgMail from '@sendgrid/mail';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

export class EmailService {
  constructor() {
    sgMail.setApiKey(config.sendgrid.apiKey);
  }

  async sendOTP(email, otp) {
    try {
      const msg = {
        to: email,
        from: {
          email: config.sendgrid.fromEmail,
          name: config.sendgrid.fromName,
        },
        subject: 'Your OTP for Calling App',
        text: `Your OTP is: ${otp}. Valid for 5 minutes. Do not share this with anyone.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2196F3;">Calling App - OTP Verification</h2>
            <p>Your One-Time Password (OTP) is:</p>
            <h1 style="color: #2196F3; font-size: 36px; letter-spacing: 5px;">${otp}</h1>
            <p>This OTP is valid for <strong>5 minutes</strong>.</p>
            <p style="color: #666;">If you didn't request this, please ignore this email.</p>
            <hr style="border: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">
              This is an automated email. Please do not reply.
            </p>
          </div>
        `,
      };

      await sgMail.send(msg);
      logger.info(`Email OTP sent to ${email}`);
    } catch (error) {
      logger.error('SendGrid error:', error.response?.body || error.message);
      throw new Error('Failed to send OTP via email');
    }
  }
}
