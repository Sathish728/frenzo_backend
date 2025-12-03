import { Router } from 'express';
import { CallController } from '../controllers/call.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/ice-servers', authenticate, CallController.getICEServers);
router.get('/history', authenticate, CallController.getCallHistory);
router.get('/stats', authenticate, CallController.getCallStats);

export default router;