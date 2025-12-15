import Joi from 'joi';

export const validators = {
  // Firebase Auth - role is optional for existing users
  firebaseVerify: Joi.object({
    idToken: Joi.string().required().messages({
      'string.empty': 'Firebase ID token is required',
      'any.required': 'Firebase ID token is required',
    }),
    role: Joi.string().valid('men', 'women').allow(null).optional(),
    name: Joi.string().min(2).max(50).allow(null, '').optional(),
  }),

  updateProfile: Joi.object({
    name: Joi.string().min(2).max(50),
    upiId: Joi.string().pattern(/^[\w.-]+@[\w.-]+$/),
  }),

  createOrder: Joi.object({
    amount: Joi.number().min(1).required(),
    coins: Joi.number().min(1).required(),
    packageId: Joi.number().optional(),
  }),

  verifyPayment: Joi.object({
    orderId: Joi.string().required(),
    paymentId: Joi.string().required(),
    signature: Joi.string().required(),
  }),

  reportUser: Joi.object({
    userId: Joi.string().required(),
    reason: Joi.string().min(5).max(500).required(),
  }),

  withdrawalRequest: Joi.object({
    upiId: Joi.string()
      .pattern(/^[\w.-]+@[\w.-]+$/)
      .required()
      .messages({ 'string.pattern.base': 'Invalid UPI ID' }),
  }),
};