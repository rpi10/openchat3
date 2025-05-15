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

describe('Message Endpoints', () => {
  describe('POST /api/messages/send', () => {
    it('should send a message successfully', async () => {
      const message = {
        recipient: 'recipientuser',
        content: 'Hello, this is a test message',
        encrypted: true
      };

      const res = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send(message);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Message sent successfully');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('content', message.content);
    });

    it('should not send message without authentication', async () => {
      const message = {
        recipient: 'recipientuser',
        content: 'Hello, this is a test message',
        encrypted: true
      };

      const res = await request(app)
        .post('/api/messages/send')
        .send(message);

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/messages/send-file', () => {
    it('should send a file message successfully', async () => {
      const fileMessage = {
        recipient: 'recipientuser',
        fileName: 'test.txt',
        fileType: 'text/plain',
        fileSize: 1024,
        encrypted: true
      };

      const res = await request(app)
        .post('/api/messages/send-file')
        .set('Authorization', `Bearer ${authToken}`)
        .field('recipient', fileMessage.recipient)
        .field('fileName', fileMessage.fileName)
        .field('fileType', fileMessage.fileType)
        .field('fileSize', fileMessage.fileSize)
        .field('encrypted', fileMessage.encrypted)
        .attach('file', Buffer.from('test file content'), 'test.txt');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'File message sent successfully');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('fileName', fileMessage.fileName);
    });

    it('should not send file message without authentication', async () => {
      const res = await request(app)
        .post('/api/messages/send-file')
        .attach('file', Buffer.from('test file content'), 'test.txt');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/messages/history/:username', () => {
    it('should get chat history successfully', async () => {
      const res = await request(app)
        .get('/api/messages/history/recipientuser')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ privateKey: 'test-private-key' });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Chat history retrieved successfully');
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should not get chat history without authentication', async () => {
      const res = await request(app)
        .get('/api/messages/history/recipientuser')
        .query({ privateKey: 'test-private-key' });

      expect(res.statusCode).toBe(401);
    });
  });
}); 