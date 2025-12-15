import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { UserController } from '../controllers/user.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { validators } from '../utils/validators.js';
import { USER_ROLES } from '../config/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  },
});

const router = Router();

router.get('/profile', authenticate, UserController.getProfile);

router.put(
  '/profile',
  authenticate,
  upload.single('profileImage'),
  validate(validators.updateProfile),
  UserController.updateProfile
);

router.get(
  '/available-women',
  authenticate,
  authorize(USER_ROLES.MEN),
  UserController.getAvailableWomen
);

// Support BOTH PUT and POST for toggle-availability
router.put(
  '/toggle-availability',
  authenticate,
  authorize(USER_ROLES.WOMEN),
  UserController.toggleAvailability
);

router.post(
  '/toggle-availability',
  authenticate,
  authorize(USER_ROLES.WOMEN),
  UserController.toggleAvailability
);

// Also support /availability route
router.put(
  '/availability',
  authenticate,
  authorize(USER_ROLES.WOMEN),
  UserController.toggleAvailability
);

router.post(
  '/availability',
  authenticate,
  authorize(USER_ROLES.WOMEN),
  UserController.toggleAvailability
);

router.post(
  '/report',
  authenticate,
  validate(validators.reportUser),
  UserController.reportUser
);

export default router;