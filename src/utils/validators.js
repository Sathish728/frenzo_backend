import Joi from 'joi';

export const validators = {
  // Auth validation
  sendOTP: Joi.object({
    identifier: Joi.string().required(),
    type: Joi.string().valid('phone', 'email').required(),
  }),

  verifyOTP: Joi.object({
    identifier: Joi.string().required(),
    otp: Joi.string().length(6).required(),
    type: Joi.string().valid('phone', 'email').required(),
    role: Joi.string().valid('men', 'women'),
    name: Joi.string().min(2).max(50),
  }),

  resendOTP: Joi.object({
    identifier: Joi.string().required(),
    type: Joi.string().valid('phone', 'email').required(),
  }),

  // User validation
  updateProfile: Joi.object({
    name: Joi.string().min(2).max(50),
    upiId: Joi.string().pattern(/^[\w.-]+@[\w.-]+$/),
  }),

  // Payment validation
  createOrder: Joi.object({
    amount: Joi.number().min(1).required(),
    coins: Joi.number().min(1).required(),
  }),

  verifyPayment: Joi.object({
    orderId: Joi.string().required(),
    paymentId: Joi.string().required(),
    signature: Joi.string().required(),
  }),

  // Report validation
  reportUser: Joi.object({
    userId: Joi.string().required(),
    reason: Joi.string().min(5).max(500).required(),
  }),

  // Withdrawal validation
  withdrawalRequest: Joi.object({
    upiId: Joi.string()
      .pattern(/^[\w.-]+@[\w.-]+$/)
      .required()
      .messages({
        'string.pattern.base': 'Please enter a valid UPI ID',
      }),
  }),
};
