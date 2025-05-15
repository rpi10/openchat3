import express from 'express';
import {
  createGroup,
  getUserGroups,
  addGroupMembers,
  removeGroupMembers,
  updateGroupName,
  deleteGroup,
  getGroupMembers
} from '../services/group.js';
import {
  saveGroupMessage,
  saveGroupFileMessage,
  getGroupChatHistory
} from '../services/message.js';
import { uploadToB2, saveFileLocally, validateFile, generateFilename } from '../services/file.js';

const router = express.Router();

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Create new group
router.post('/create', requireAuth, async (req, res) => {
  try {
    const { name, members } = req.body;
    const { username, databaseUrl } = req.session.user;

    // Create group
    const group = await createGroup(name, username, members, databaseUrl);

    res.status(201).json({
      message: 'Group created successfully',
      data: group
    });
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user's groups
router.get('/list', requireAuth, async (req, res) => {
  try {
    const { username, databaseUrl } = req.session.user;

    // Get user's groups
    const groups = await getUserGroups(username, databaseUrl);

    res.json({
      message: 'Groups retrieved successfully',
      data: groups
    });
  } catch (error) {
    console.error('Error getting user groups:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add members to group
router.post('/:groupId/members/add', requireAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { members } = req.body;
    const { databaseUrl } = req.session.user;

    // Add members
    const group = await addGroupMembers(groupId, members, databaseUrl);

    res.json({
      message: 'Members added successfully',
      data: group
    });
  } catch (error) {
    console.error('Error adding group members:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove members from group
router.post('/:groupId/members/remove', requireAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { members } = req.body;
    const { databaseUrl } = req.session.user;

    // Remove members
    const group = await removeGroupMembers(groupId, members, databaseUrl);

    res.json({
      message: 'Members removed successfully',
      data: group
    });
  } catch (error) {
    console.error('Error removing group members:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update group name
router.put('/:groupId/name', requireAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name } = req.body;
    const { databaseUrl } = req.session.user;

    // Update group name
    const group = await updateGroupName(groupId, name, databaseUrl);

    res.json({
      message: 'Group name updated successfully',
      data: group
    });
  } catch (error) {
    console.error('Error updating group name:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete group
router.delete('/:groupId', requireAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { databaseUrl } = req.session.user;

    // Delete group
    await deleteGroup(groupId, databaseUrl);

    res.json({
      message: 'Group deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get group members
router.get('/:groupId/members', requireAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { databaseUrl } = req.session.user;

    // Get group members
    const members = await getGroupMembers(groupId, databaseUrl);

    res.json({
      message: 'Group members retrieved successfully',
      data: members
    });
  } catch (error) {
    console.error('Error getting group members:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send group message
router.post('/:groupId/messages/send', requireAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { message } = req.body;
    const { username, databaseUrl } = req.session.user;

    // Save group message
    const savedMessage = await saveGroupMessage(groupId, username, message, databaseUrl);

    res.json({
      message: 'Group message sent successfully',
      data: savedMessage
    });
  } catch (error) {
    console.error('Error sending group message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send group file message
router.post('/:groupId/messages/send-file', requireAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { message } = req.body;
    const { username, databaseUrl } = req.session.user;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Validate file
    validateFile(file);

    // Generate filename
    const filename = generateFilename(file.originalname);

    // Upload file
    let fileData;
    if (process.env.USE_B2 === 'true') {
      fileData = await uploadToB2(file, filename);
    } else {
      fileData = await saveFileLocally(file, filename);
    }

    // Add message to file data
    fileData.message = message;

    // Save group file message
    const savedMessage = await saveGroupFileMessage(groupId, username, fileData, databaseUrl);

    res.json({
      message: 'Group file message sent successfully',
      data: savedMessage
    });
  } catch (error) {
    console.error('Error sending group file message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get group chat history
router.get('/:groupId/messages/history', requireAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { databaseUrl } = req.session.user;

    // Get group chat history
    const messages = await getGroupChatHistory(groupId, databaseUrl);

    res.json({
      message: 'Group chat history retrieved successfully',
      data: messages
    });
  } catch (error) {
    console.error('Error getting group chat history:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router; 