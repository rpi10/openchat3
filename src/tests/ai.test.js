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

describe('AI Endpoints', () => {
  describe('POST /api/ai/chat', () => {
    it('should generate chat completion successfully', async () => {
      const messages = [
        { role: 'user', content: 'Hello, how are you?' }
      ];

      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ messages });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Chat completion generated successfully');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('content');
    });

    it('should not generate chat completion without authentication', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: 'Hello' }] });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/ai/transcribe', () => {
    it('should transcribe audio successfully', async () => {
      const audioBuffer = Buffer.from('test audio content');

      const res = await request(app)
        .post('/api/ai/transcribe')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('audio', audioBuffer, 'test.mp3');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Audio transcribed successfully');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('text');
    });

    it('should not transcribe audio without authentication', async () => {
      const res = await request(app)
        .post('/api/ai/transcribe')
        .attach('audio', Buffer.from('test audio content'), 'test.mp3');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/ai/describe-image', () => {
    it('should generate image description successfully', async () => {
      const imageBuffer = Buffer.from('test image content');

      const res = await request(app)
        .post('/api/ai/describe-image')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('image', imageBuffer, 'test.jpg');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Image description generated successfully');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('description');
    });

    it('should not generate image description without authentication', async () => {
      const res = await request(app)
        .post('/api/ai/describe-image')
        .attach('image', Buffer.from('test image content'), 'test.jpg');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/ai/complete-code', () => {
    it('should generate code completion successfully', async () => {
      const codeData = {
        code: 'function add(a, b) {',
        language: 'javascript'
      };

      const res = await request(app)
        .post('/api/ai/complete-code')
        .set('Authorization', `Bearer ${authToken}`)
        .send(codeData);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Code completion generated successfully');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('completion');
    });

    it('should not generate code completion without authentication', async () => {
      const res = await request(app)
        .post('/api/ai/complete-code')
        .send({ code: 'function test() {', language: 'javascript' });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/ai/summarize', () => {
    it('should generate text summary successfully', async () => {
      const textData = {
        text: 'This is a long text that needs to be summarized. It contains multiple sentences and paragraphs.'
      };

      const res = await request(app)
        .post('/api/ai/summarize')
        .set('Authorization', `Bearer ${authToken}`)
        .send(textData);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Text summary generated successfully');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('summary');
    });

    it('should not generate text summary without authentication', async () => {
      const res = await request(app)
        .post('/api/ai/summarize')
        .send({ text: 'This is a test text.' });

      expect(res.statusCode).toBe(401);
    });
  });
}); 