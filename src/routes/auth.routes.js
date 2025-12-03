import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { validators } from '../utils/validators.js';
import { loginLimiter } from '../middleware/rateLimiter.middleware.js';

const router = Router();

router.post(
  '/send-otp',
  loginLimiter,
  validate(validators.sendOTP),
  AuthController.sendOTP
);

router.post(
  '/verify-otp',
  loginLimiter,
  validate(validators.verifyOTP),
  AuthController.verifyOTP
);

router.post(
  '/resend-otp',
  loginLimiter,
  validate(validators.resendOTP),
  AuthController.resendOTP
);

export default router;