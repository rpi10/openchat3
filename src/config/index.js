import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// App configuration
export const appConfig = {
  port: process.env.PORT || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'your-secret-key',
  isProduction: process.env.NODE_ENV === 'production'
};

// Database configuration
export const dbConfig = {
  generalDbName: "openchat",
  generalDbURI: process.env.GENERAL_MONGO_URI ||
    'mongodb+srv://londonjeremie:Narnia2010@cluster0.mtuev.mongodb.net/openchat?retryWrites=true&w=majority',
  mongoOptions: {
    tls: true,
    tlsAllowInvalidCertificates: true,
    tlsAllowInvalidHostnames: true,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    maxPoolSize: 10,
    minPoolSize: 1,
    retryWrites: true,
    retryReads: true
  }
};

// File upload configuration
export const uploadConfig = {
  maxFileSize: 25 * 1024 * 1024, // 25MB
  supportedAudioTypes: [
    'audio/flac', 'audio/mp3', 'audio/mp4', 'audio/mpeg',
    'audio/mpga', 'audio/m4a', 'audio/ogg', 'audio/wav', 'audio/webm'
  ]
};

// AI configuration
export const aiConfig = {
  groqApiKey: process.env.GROQ_API_KEY,
  model: "llama-3.3-70b-versatile"
};

// Push notification configuration
export const pushConfig = {
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  vapidEmail: 'mailto:jeremie.html@gmail.com'
};

// Path configuration
export const pathConfig = {
  rootDir: path.join(__dirname, '..', '..'),
  publicDir: path.join(__dirname, '..', '..', 'public'),
  uploadsDir: path.join(__dirname, '..', '..', 'public', 'uploads'),
  tempDir: path.join(__dirname, '..', '..', 'temp')
};

// Fix template variables in environment variables
let databasePublicUrl = process.env.DATABASE_PUBLIC_URL;
if (databasePublicUrl && (databasePublicUrl.includes('${{') || databasePublicUrl.includes('}}'))) {
  console.warn('Environment variable DATABASE_PUBLIC_URL contains template variables. Setting to null.');
  process.env.DATABASE_PUBLIC_URL = null;
} 