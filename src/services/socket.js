import { Server } from 'socket.io';
import pkg from 'web-push';
const { webpush } = pkg;
import { pushConfig } from '../config/index.js';

// Initialize web-push
webpush.setVapidDetails(
  `mailto:${pushConfig.vapidEmail}`,
  pushConfig.vapidPublicKey,
  pushConfig.vapidPrivateKey
);

// Store connected users
const connectedUsers = new Map();

// Initialize socket server
export function initializeSocket(server) {
  const io = new Server(server);

  // Handle socket connections
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Handle user login
    socket.on('login', (userData) => {
      const { username, databaseUrl } = userData;
      connectedUsers.set(username, { socket, databaseUrl });
      socket.username = username;
      socket.databaseUrl = databaseUrl;

      // Broadcast user list update
      io.emit('users', Array.from(connectedUsers.keys()));
    });

    // Handle chat message
    socket.on('chat message', async (data) => {
      const { receiver, message } = data;
      const sender = socket.username;

      // Get receiver's socket
      const receiverData = connectedUsers.get(receiver);
      if (receiverData) {
        // Send message to receiver
        receiverData.socket.emit('chat message', {
          sender,
          message,
          timestamp: new Date()
        });

        // Send notification if receiver is offline
        if (receiverData.socket.disconnected) {
          try {
            const { models } = await connectToPersonalDB(receiverData.databaseUrl);
            const user = await models.User.findOne({ username: receiver });
            if (user && user.push_subscription) {
              await webpush.sendNotification(
                JSON.parse(user.push_subscription),
                JSON.stringify({
                  title: `New message from ${sender}`,
                  body: message,
                  icon: '/icon.png'
                })
              );
            }
          } catch (error) {
            console.error('Error sending push notification:', error);
          }
        }
      }

      // Send message to sender
      socket.emit('chat message', {
        sender,
        message,
        timestamp: new Date()
      });
    });

    // Handle file message
    socket.on('file message', async (data) => {
      const { receiver, fileData } = data;
      const sender = socket.username;

      // Get receiver's socket
      const receiverData = connectedUsers.get(receiver);
      if (receiverData) {
        // Send file message to receiver
        receiverData.socket.emit('file message', {
          sender,
          fileData,
          timestamp: new Date()
        });

        // Send notification if receiver is offline
        if (receiverData.socket.disconnected) {
          try {
            const { models } = await connectToPersonalDB(receiverData.databaseUrl);
            const user = await models.User.findOne({ username: receiver });
            if (user && user.push_subscription) {
              await webpush.sendNotification(
                JSON.parse(user.push_subscription),
                JSON.stringify({
                  title: `New file from ${sender}`,
                  body: `File: ${fileData.name}`,
                  icon: '/icon.png'
                })
              );
            }
          } catch (error) {
            console.error('Error sending push notification:', error);
          }
        }
      }

      // Send file message to sender
      socket.emit('file message', {
        sender,
        fileData,
        timestamp: new Date()
      });
    });

    // Handle group message
    socket.on('group message', async (data) => {
      const { groupId, message } = data;
      const sender = socket.username;

      // Get group members
      const { models } = await connectToPersonalDB(socket.databaseUrl);
      const group = await models.GroupChat.findById(groupId);
      if (!group) return;

      // Send message to all online group members
      for (const member of group.members) {
        if (member !== sender) {
          const memberData = connectedUsers.get(member);
          if (memberData) {
            memberData.socket.emit('group message', {
              groupId,
              sender,
              message,
              timestamp: new Date()
            });
          }
        }
      }

      // Send message to sender
      socket.emit('group message', {
        groupId,
        sender,
        message,
        timestamp: new Date()
      });
    });

    // Handle group file message
    socket.on('group file message', async (data) => {
      const { groupId, fileData } = data;
      const sender = socket.username;

      // Get group members
      const { models } = await connectToPersonalDB(socket.databaseUrl);
      const group = await models.GroupChat.findById(groupId);
      if (!group) return;

      // Send file message to all online group members
      for (const member of group.members) {
        if (member !== sender) {
          const memberData = connectedUsers.get(member);
          if (memberData) {
            memberData.socket.emit('group file message', {
              groupId,
              sender,
              fileData,
              timestamp: new Date()
            });
          }
        }
      }

      // Send file message to sender
      socket.emit('group file message', {
        groupId,
        sender,
        fileData,
        timestamp: new Date()
      });
    });

    // Handle user typing
    socket.on('typing', (data) => {
      const { receiver } = data;
      const sender = socket.username;

      // Get receiver's socket
      const receiverData = connectedUsers.get(receiver);
      if (receiverData) {
        receiverData.socket.emit('typing', { sender });
      }
    });

    // Handle user stop typing
    socket.on('stop typing', (data) => {
      const { receiver } = data;
      const sender = socket.username;

      // Get receiver's socket
      const receiverData = connectedUsers.get(receiver);
      if (receiverData) {
        receiverData.socket.emit('stop typing', { sender });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      if (socket.username) {
        connectedUsers.delete(socket.username);
        io.emit('users', Array.from(connectedUsers.keys()));
      }
    });
  });

  return io;
} 