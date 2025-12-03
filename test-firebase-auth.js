import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function generateTestToken(phoneNumber) {
  try {
    // Create or get user by phone number
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByPhoneNumber(phoneNumber);
      console.log('✅ Existing user found:', userRecord.uid);
    } catch (error) {
      // User doesn't exist, create new one
      userRecord = await admin.auth().createUser({
        phoneNumber: phoneNumber,
      });
      console.log('✅ New user created:', userRecord.uid);
    }

    // Generate custom token
    const customToken = await admin.auth().createCustomToken(userRecord.uid);
    console.log('\n🔑 Custom Token (use this for testing):');
    console.log(customToken);
    console.log('\n📝 Now exchange this for ID Token...\n');

    return customToken;
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}
