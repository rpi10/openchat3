import { connectToPersonalDB, getModels } from './database.js';
import { encryptMessage, decryptMessage } from './auth.js';

// Save message to personal database
export async function saveMessage(sender, receiver, message, databaseUrl, isEncrypted = true) {
  try {
    const { models } = await connectToPersonalDB(databaseUrl);

    // Get receiver's public key if message needs to be encrypted
    let encryptedMessage = message;
    if (isEncrypted) {
      const receiverUser = await models.User.findOne({ username: receiver });
      if (!receiverUser) {
        throw new Error('Receiver not found');
      }
      encryptedMessage = encryptMessage(message, receiverUser.public_key);
    }

    // Save message
    const newMessage = new models.Message({
      sender,
      receiver,
      message: encryptedMessage,
      is_encrypted: isEncrypted
    });
    await newMessage.save();

    return newMessage;
  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
}

// Save file message to personal database
export async function saveFileMessage(sender, receiver, fileData, databaseUrl, isEncrypted = true) {
  try {
    const { models } = await connectToPersonalDB(databaseUrl);

    // Get receiver's public key if message needs to be encrypted
    let encryptedMessage = fileData.message;
    if (isEncrypted && fileData.message) {
      const receiverUser = await models.User.findOne({ username: receiver });
      if (!receiverUser) {
        throw new Error('Receiver not found');
      }
      encryptedMessage = encryptMessage(fileData.message, receiverUser.public_key);
    }

    // Save file message
    const newMessage = new models.Message({
      sender,
      receiver,
      message: encryptedMessage,
      file_url: fileData.url,
      file_name: fileData.name,
      file_type: fileData.type,
      file_size: fileData.size,
      is_encrypted: isEncrypted
    });
    await newMessage.save();

    return newMessage;
  } catch (error) {
    console.error('Error saving file message:', error);
    throw error;
  }
}

// Get chat history
export async function getChatHistory(username, otherUser, databaseUrl, privateKey) {
  try {
    const { models } = await connectToPersonalDB(databaseUrl);

    // Get messages between users
    const messages = await models.Message.find({
      $or: [
        { sender: username, receiver: otherUser },
        { sender: otherUser, receiver: username }
      ]
    }).sort({ timestamp: 1 });

    // Decrypt messages if needed
    return messages.map(msg => {
      const message = { ...msg.toObject() };
      if (message.is_encrypted && message.message) {
        message.message = decryptMessage(message.message, privateKey);
      }
      return message;
    });
  } catch (error) {
    console.error('Error getting chat history:', error);
    throw error;
  }
}

// Save group message
export async function saveGroupMessage(groupId, sender, message, databaseUrl, isEncrypted = false) {
  try {
    const { models } = await connectToPersonalDB(databaseUrl);

    // Save group message
    const newMessage = new models.GroupMessage({
      group_id: groupId,
      sender,
      message,
      is_encrypted: isEncrypted
    });
    await newMessage.save();

    return newMessage;
  } catch (error) {
    console.error('Error saving group message:', error);
    throw error;
  }
}

// Save group file message
export async function saveGroupFileMessage(groupId, sender, fileData, databaseUrl, isEncrypted = false) {
  try {
    const { models } = await connectToPersonalDB(databaseUrl);

    // Save group file message
    const newMessage = new models.GroupMessage({
      group_id: groupId,
      sender,
      message: fileData.message,
      file_url: fileData.url,
      file_name: fileData.name,
      file_type: fileData.type,
      file_size: fileData.size,
      is_encrypted: isEncrypted
    });
    await newMessage.save();

    return newMessage;
  } catch (error) {
    console.error('Error saving group file message:', error);
    throw error;
  }
}

// Get group chat history
export async function getGroupChatHistory(groupId, databaseUrl) {
  try {
    const { models } = await connectToPersonalDB(databaseUrl);

    // Get group messages
    const messages = await models.GroupMessage.find({ group_id: groupId })
      .sort({ timestamp: 1 });

    return messages;
  } catch (error) {
    console.error('Error getting group chat history:', error);
    throw error;
  }
} 