import { connectToPersonalDB, getModels } from './database.js';

// Create new group
export async function createGroup(name, creator, members, databaseUrl) {
  try {
    const { models } = await connectToPersonalDB(databaseUrl);

    // Create group
    const group = new models.GroupChat({
      _id: crypto.randomBytes(16).toString('hex'),
      name,
      creator,
      members: [...new Set([creator, ...members])]
    });
    await group.save();

    return group;
  } catch (error) {
    console.error('Error creating group:', error);
    throw error;
  }
}

// Get user's groups
export async function getUserGroups(username, databaseUrl) {
  try {
    const { models } = await connectToPersonalDB(databaseUrl);

    // Find groups where user is a member
    const groups = await models.GroupChat.find({
      members: username
    }).sort({ updated_at: -1 });

    return groups;
  } catch (error) {
    console.error('Error getting user groups:', error);
    throw error;
  }
}

// Add members to group
export async function addGroupMembers(groupId, members, databaseUrl) {
  try {
    const { models } = await connectToPersonalDB(databaseUrl);

    // Get group
    const group = await models.GroupChat.findById(groupId);
    if (!group) {
      throw new Error('Group not found');
    }

    // Add new members
    group.members = [...new Set([...group.members, ...members])];
    group.updated_at = new Date();
    await group.save();

    return group;
  } catch (error) {
    console.error('Error adding group members:', error);
    throw error;
  }
}

// Remove members from group
export async function removeGroupMembers(groupId, members, databaseUrl) {
  try {
    const { models } = await connectToPersonalDB(databaseUrl);

    // Get group
    const group = await models.GroupChat.findById(groupId);
    if (!group) {
      throw new Error('Group not found');
    }

    // Remove members
    group.members = group.members.filter(member => !members.includes(member));
    group.updated_at = new Date();
    await group.save();

    return group;
  } catch (error) {
    console.error('Error removing group members:', error);
    throw error;
  }
}

// Update group name
export async function updateGroupName(groupId, newName, databaseUrl) {
  try {
    const { models } = await connectToPersonalDB(databaseUrl);

    // Update group name
    const group = await models.GroupChat.findByIdAndUpdate(
      groupId,
      {
        name: newName,
        updated_at: new Date()
      },
      { new: true }
    );

    if (!group) {
      throw new Error('Group not found');
    }

    return group;
  } catch (error) {
    console.error('Error updating group name:', error);
    throw error;
  }
}

// Delete group
export async function deleteGroup(groupId, databaseUrl) {
  try {
    const { models } = await connectToPersonalDB(databaseUrl);

    // Delete group and its messages
    await Promise.all([
      models.GroupChat.findByIdAndDelete(groupId),
      models.GroupMessage.deleteMany({ group_id: groupId })
    ]);
  } catch (error) {
    console.error('Error deleting group:', error);
    throw error;
  }
}

// Get group members
export async function getGroupMembers(groupId, databaseUrl) {
  try {
    const { models } = await connectToPersonalDB(databaseUrl);

    // Get group
    const group = await models.GroupChat.findById(groupId);
    if (!group) {
      throw new Error('Group not found');
    }

    return group.members;
  } catch (error) {
    console.error('Error getting group members:', error);
    throw error;
  }
} 