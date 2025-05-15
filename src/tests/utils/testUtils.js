const request = require('supertest');
const app = require('../../app');
const crypto = require('crypto');

const createTestUser = async () => {
  const testUser = {
    username: `testuser_${crypto.randomBytes(4).toString('hex')}`,
    password: 'testpass123',
    databaseUrl: 'mongodb://localhost:27017/testdb'
  };

  await request(app)
    .post('/api/auth/register')
    .send(testUser);

  return testUser;
};

const loginTestUser = async (user) => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({
      username: user.username,
      password: user.password
    });

  return {
    token: res.body.token,
    user: res.body.user
  };
};

const createTestGroup = async (authToken, groupData) => {
  const res = await request(app)
    .post('/api/groups/create')
    .set('Authorization', `Bearer ${authToken}`)
    .send(groupData);

  return res.body.data;
};

const sendTestMessage = async (authToken, messageData) => {
  const res = await request(app)
    .post('/api/messages/send')
    .set('Authorization', `Bearer ${authToken}`)
    .send(messageData);

  return res.body.data;
};

module.exports = {
  createTestUser,
  loginTestUser,
  createTestGroup,
  sendTestMessage
}; 