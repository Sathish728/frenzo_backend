import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { validators } from '../utils/validators.js';
import { paymentLimiter } from '../middleware/rateLimiter.middleware.js';
import { USER_ROLES } from '../config/constants.js';

const router = Router();

router.get('/packages', authenticate, PaymentController.getPackages);

router.post(
  '/create-order',
  authenticate,
  authorize(USER_ROLES.MEN),
  paymentLimiter,
  validate(validators.createOrder),
  PaymentController.createOrder
);

router.post(
  '/verify',
  authenticate,
  authorize(USER_ROLES.MEN),
  validate(validators.verifyPayment),
  PaymentController.verifyPayment
);

router.post(
  '/verify-upi',
  authenticate,
  authorize(USER_ROLES.MEN),
  PaymentController.verifyUPIPayment
);

router.get('/status/:orderId', authenticate, PaymentController.checkPaymentStatus);

router.get('/transactions', authenticate, PaymentController.getTransactionHistory);

export default router;