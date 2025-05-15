const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const { createTestUser, loginTestUser, createTestGroup } = require('./utils/testUtils');

let mongoServer;
let authToken;
let testUser;
let testGroup;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Create and login test user
  testUser = await createTestUser();
  const loginResponse = await loginTestUser(testUser);
  authToken = loginResponse.token;

  // Create a test group
  testGroup = await createTestGroup(authToken, {
    name: 'Test Group',
    members: ['member1', 'member2']
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Group Endpoints', () => {
  describe('POST /api/groups/create', () => {
    it('should create a new group successfully', async () => {
      const groupData = {
        name: 'New Test Group',
        members: ['member1', 'member2', 'member3']
      };

      const res = await request(app)
        .post('/api/groups/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send(groupData);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Group created successfully');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('name', groupData.name);
      expect(res.body.data.members).toHaveLength(groupData.members.length);
    });

    it('should not create group without authentication', async () => {
      const groupData = {
        name: 'New Test Group',
        members: ['member1', 'member2']
      };

      const res = await request(app)
        .post('/api/groups/create')
        .send(groupData);

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/groups/list', () => {
    it('should get user groups successfully', async () => {
      const res = await request(app)
        .get('/api/groups/list')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Groups retrieved successfully');
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should not get groups without authentication', async () => {
      const res = await request(app)
        .get('/api/groups/list');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/groups/:groupId/members/add', () => {
    it('should add members to group successfully', async () => {
      const newMembers = ['member4', 'member5'];

      const res = await request(app)
        .post(`/api/groups/${testGroup._id}/members/add`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ members: newMembers });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Members added successfully');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data.members).toContain(newMembers[0]);
      expect(res.body.data.members).toContain(newMembers[1]);
    });

    it('should not add members without authentication', async () => {
      const res = await request(app)
        .post(`/api/groups/${testGroup._id}/members/add`)
        .send({ members: ['member6'] });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/groups/:groupId/members/remove', () => {
    it('should remove members from group successfully', async () => {
      const membersToRemove = ['member1', 'member2'];

      const res = await request(app)
        .post(`/api/groups/${testGroup._id}/members/remove`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ members: membersToRemove });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Members removed successfully');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data.members).not.toContain(membersToRemove[0]);
      expect(res.body.data.members).not.toContain(membersToRemove[1]);
    });

    it('should not remove members without authentication', async () => {
      const res = await request(app)
        .post(`/api/groups/${testGroup._id}/members/remove`)
        .send({ members: ['member1'] });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('PUT /api/groups/:groupId/name', () => {
    it('should update group name successfully', async () => {
      const newName = 'Updated Group Name';

      const res = await request(app)
        .put(`/api/groups/${testGroup._id}/name`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: newName });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Group name updated successfully');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('name', newName);
    });

    it('should not update group name without authentication', async () => {
      const res = await request(app)
        .put(`/api/groups/${testGroup._id}/name`)
        .send({ name: 'New Name' });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('DELETE /api/groups/:groupId', () => {
    it('should delete group successfully', async () => {
      const res = await request(app)
        .delete(`/api/groups/${testGroup._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Group deleted successfully');
    });

    it('should not delete group without authentication', async () => {
      const res = await request(app)
        .delete(`/api/groups/${testGroup._id}`);

      expect(res.statusCode).toBe(401);
    });
  });
}); 