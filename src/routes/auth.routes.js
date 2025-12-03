import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { validators } from '../utils/validators.js';
import { loginLimiter } from '../middleware/rateLimiter.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// Firebase Phone Auth - Verify token and login/register
router.post(
  '/firebase-verify',
  loginLimiter,
  validate(validators.firebaseVerify),
  AuthController.verifyFirebaseToken
);

// Refresh JWT token
router.post('/refresh-token', authenticate, AuthController.refreshToken);

export default router;