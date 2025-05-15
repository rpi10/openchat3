import crypto from 'crypto';
import { GeneralUser } from '../models/index.js';
import { connectToPersonalDB, getModels } from './database.js';

// Generate encryption keys
export function generateKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  const symmetricKey = crypto.randomBytes(32);
  return { publicKey, privateKey, symmetricKey: symmetricKey.toString('hex') };
}

// Encrypt message with public key
export function encryptMessage(message, publicKey) {
  const buffer = Buffer.from(message, 'utf8');
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    buffer
  );
  return encrypted.toString('base64');
}

// Decrypt message with private key
export function decryptMessage(encryptedMessage, privateKey) {
  const buffer = Buffer.from(encryptedMessage, 'base64');
  const decrypted = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    buffer
  );
  return decrypted.toString('utf8');
}

// Hash password
export function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Register new user
export async function registerUser(username, password, databaseUrl) {
  try {
    // Check if user already exists in general database
    const existingUser = await GeneralUser.findOne({ username });
    if (existingUser) {
      throw new Error('Username already exists');
    }

    // Generate encryption keys
    const { publicKey, privateKey, symmetricKey } = generateKeys();

    // Create user in general database
    const generalUser = new GeneralUser({
      authentificator: crypto.randomBytes(16).toString('hex'),
      username,
      password: hashPassword(password),
      database_url: databaseUrl
    });
    await generalUser.save();

    // Connect to personal database
    const { models } = await connectToPersonalDB(databaseUrl);

    // Create user in personal database
    const personalUser = new models.User({
      username,
      password: hashPassword(password),
      public_key: publicKey,
      private_key: privateKey,
      symmetric_key: symmetricKey
    });
    await personalUser.save();

    return {
      username,
      publicKey,
      privateKey,
      symmetricKey
    };
  } catch (error) {
    console.error('Error registering user:', error);
    throw error;
  }
}

// Authenticate user
export async function authenticateUser(username, password) {
  try {
    // Find user in general database
    const generalUser = await GeneralUser.findOne({ username });
    if (!generalUser) {
      throw new Error('User not found');
    }

    // Verify password
    if (generalUser.password !== hashPassword(password)) {
      throw new Error('Invalid password');
    }

    // Connect to personal database
    const { models } = await connectToPersonalDB(generalUser.database_url);

    // Get user from personal database
    const personalUser = await models.User.findOne({ username });
    if (!personalUser) {
      throw new Error('User not found in personal database');
    }

    return {
      username,
      publicKey: personalUser.public_key,
      privateKey: personalUser.private_key,
      symmetricKey: personalUser.symmetric_key,
      databaseUrl: generalUser.database_url
    };
  } catch (error) {
    console.error('Error authenticating user:', error);
    throw error;
  }
}

// Update user's push subscription
export async function updatePushSubscription(username, databaseUrl, subscription) {
  try {
    const { models } = await connectToPersonalDB(databaseUrl);
    await models.User.findOneAndUpdate(
      { username },
      { push_subscription: subscription }
    );
  } catch (error) {
    console.error('Error updating push subscription:', error);
    throw error;
  }
} 