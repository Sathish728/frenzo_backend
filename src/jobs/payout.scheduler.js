import cron from 'node-cron';
import { User } from '../models/User.model.js';
import { Withdrawal } from '../models/Withdrawal.model.js';
import { PaymentService } from '../services/payment.service.js';
import { logger } from '../config/logger.js';
import { WITHDRAWAL_STATUS } from '../config/constants.js';

const paymentService = new PaymentService();

// Weekly payout - Every Sunday at 11:59 PM
cron.schedule('59 23 * * 0', async () => {
  logger.info('⏰ Starting weekly payout process...');

  try {
    const pendingWithdrawals = await Withdrawal.find({
      status: WITHDRAWAL_STATUS.PENDING,
    }).populate('womenUserId');

    let successCount = 0;
    let failureCount = 0;

    for (const withdrawal of pendingWithdrawals) {
      try {
        const woman = withdrawal.womenUserId;

        // Validate woman still has enough coins
        if (woman.coins < withdrawal.coins) {
          withdrawal.status = WITHDRAWAL_STATUS.FAILED;
          withdrawal.failureReason = 'Insufficient coins';
          withdrawal.processedDate = new Date();
          await withdrawal.save();
          failureCount++;
          continue;
        }

        // Validate UPI ID
        if (!withdrawal.upiId) {
          withdrawal.status = WITHDRAWAL_STATUS.FAILED;
          withdrawal.failureReason = 'No UPI ID provided';
          withdrawal.processedDate = new Date();
          await withdrawal.save();
          failureCount++;
          continue;
        }

        // Process payout
        const payout = await paymentService.processWithdrawal(withdrawal);

        // Update withdrawal record
        withdrawal.status = WITHDRAWAL_STATUS.COMPLETED;
        withdrawal.processedDate = new Date();
        withdrawal.payoutId = payout.id;
        await withdrawal.save();

        // Deduct coins from woman
        woman.coins -= withdrawal.coins;
        await woman.save();

        successCount++;
        logger.info(
          `✅ Payout completed for ${woman.name}: ₹${withdrawal.amount}`
        );
      } catch (error) {
        logger.error(
          `❌ Payout failed for withdrawal ${withdrawal._id}:`,
          error
        );
        
        withdrawal.status = WITHDRAWAL_STATUS.FAILED;
        withdrawal.failureReason = error.message;
        withdrawal.processedDate = new Date();
        await withdrawal.save();
        failureCount++;
      }
    }

    logger.info(
      `✅ Weekly payout process completed. Success: ${successCount}, Failed: ${failureCount}`
    );
  } catch (error) {
    logger.error('❌ Weekly payout error:', error);
  }
});

// Daily cleanup job - Delete old logs, etc.
cron.schedule('0 2 * * *', async () => {
  logger.info('🧹 Running daily cleanup...');

  try {
    // Add cleanup tasks here
    // For example: delete old OTPs, clean temporary files, etc.
    
    logger.info('✅ Daily cleanup completed');
  } catch (error) {
    logger.error('❌ Daily cleanup error:', error);
  }
});

logger.info('✅ Schedulers initialized');