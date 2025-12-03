import { Router } from 'express';
import { WithdrawalController } from '../controllers/withdrawal.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { validators } from '../utils/validators.js';
import { USER_ROLES } from '../config/constants.js';

const router = Router();

router.post(
  '/request',
  authenticate,
  authorize(USER_ROLES.WOMEN),
  validate(validators.withdrawalRequest),
  WithdrawalController.requestWithdrawal
);

router.get('/history', authenticate, WithdrawalController.getWithdrawalHistory);

router.get(
  '/earnings',
  authenticate,
  authorize(USER_ROLES.WOMEN),
  WithdrawalController.getEarnings
);

export default router;