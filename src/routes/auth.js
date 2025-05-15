import express from 'express';
import { registerUser, authenticateUser, updatePushSubscription } from '../services/auth.js';
import { isValidMongoDBUrl } from '../services/database.js';

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { username, password, databaseUrl } = req.body;

    // Validate database URL
    if (!isValidMongoDBUrl(databaseUrl)) {
      return res.status(400).json({ error: 'Invalid database URL' });
    }

    // Register user
    const user = await registerUser(username, password, databaseUrl);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        username: user.username,
        publicKey: user.publicKey
      }
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Authenticate user
    const user = await authenticateUser(username, password);

    // Store user data in session
    req.session.user = {
      username: user.username,
      databaseUrl: user.databaseUrl
    };

    res.json({
      message: 'Login successful',
      user: {
        username: user.username,
        publicKey: user.publicKey,
        privateKey: user.privateKey,
        symmetricKey: user.symmetricKey
      }
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(401).json({ error: error.message });
  }
});

// Logout user
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logout successful' });
});

// Update push subscription
router.post('/push-subscription', async (req, res) => {
  try {
    const { username, databaseUrl, subscription } = req.body;

    // Update push subscription
    await updatePushSubscription(username, databaseUrl, subscription);

    res.json({ message: 'Push subscription updated successfully' });
  } catch (error) {
    console.error('Error updating push subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router; 