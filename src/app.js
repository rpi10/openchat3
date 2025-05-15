import express from 'express';
import session from 'express-session';
import multer from 'multer';
import path from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { appConfig, pathConfig } from './config/index.js';
import { connectToGeneralDB, closeAllConnections } from './services/database.js';
import { initializeSocket } from './services/socket.js';
import authRoutes from './routes/auth.js';
import messageRoutes from './routes/messages.js';
import groupRoutes from './routes/groups.js';
import aiRoutes from './routes/ai.js';

// Get current file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Express app
const app = express();

// Create HTTP server
const server = createServer(app);

// Initialize socket server
const io = initializeSocket(server);

// Configure session
app.use(session({
  secret: appConfig.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: appConfig.isProduction,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(pathConfig.publicDir));
app.use('/uploads', express.static(pathConfig.uploadsDir));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(pathConfig.publicDir, 'index.html'));
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/ai', aiRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
async function startServer() {
  try {
    // Connect to general database
    await connectToGeneralDB();

    // Start server
    server.listen(appConfig.port, () => {
      console.log(`Server running on port ${appConfig.port}`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await closeAllConnections();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start server
startServer(); 