const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const { createTestUser, loginTestUser } = require('./utils/testUtils');
const fs = require('fs');
const path = require('path');

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

  // Create test files
  const testDir = path.join(__dirname, 'test-files');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir);
  }

  // Create test text file
  fs.writeFileSync(path.join(testDir, 'test.txt'), 'This is a test file content');
  
  // Create test image file
  fs.writeFileSync(path.join(testDir, 'test.jpg'), 'fake image content');
  
  // Create test audio file
  fs.writeFileSync(path.join(testDir, 'test.mp3'), 'fake audio content');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();

  // Clean up test files
  const testDir = path.join(__dirname, 'test-files');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
});

describe('File Handling Endpoints', () => {
  describe('POST /api/files/upload', () => {
    it('should upload a text file successfully', async () => {
      const res = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', path.join(__dirname, 'test-files', 'test.txt'));

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'File uploaded successfully');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('fileName', 'test.txt');
      expect(res.body.data).toHaveProperty('fileUrl');
    });

    it('should upload an image file successfully', async () => {
      const res = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', path.join(__dirname, 'test-files', 'test.jpg'));

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'File uploaded successfully');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('fileName', 'test.jpg');
      expect(res.body.data).toHaveProperty('fileUrl');
    });

    it('should upload an audio file successfully', async () => {
      const res = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', path.join(__dirname, 'test-files', 'test.mp3'));

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'File uploaded successfully');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('fileName', 'test.mp3');
      expect(res.body.data).toHaveProperty('fileUrl');
    });

    it('should not upload file without authentication', async () => {
      const res = await request(app)
        .post('/api/files/upload')
        .attach('file', path.join(__dirname, 'test-files', 'test.txt'));

      expect(res.statusCode).toBe(401);
    });

    it('should not upload file larger than max size', async () => {
      // Create a large file
      const largeFilePath = path.join(__dirname, 'test-files', 'large.txt');
      const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB
      fs.writeFileSync(largeFilePath, largeContent);

      const res = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', largeFilePath);

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'File size exceeds limit');

      // Clean up large file
      fs.unlinkSync(largeFilePath);
    });
  });

  describe('GET /api/files/:fileId', () => {
    let uploadedFileId;

    beforeAll(async () => {
      // Upload a test file first
      const uploadRes = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', path.join(__dirname, 'test-files', 'test.txt'));

      uploadedFileId = uploadRes.body.data._id;
    });

    it('should get file details successfully', async () => {
      const res = await request(app)
        .get(`/api/files/${uploadedFileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'File details retrieved successfully');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('fileName', 'test.txt');
      expect(res.body.data).toHaveProperty('fileUrl');
    });

    it('should not get file details without authentication', async () => {
      const res = await request(app)
        .get(`/api/files/${uploadedFileId}`);

      expect(res.statusCode).toBe(401);
    });

    it('should return 404 for non-existent file', async () => {
      const res = await request(app)
        .get('/api/files/nonexistentid')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'File not found');
    });
  });

  describe('DELETE /api/files/:fileId', () => {
    let uploadedFileId;

    beforeAll(async () => {
      // Upload a test file first
      const uploadRes = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', path.join(__dirname, 'test-files', 'test.txt'));

      uploadedFileId = uploadRes.body.data._id;
    });

    it('should delete file successfully', async () => {
      const res = await request(app)
        .delete(`/api/files/${uploadedFileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'File deleted successfully');
    });

    it('should not delete file without authentication', async () => {
      const res = await request(app)
        .delete(`/api/files/${uploadedFileId}`);

      expect(res.statusCode).toBe(401);
    });

    it('should return 404 for non-existent file', async () => {
      const res = await request(app)
        .delete('/api/files/nonexistentid')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'File not found');
    });
  });
}); 