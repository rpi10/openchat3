const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const { createTestUser, loginTestUser } = require('./utils/testUtils');

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
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Middleware', () => {
  describe('Authentication Middleware', () => {
    it('should allow access with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
    });

    it('should not allow access without token', async () => {
      const res = await request(app)
        .get('/api/auth/profile');

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error', 'Authentication required');
    });

    it('should not allow access with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error', 'Invalid token');
    });

    it('should not allow access with malformed token', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'invalid-format');

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error', 'Invalid token format');
    });
  });

  describe('Rate Limiting Middleware', () => {
    it('should allow requests within rate limit', async () => {
      const requests = Array(10).fill().map(() => 
        request(app)
          .get('/api/auth/profile')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(requests);
      const successResponses = responses.filter(res => res.statusCode === 200);
      expect(successResponses.length).toBe(10);
    });

    it('should block requests exceeding rate limit', async () => {
      const requests = Array(11).fill().map(() => 
        request(app)
          .get('/api/auth/profile')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(requests);
      const blockedResponses = responses.filter(res => res.statusCode === 429);
      expect(blockedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling Middleware', () => {
    it('should handle 404 errors', async () => {
      const res = await request(app)
        .get('/non-existent-route');

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'Not Found');
    });

    it('should handle validation errors', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: '', // Invalid empty username
          password: 'testpass'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should handle server errors', async () => {
      // Simulate a server error by passing invalid data to a route
      const res = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          recipient: null, // Invalid recipient
          content: 'test message'
        });

      expect(res.statusCode).toBe(500);
      expect(res.body).toHaveProperty('error', 'Internal Server Error');
    });
  });

  describe('File Upload Middleware', () => {
    it('should handle file upload within size limit', async () => {
      const res = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('test file content'), 'test.txt');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'File uploaded successfully');
    });

    it('should reject file exceeding size limit', async () => {
      const largeFile = Buffer.from('x'.repeat(11 * 1024 * 1024)); // 11MB
      const res = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', largeFile, 'large.txt');

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'File size exceeds limit');
    });

    it('should reject unsupported file types', async () => {
      const res = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('test content'), 'test.exe');

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Unsupported file type');
    });
  });

  describe('CORS Middleware', () => {
    it('should allow requests from allowed origins', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Origin', 'http://localhost:3000')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('should not allow requests from disallowed origins', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Origin', 'http://malicious-site.com')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('Request Logging Middleware', () => {
    it('should log successful requests', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      // Check if request was logged (implementation dependent)
    });

    it('should log failed requests', async () => {
      const res = await request(app)
        .get('/non-existent-route');

      expect(res.statusCode).toBe(404);
      // Check if request was logged (implementation dependent)
    });
  });
}); 