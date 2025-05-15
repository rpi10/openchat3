const { createServer } = require('http');
const { Server } = require('socket.io');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const app = require('../app');
const { createTestUser, loginTestUser } = require('./utils/testUtils');
const io = require('socket.io-client');

let mongoServer;
let httpServer;
let socketServer;
let clientSocket;
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

  // Create HTTP server
  httpServer = createServer(app);
  socketServer = new Server(httpServer);
  await new Promise((resolve) => {
    httpServer.listen(() => {
      const port = httpServer.address().port;
      clientSocket = io(`http://localhost:${port}`, {
        auth: {
          token: authToken
        }
      });
      clientSocket.on('connect', resolve);
    });
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  await new Promise((resolve) => {
    httpServer.close(resolve);
  });
});

describe('WebSocket Functionality', () => {
  it('should connect successfully with valid token', (done) => {
    clientSocket.on('connect', () => {
      expect(clientSocket.connected).toBe(true);
      done();
    });
  });

  it('should disconnect with invalid token', (done) => {
    const invalidSocket = io(`http://localhost:${httpServer.address().port}`, {
      auth: {
        token: 'invalid-token'
      }
    });

    invalidSocket.on('connect_error', (error) => {
      expect(error.message).toBe('Authentication error');
      invalidSocket.close();
      done();
    });
  });

  it('should send and receive private message', (done) => {
    const message = {
      recipient: 'recipientuser',
      content: 'Hello, this is a test message',
      encrypted: true
    };

    clientSocket.emit('private-message', message);

    clientSocket.on('private-message', (receivedMessage) => {
      expect(receivedMessage).toMatchObject({
        sender: testUser.username,
        content: message.content,
        encrypted: message.encrypted
      });
      done();
    });
  });

  it('should send and receive group message', (done) => {
    const message = {
      groupId: 'test-group-id',
      content: 'Hello group, this is a test message',
      encrypted: true
    };

    clientSocket.emit('group-message', message);

    clientSocket.on('group-message', (receivedMessage) => {
      expect(receivedMessage).toMatchObject({
        sender: testUser.username,
        groupId: message.groupId,
        content: message.content,
        encrypted: message.encrypted
      });
      done();
    });
  });

  it('should handle typing indicator', (done) => {
    const typingData = {
      recipient: 'recipientuser',
      isTyping: true
    };

    clientSocket.emit('typing', typingData);

    clientSocket.on('typing', (receivedData) => {
      expect(receivedData).toMatchObject({
        sender: testUser.username,
        isTyping: typingData.isTyping
      });
      done();
    });
  });

  it('should handle group typing indicator', (done) => {
    const typingData = {
      groupId: 'test-group-id',
      isTyping: true
    };

    clientSocket.emit('group-typing', typingData);

    clientSocket.on('group-typing', (receivedData) => {
      expect(receivedData).toMatchObject({
        sender: testUser.username,
        groupId: typingData.groupId,
        isTyping: typingData.isTyping
      });
      done();
    });
  });

  it('should handle online status', (done) => {
    clientSocket.emit('status-change', { status: 'online' });

    clientSocket.on('status-change', (statusData) => {
      expect(statusData).toMatchObject({
        username: testUser.username,
        status: 'online'
      });
      done();
    });
  });

  it('should handle file upload progress', (done) => {
    const progressData = {
      fileId: 'test-file-id',
      progress: 50
    };

    clientSocket.emit('file-upload-progress', progressData);

    clientSocket.on('file-upload-progress', (receivedData) => {
      expect(receivedData).toMatchObject({
        fileId: progressData.fileId,
        progress: progressData.progress
      });
      done();
    });
  });

  it('should handle error events', (done) => {
    const errorMessage = 'Test error message';
    socketServer.emit('error', { message: errorMessage });

    clientSocket.on('error', (error) => {
      expect(error).toHaveProperty('message', errorMessage);
      done();
    });
  });

  it('should handle disconnection', (done) => {
    clientSocket.on('disconnect', () => {
      expect(clientSocket.connected).toBe(false);
      done();
    });

    clientSocket.disconnect();
  });
}); 