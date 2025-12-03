import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  
  database: {
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017/calling-app',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  },

  // Firebase Admin SDK Configuration
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    accountNumber: process.env.RAZORPAY_ACCOUNT_NUMBER,
  },

  webrtc: {
    stunUrl: process.env.STUN_SERVER_URL || 'stun:stun.l.google.com:19302',
    turnUrl: process.env.TURN_SERVER_URL,
    turnUsername: process.env.TURN_USERNAME,
    turnPassword: process.env.TURN_PASSWORD,
  },

  app: {
    coinsPerMinute: parseInt(process.env.COINS_PER_MINUTE, 10) || 40,
    moneyPer1000Coins: parseInt(process.env.MONEY_PER_1000_COINS, 10) || 50,
    minWithdrawalCoins: 1000,
    autobanReportCount: 5,
  },
};