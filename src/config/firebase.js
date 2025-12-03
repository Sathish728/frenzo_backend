import admin from 'firebase-admin';
import { config } from './env.js';
import { logger } from './logger.js';

let firebaseInitialized = false;

export const initializeFirebase = () => {
  if (firebaseInitialized) return;

  try {
    const serviceAccount = {
      projectId: config.firebase.projectId,
      privateKey: config.firebase.privateKey.replace(/\\n/g, '\n'),
      clientEmail: config.firebase.clientEmail,
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    firebaseInitialized = true;
    logger.info('✅ Firebase Admin SDK initialized');
  } catch (error) {
    logger.error('❌ Firebase initialization error:', error);
    throw error;
  }
};

export const verifyFirebaseToken = async (idToken) => {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    logger.error('Firebase token verification error:', error);
    throw new Error('Invalid Firebase token');
  }
};

export default admin;