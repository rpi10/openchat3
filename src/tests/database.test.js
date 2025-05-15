const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { connectToDatabase, closeDatabaseConnection, isValidMongoDBUrl } = require('../services/database');
const User = require('../models/User');
const Message = require('../models/Message');
const Group = require('../models/Group');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await connectToDatabase(mongoUri);
});

afterAll(async () => {
  await closeDatabaseConnection();
  await mongoServer.stop();
});

describe('Database Service', () => {
  describe('Database Connection', () => {
    it('should connect to database successfully', async () => {
      expect(mongoose.connection.readyState).toBe(1); // 1 = connected
    });

    it('should close database connection successfully', async () => {
      await closeDatabaseConnection();
      expect(mongoose.connection.readyState).toBe(0); // 0 = disconnected
      
      // Reconnect for other tests
      await connectToDatabase(mongoServer.getUri());
    });
  });

  describe('MongoDB URL Validation', () => {
    it('should validate correct MongoDB URL', () => {
      const validUrl = 'mongodb://localhost:27017/testdb';
      expect(isValidMongoDBUrl(validUrl)).toBe(true);
    });

    it('should validate MongoDB URL with authentication', () => {
      const validUrl = 'mongodb://user:pass@localhost:27017/testdb';
      expect(isValidMongoDBUrl(validUrl)).toBe(true);
    });

    it('should validate MongoDB URL with options', () => {
      const validUrl = 'mongodb://localhost:27017/testdb?retryWrites=true&w=majority';
      expect(isValidMongoDBUrl(validUrl)).toBe(true);
    });

    it('should not validate incorrect MongoDB URL', () => {
      const invalidUrls = [
        'http://localhost:27017/testdb',
        'mongodb://',
        'invalid-url',
        'mongodb://localhost:27017',
        'mongodb://localhost:27017/'
      ];

      invalidUrls.forEach(url => {
        expect(isValidMongoDBUrl(url)).toBe(false);
      });
    });
  });
});

describe('Database Models', () => {
  describe('User Model', () => {
    it('should create user successfully', async () => {
      const userData = {
        username: 'testuser',
        password: 'hashedpassword',
        publicKey: 'publickey',
        privateKey: 'privatekey',
        symmetricKey: 'symmetrickey'
      };

      const user = await User.create(userData);
      expect(user.username).toBe(userData.username);
      expect(user.password).toBe(userData.password);
      expect(user.publicKey).toBe(userData.publicKey);
      expect(user.privateKey).toBe(userData.privateKey);
      expect(user.symmetricKey).toBe(userData.symmetricKey);
    });

    it('should not create user with duplicate username', async () => {
      const userData = {
        username: 'testuser',
        password: 'hashedpassword',
        publicKey: 'publickey',
        privateKey: 'privatekey',
        symmetricKey: 'symmetrickey'
      };

      await expect(User.create(userData)).rejects.toThrow();
    });

    it('should find user by username', async () => {
      const user = await User.findOne({ username: 'testuser' });
      expect(user).toBeDefined();
      expect(user.username).toBe('testuser');
    });
  });

  describe('Message Model', () => {
    it('should create message successfully', async () => {
      const messageData = {
        sender: 'testuser',
        recipient: 'recipientuser',
        content: 'Hello, this is a test message',
        encrypted: true,
        timestamp: new Date()
      };

      const message = await Message.create(messageData);
      expect(message.sender).toBe(messageData.sender);
      expect(message.recipient).toBe(messageData.recipient);
      expect(message.content).toBe(messageData.content);
      expect(message.encrypted).toBe(messageData.encrypted);
    });

    it('should find messages between users', async () => {
      const messages = await Message.find({
        $or: [
          { sender: 'testuser', recipient: 'recipientuser' },
          { sender: 'recipientuser', recipient: 'testuser' }
        ]
      }).sort({ timestamp: 1 });

      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThan(0);
    });
  });

  describe('Group Model', () => {
    it('should create group successfully', async () => {
      const groupData = {
        name: 'Test Group',
        creator: 'testuser',
        members: ['testuser', 'member1', 'member2'],
        createdAt: new Date()
      };

      const group = await Group.create(groupData);
      expect(group.name).toBe(groupData.name);
      expect(group.creator).toBe(groupData.creator);
      expect(group.members).toEqual(expect.arrayContaining(groupData.members));
    });

    it('should find groups by member', async () => {
      const groups = await Group.find({ members: 'testuser' });
      expect(Array.isArray(groups)).toBe(true);
      expect(groups.length).toBeGreaterThan(0);
    });

    it('should update group members', async () => {
      const group = await Group.findOne({ name: 'Test Group' });
      const newMembers = [...group.members, 'member3'];

      group.members = newMembers;
      await group.save();

      const updatedGroup = await Group.findOne({ name: 'Test Group' });
      expect(updatedGroup.members).toEqual(expect.arrayContaining(newMembers));
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection error', async () => {
      await closeDatabaseConnection();
      await expect(connectToDatabase('invalid-url')).rejects.toThrow();
      
      // Reconnect for other tests
      await connectToDatabase(mongoServer.getUri());
    });

    it('should handle model validation error', async () => {
      const invalidUserData = {
        username: '', // Empty username
        password: 'hashedpassword'
      };

      await expect(User.create(invalidUserData)).rejects.toThrow();
    });

    it('should handle duplicate key error', async () => {
      const userData = {
        username: 'testuser',
        password: 'hashedpassword',
        publicKey: 'publickey',
        privateKey: 'privatekey',
        symmetricKey: 'symmetrickey'
      };

      await expect(User.create(userData)).rejects.toThrow();
    });
  });
}); 