const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const { createTestUser, loginTestUser } = require('./utils/testUtils');
const webpush = require('web-push');

let mongoServer;
let authToken;
let testUser;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Create and login test user
  testUser = await createTestUser();
  const loginResponse = await loginTestUser(testUser);
  authToken = loginResponse.token;

  // Set up web-push with test keys
  webpush.setVapidDetails(
    'mailto:test@example.com',
    'BPkX7tqQJQKQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQ',
    'QzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQzQ'
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Push Notification Endpoints', () => {
  describe('POST /api/push/subscribe', () => {
    it('should subscribe to push notifications successfully', async () => {
      const subscription = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-token',
        keys: {
          p256dh: 'test-p256dh-key',
          auth: 'test-auth-key'
        }
      };

      const res = await request(app)
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ subscription });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Push subscription successful');
    });

    it('should not subscribe without authentication', async () => {
      const subscription = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-token',
        keys: {
          p256dh: 'test-p256dh-key',
          auth: 'test-auth-key'
        }
      };

      const res = await request(app)
        .post('/api/push/subscribe')
        .send({ subscription });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/push/unsubscribe', () => {
    it('should unsubscribe from push notifications successfully', async () => {
      const res = await request(app)
        .post('/api/push/unsubscribe')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Push unsubscription successful');
    });

    it('should not unsubscribe without authentication', async () => {
      const res = await request(app)
        .post('/api/push/unsubscribe');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/push/send', () => {
    it('should send push notification successfully', async () => {
      const notification = {
        title: 'Test Notification',
        body: 'This is a test notification',
        icon: '/icon.png',
        badge: '/badge.png',
        data: {
          url: '/test'
        }
      };

      const res = await request(app)
        .post('/api/push/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ notification });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Push notification sent successfully');
    });

    it('should not send push notification without authentication', async () => {
      const notification = {
        title: 'Test Notification',
        body: 'This is a test notification'
      };

      const res = await request(app)
        .post('/api/push/send')
        .send({ notification });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/push/vapid-public-key', () => {
    it('should get VAPID public key successfully', async () => {
      const res = await request(app)
        .get('/api/push/vapid-public-key');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('publicKey');
      expect(typeof res.body.publicKey).toBe('string');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid subscription data', async () => {
      const invalidSubscription = {
        endpoint: 'invalid-endpoint',
        keys: {
          p256dh: 'invalid-key',
          auth: 'invalid-key'
        }
      };

      const res = await request(app)
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ subscription: invalidSubscription });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should handle invalid notification data', async () => {
      const invalidNotification = {
        title: '', // Empty title
        body: '' // Empty body
      };

      const res = await request(app)
        .post('/api/push/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ notification: invalidNotification });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });
}); 