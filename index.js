import express from 'express';
import multer from 'multer';
import B2 from 'backblaze-b2';
import path from 'path';
import bcrypt from 'bcrypt';
import session from 'express-session';
import cors from 'cors';
import webpush from 'web-push';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Groq from 'groq-sdk';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { JSDOM } from "jsdom";

dotenv.config();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 300;
app.use(express.json());

// Fix template variables in environment variables
let databasePublicUrl = process.env.DATABASE_PUBLIC_URL;
if (databasePublicUrl && (databasePublicUrl.includes('${{') || databasePublicUrl.includes('}}'))) {
  console.warn('Environment variable DATABASE_PUBLIC_URL contains template variables. Setting to null.');
  process.env.DATABASE_PUBLIC_URL = null;
}

// ----------------------------
// Initialize Backblaze B2 & Multer
// ----------------------------
const b2 = new B2({
  applicationKeyId: process.env.B2_APPLICATION_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY
});
const upload = multer({ storage: multer.memoryStorage() });

// ----------------------------
// Serve Static Files & Fallback Route
// ----------------------------
app.use(express.static(path.join(__dirname, 'public')));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ----------------------------
// File Upload Endpoint (Backblaze B2)
// ----------------------------
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  try {
    await b2.authorize();
    const { data: { uploadUrl, authorizationToken } } = await b2.getUploadUrl({
      bucketId: process.env.B2_BUCKET_ID
    });
    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    await b2.uploadFile({
      uploadUrl,
      uploadAuthToken: authorizationToken,
      fileName,
      data: fileBuffer,
      contentType: req.file.mimetype
    });
    const publicUrl = `${process.env.B2_BUCKET_URL}/${fileName}`;
    res.json({ url: publicUrl });
  } catch (err) {
    console.error('Error uploading file:', err);
    res.status(500).json({ error: 'Error uploading the file.' });
  }
});

// ----------------------------
// Transcription Endpoint (Groq API)
// ----------------------------
app.post("/transcribe", upload.single('audio'), async (req, res) => {
  try {
    let audioBuffer;
    let filename;
    
    if (req.file) {
      audioBuffer = req.file.buffer;
      filename = req.file.originalname;
      const MAX_FILE_SIZE = 25 * 1024 * 1024;
      if (req.file.size > MAX_FILE_SIZE) {
        return res.status(400).json({ error: "File size exceeds 25MB limit." });
      }
      const supportedTypes = [
        'audio/flac', 'audio/mp3', 'audio/mp4', 'audio/mpeg',
        'audio/mpga', 'audio/m4a', 'audio/ogg', 'audio/wav', 'audio/webm'
      ];
      if (!supportedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ 
          error: "Unsupported file type. Supported types: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm" 
        });
      }
    } else if (req.body && req.body.url) {
      const audioUrl = req.body.url;
      console.log("Fetching audio from URL:", audioUrl);
      const response = await fetch(audioUrl);
      if (!response.ok) {
        return res.status(400).json({ error: `Failed to fetch audio from URL. Status: ${response.status}` });
      }
      const contentType = response.headers.get('content-type');
      if (contentType) console.log("Fetched content-type:", contentType);
      audioBuffer = Buffer.from(await response.arrayBuffer());
      filename = path.basename(audioUrl) || `audio_${Date.now()}.mp3`;
      const MAX_FILE_SIZE = 25 * 1024 * 1024;
      if (audioBuffer.length > MAX_FILE_SIZE) {
        return res.status(400).json({ error: "File size exceeds 25MB limit." });
      }
    } else {
      return res.status(400).json({ error: "No audio provided. Please upload a file or provide a URL." });
    }
    
    if (!audioBuffer) {
      return res.status(400).json({ error: "Failed to process audio." });
    }
    
    const tempDir = path.join(__dirname, "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    const tempPath = path.join(tempDir, `temp_${Date.now()}_${filename}`);
    fs.writeFileSync(tempPath, audioBuffer);
    console.log(`Temporary file created: ${tempPath}`);
    
    const fileStream = fs.createReadStream(tempPath);
    
    console.log("Calling Groq API for transcription...");
    const transcription = await groq.audio.transcriptions.create({
      file: fileStream,
      model: "whisper-large-v3-turbo",
      response_format: "json",
      temperature: 0.0,
    });
    console.log("Transcription result:", transcription);
    
    fs.unlinkSync(tempPath);
    console.log(`Temporary file deleted: ${tempPath}`);
    
    res.json({ text: transcription.text });
  } catch (error) { 
    console.error("Transcription error:", error); 
    res.status(500).json({ error: error.message }); 
  }
});

// ----------------------------
// AI Tools Endpoints (Groq API)
// ----------------------------

// Chat AI endpoint
app.post("/ai-chat", async (req, res) => {
  try {
    const { message } = req.body;
    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: message }],
      model: "llama-3.3-70b-versatile",
    });
    res.json({ reply: response.choices[0]?.message?.content || "No response" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debate Argument Checker endpoint
app.post("/checkargument", async (req, res) => {
  try {
    const { argument } = req.body;
    if (!argument) return res.json({ error: "Please provide an argument." });

    const prompt = `Evaluate the following debate argument for its logic, evidence, and persuasiveness.
Return your evaluation as a valid JSON object with exactly two keys:
  "rating": an integer between 1 and 5 (1 means "very bad argument" and 5 means "excellent argument"),
  "explanation": a brief explanation of your rating.
Return ONLY the JSON object with no additional text.
Argument: "${argument}"`;

    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
    });
    const content = response.choices[0]?.message?.content || "";
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      result = { rating: 3, explanation: "Could not parse model response. Please try again." };
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search sources functionality
async function getDuckDuckGoSources(query) {
  try {
    const duckDuckGoUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const response = await fetch(duckDuckGoUrl);
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const allLinks = Array.from(document.querySelectorAll("a"));
    const filteredLinks = allLinks.filter(link => link.href && link.href.includes("uddg="));
    const sources = filteredLinks.slice(0, 5).map(link => {
      const base = "https://lite.duckduckgo.com";
      const urlObj = new URL(link.href, base);
      const uddg = urlObj.searchParams.get("uddg");
      return {
        title: link.textContent.trim() || "No Title",
        url: uddg ? decodeURIComponent(uddg) : link.href
      };
    });
    return sources;
  } catch (error) {
    console.error("DuckDuckGo API Error:", error);
    return [];
  }
}

app.post("/searchsources", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.json({ error: "Please provide a search query." });
    const sources = await getDuckDuckGoSources(query);
    res.json({ sources });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Automatic Correction endpoint
app.post("/correct", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.json({ error: "Please provide text to correct." });
    // The prompt instructs the model to output only the corrected text with no extra comments.
    const prompt = `Correct the following text in any language. Provide only the corrected text, with no extra commentary.
Text: "${text}"`;
    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
    });
    const corrected = response.choices[0]?.message?.content.trim() || "";
    res.json({ corrected });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// New route for image generation using Cloudflare API
app.post('/generate-image', async (req, res) => {
  try {
    const { prompt, style } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'No prompt provided' });
    }
    
    // Prepare the prompt with style if provided
    let enhancedPrompt = prompt;
    if (style) {
      switch(style) {
        case 'artistic':
          enhancedPrompt = `Artistic style: ${prompt}`;
          break;
        case 'cartoon':
          enhancedPrompt = `Cartoon style: ${prompt}`;
          break;
        case '3d':
          enhancedPrompt = `3D rendered: ${prompt}`;
          break;
        // Default is 'realistic' - no modification needed
      }
    }
    
    // Call the Cloudflare API directly using the provided API details
    const response = await fetch(
      "https://api.cloudflare.com/client/v4/accounts/4be3f036c45adb877ff37b51352c7601/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0", 
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer eC5FxFMBvDnESYCBBVn-D5K8FRq7jj_uuBVwSKRQ",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          num_steps: 20,
          width: 1024,
          height: 1024
        })
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cloudflare API error:', errorText);
      return res.status(response.status).json({ 
        error: 'Image generation failed',
        details: errorText
      });
    }
    
    // Get binary image data and convert to base64
    const imageBuffer = await response.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    
    // Return base64 image data
    res.json({ image: base64Image });
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

// ----------------------------
// Session Middleware
// ----------------------------
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    httpOnly: false
  }
}));

// ----------------------------
// Initialize MongoDB (General Database) with Mongoose
// ----------------------------
const generalDbName = "openchat";
const generalDbURI = process.env.GENERAL_MONGO_URI ||
  `mongodb+srv://londonjeremie:Narnia2010@cluster0.mtuev.mongodb.net/${generalDbName}?retryWrites=true&w=majority`;

// Fix MongoDB connection options to be fully compatible with all environments
const mongoOptions = {
  // Basic connection options
  tls: true, 
  tlsAllowInvalidCertificates: true, // Required for some MongoDB Atlas connections
  tlsAllowInvalidHostnames: true,    // Allow hostname mismatch for difficult connections
  
  // Timeouts
  serverSelectionTimeoutMS: 30000,   // Longer timeouts for connection issues
  socketTimeoutMS: 45000,
  connectTimeoutMS: 30000,
  
  // Connection pool
  maxPoolSize: 10,                   // Smaller pool for better stability
  minPoolSize: 1,
  
  // Other options
  retryWrites: true,
  retryReads: true
  
  // Remove deprecated options
  // useNewUrlParser: true,         // This is deprecated
  // ssl: true,                     // Use tls instead
  // sslValidate: false             // Use tlsAllowInvalidCertificates instead
};

// Connect with retry logic and better error handling
let retryCount = 0;
const maxRetries = 5;

function connectWithRetry() {
  console.log(`MongoDB connection attempt ${retryCount + 1} of ${maxRetries}`);
  
  // Progress indication for debugging
  console.log(`Connecting to MongoDB at ${generalDbURI} with options:`, mongoOptions);
  
  mongoose.connect(generalDbURI, mongoOptions)
    .then(() => {
      console.log(`✅ Connected to MongoDB general database: "${generalDbName}" created successfully!`);
    })
    .catch((error) => {
      console.error('❌ Connection error to MongoDB general database:', error);
      
      // More detailed error handling to help diagnose issues
      if (error.name === 'MongoServerSelectionError') {
        console.error('MongoDB server selection failed - check if MongoDB server is running or if connection string is correct');
      } else if (error.name === 'MongoNetworkError') {
        console.error('MongoDB network error - check network connectivity and firewall settings');
        
        // TLS/SSL specific error handling
        if (error.message && error.message.includes('SSL')) {
          console.error('TLS/SSL error detected. Consider adjusting TLS settings or using a non-TLS connection if appropriate');
        }
      }
      
      retryCount++;
      
      if (retryCount < maxRetries) {
        const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Exponential backoff with max 30sec
        console.log(`Retrying connection in ${retryDelay/1000} seconds...`);
        setTimeout(connectWithRetry, retryDelay);
      } else {
        console.error(`Failed to connect to MongoDB after ${maxRetries} attempts. Using fallback authentication.`);
        // Set up fallback authentication method that doesn't require DB connection
        setupFallbackAuth();
      }
    });
}

// Start connection process
connectWithRetry();

// Fallback authentication function when MongoDB is unreachable
function setupFallbackAuth() {
  console.log("Setting up fallback authentication without database dependency");
  
  // Store a temporary in-memory user store for the session
  const tempUsers = {};
  
  // Add fallback authentication socket handler
  io.on('connection', (socket) => {
    socket.on('fallback auth', ({ username, password }) => {
      // Simple in-memory authentication for fallback
      if (tempUsers[username]) {
        // Check password
        if (password === tempUsers[username].password) {
          socket.username = username;
          socket.emit('login success', { 
            username: username, 
            authentificator: 'temporary-' + Math.random().toString(36).substring(2, 10)
          });
        } else {
          socket.emit('login failed', 'Invalid password');
        }
      } else {
        // New user registration on fallback
        tempUsers[username] = { password, online: true };
        socket.username = username;
        socket.emit('login success', { 
          username: username, 
          authentificator: 'temporary-' + Math.random().toString(36).substring(2, 10)
        });
      }
    });
  });
}

// Define a Mongoose schema and model for general users
const generalUserSchema = new mongoose.Schema({
  authentificator: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  password: String,
  database_url: { type: String, required: true }
});
const GeneralUser = mongoose.model('GeneralUser', generalUserSchema);

// Define schemas for personal database
const personalUserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: String,
  online: { type: Boolean, default: false },
  push_subscription: String,
  public_key: String,
  private_key: String,
  symmetric_key: String
});

const personalMessageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  receiver: { type: String, required: true },
  message: String,
  file_url: String,
  file_name: String,
  file_type: String,
  file_size: Number,
  timestamp: { type: Date, default: Date.now },
  is_encrypted: { type: Boolean, default: true }
});

const personalExternalDatabaseSchema = new mongoose.Schema({
  username: { type: String, required: true },
  authentificator: { type: String, required: true },
  database_url: { type: String, required: true },
  public_key: String
});

// Group Chat Schema - update it to include additional fields
const groupChatSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  creator: { type: String, required: true },
  members: [String],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Group Message Schema
const groupMessageSchema = new mongoose.Schema({
  group_id: { type: String, required: true },
  sender: { type: String, required: true },
  message: String,
  file_url: String,
  file_name: String,
  file_type: String,
  file_size: Number,
  timestamp: { type: Date, default: Date.now },
  is_encrypted: { type: Boolean, default: false }
});

// Create a connection cache to reuse database connections
const dbConnectionCache = new Map();

// Function to get or create a personal database connection with caching
async function createPersonalDatabaseConnection(databaseUrl) {
  if (!databaseUrl) {
    throw new Error('Database URL is required');
  }
  
  // Handle template variables in database URL
  let sanitizedUrl = databaseUrl;
  
  // Check for template variables like ${{Postgres.DATABASE_PUBLIC_URL}}
  if (sanitizedUrl.includes('${{') && sanitizedUrl.includes('}}')) {
    console.log(`Found template variable in URL: ${sanitizedUrl}`);
    
    // Use the general MongoDB URI as fallback
    sanitizedUrl = process.env.GENERAL_MONGO_URI || 
      'mongodb+srv://londonjeremie:Narnia2010@cluster0.mtuev.mongodb.net/openchat?retryWrites=true&w=majority';
    
    console.log(`Replaced template with actual MongoDB URL: ${sanitizedUrl}`);
  }
  
  // Sanitize/fix the connection string if needed
  if (!sanitizedUrl.startsWith('mongodb://') && !sanitizedUrl.startsWith('mongodb+srv://')) {
    // Check if it's just missing the protocol
    if (sanitizedUrl.includes('@') && sanitizedUrl.includes('.')) {
      sanitizedUrl = 'mongodb+srv://' + sanitizedUrl;
    } else {
      console.error('Invalid MongoDB connection string:', sanitizedUrl);
      throw new Error('Invalid MongoDB connection string format');
    }
  }
  
  // Check if we already have a connection for this URL in the cache
  if (dbConnectionCache.has(sanitizedUrl)) {
    const cachedConnection = dbConnectionCache.get(sanitizedUrl);
    
    // Check if connection is still active
    if (cachedConnection.connection.readyState === 1) { // 1 = connected
      console.log(`Reusing existing connection for: ${sanitizedUrl.substring(0, 20)}...`);
      return cachedConnection;
    } else {
      console.log(`Connection in cache is no longer active, creating new one for: ${sanitizedUrl.substring(0, 20)}...`);
      dbConnectionCache.delete(sanitizedUrl);
    }
  }
  
  try {
    // Use fully compatible connection options with pooling
    const personalMongoOptions = {
      tls: true,
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      retryWrites: true,
      maxPoolSize: 5,       // Smaller pool size
      minPoolSize: 1,
      maxIdleTimeMS: 30000  // Close idle connections after 30s
    };
    
    console.log(`Creating new connection to: ${sanitizedUrl.substring(0, 20)}...`);
    
    // Connect with enhanced options
    const connection = await mongoose.createConnection(sanitizedUrl, personalMongoOptions);
    
    // Create models for this connection
    const User = connection.model('User', personalUserSchema);
    const Message = connection.model('Message', personalMessageSchema);
    const ExternalDatabase = connection.model('ExternalDatabase', personalExternalDatabaseSchema);
    
    // Add Group models
    const GroupChat = connection.model('GroupChat', groupChatSchema);
    const GroupMessage = connection.model('GroupMessage', groupMessageSchema);
    
    // Store in cache
    const connectionData = { connection, User, Message, ExternalDatabase, GroupChat, GroupMessage };
    dbConnectionCache.set(sanitizedUrl, connectionData);
    
    // Set up event listeners to handle connection issues
    connection.on('error', (err) => {
      console.error(`Connection error for ${sanitizedUrl.substring(0, 20)}...`, err);
      dbConnectionCache.delete(sanitizedUrl);
    });
    
    connection.on('disconnected', () => {
      console.log(`Connection to ${sanitizedUrl.substring(0, 20)}... was disconnected`);
      dbConnectionCache.delete(sanitizedUrl);
    });
    
    return connectionData;
  } catch (error) {
    console.error('Error creating personal database connection:', error);
    
    // Enhanced error reporting
    if (error.name === 'MongoServerSelectionError') {
      console.error('Failed to select MongoDB server - check if the server is running and accessible');
    } else if (error.name === 'MongoNetworkError') {
      console.error('MongoDB network error - possible connectivity issues or firewall blocking');
      
      // Check for TLS/SSL specific errors
      if (error.message && error.message.includes('SSL')) {
        console.error('TLS/SSL error detected. This may be a certificate validation issue on restrictive clients like iOS');
      }
    }
    
    throw error;
  }
}

// Implement a function to limit concurrent database operations
// that might otherwise create too many connections
const pendingOperations = new Map();
const MAX_CONCURRENT_OPS = 10; // Adjust based on app needs

async function performDatabaseOperation(dbUrl, operation) {
  // Create a key for this database to track its operations
  const dbKey = dbUrl.substring(0, 40); // Use part of URL as key
  
  // Initialize pending operations counter for this database if needed
  if (!pendingOperations.has(dbKey)) {
    pendingOperations.set(dbKey, 0);
  }
  
  // Increment pending operations count
  pendingOperations.set(dbKey, pendingOperations.get(dbKey) + 1);
  
  // If too many operations are pending, wait a bit
  while (pendingOperations.get(dbKey) > MAX_CONCURRENT_OPS) {
    console.log(`Too many operations (${pendingOperations.get(dbKey)}) for ${dbKey}, waiting...`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  try {
    // Get a database connection
    const dbConnection = await createPersonalDatabaseConnection(dbUrl);
    
    // Perform the actual operation
    const result = await operation(dbConnection);
    
    return result;
  } finally {
    // Decrement pending operations count
    pendingOperations.set(dbKey, pendingOperations.get(dbKey) - 1);
  }
}

// Add a connection cleanup function (call this periodically)
function cleanupDatabaseConnections() {
  console.log(`Cleaning up idle database connections. Current cache size: ${dbConnectionCache.size}`);
  
  for (const [url, connectionData] of dbConnectionCache.entries()) {
    try {
      const { connection } = connectionData;
      
      // Check if the connection has been idle for too long
      if (connection._lastUsed && Date.now() - connection._lastUsed > 60000) { // 1 minute
        console.log(`Closing idle connection to: ${url.substring(0, 20)}...`);
        connection.close();
        dbConnectionCache.delete(url);
      }
    } catch (err) {
      console.error(`Error cleaning up connection to ${url.substring(0, 20)}...`, err);
      // Remove problematic connection from cache
      dbConnectionCache.delete(url);
    }
  }
}

// Set up periodic connection cleanup
setInterval(cleanupDatabaseConnections, 60000); // Run every minute

// Graceful shutdown handler to close database connections
process.on('SIGINT', async () => {
  console.log('Received SIGINT. Closing database connections...');
  
  try {
    // Close all cached connections
    for (const [url, connectionData] of dbConnectionCache.entries()) {
      try {
        await connectionData.connection.close();
        console.log(`Closed connection to: ${url.substring(0, 20)}...`);
      } catch (err) {
        console.error(`Error closing connection to ${url.substring(0, 20)}...`, err);
      }
    }
    
    // Close main connection
    await mongoose.connection.close();
    console.log('Successfully closed all database connections.');
    
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
});

// ----------------------------
// Helper Functions for Authenticator and Registration
// ----------------------------
function generateAuthenticator() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Optimized function to create a new personal database URL
function createPersonalDatabaseUrl() {
  const dbName = generatePersonalDatabaseName();
  let baseUri = process.env.MONGO_URI || process.env.GENERAL_MONGO_URI || 
    'mongodb+srv://londonjeremie:Narnia2010@cluster0.mtuev.mongodb.net/openchat?retryWrites=true&w=majority';
  
  // Ensure the base URI is properly formatted
  if (!baseUri.startsWith('mongodb://') && !baseUri.startsWith('mongodb+srv://')) {
    baseUri = 'mongodb+srv://' + baseUri;
  }
  
  // Extract the database part using URL parsing
  try {
    const urlObj = new URL(baseUri);
    const pathParts = urlObj.pathname.split('/');
    
    // Get the database name (last part of the path)
    if (pathParts.length > 1) {
      const origDbName = pathParts[pathParts.length - 1];
      
      // Replace the database name
      pathParts[pathParts.length - 1] = dbName;
      
      // Reconstruct the URL
      urlObj.pathname = pathParts.join('/');
      return urlObj.toString();
    }
    
    // If no database in path, add one
    urlObj.pathname = `/${dbName}`;
    return urlObj.toString();
  } catch (error) {
    // Fallback to the old method if URL parsing fails
    console.error('Error parsing database URL:', error);
    
    // Replace the database name in the URI (old method)
    const uriParts = baseUri.split('/');
    let dbPart = uriParts[uriParts.length - 1];
    
    // Handle query parameters if present
    let queryParams = '';
    if (dbPart.includes('?')) {
      const parts = dbPart.split('?');
      dbPart = parts[0];
      queryParams = '?' + parts[1];
    }
    
    // Replace openchat with new db name
    const newDbPart = dbPart.replace('openchat', dbName);
    
    // Reconstruct the URI
    uriParts[uriParts.length - 1] = newDbPart + queryParams;
    
    return uriParts.join('/');
  }
}

// Function to generate a random database name with improved uniqueness
function generatePersonalDatabaseName() {
  const timestamp = Date.now().toString(36);
  const randomString = Math.random().toString(36).substring(2, 8);
  return `oc-${timestamp}-${randomString}`;
}

// Optimized user registration function to reduce database operations
async function registerGeneralUser(username, password) {
  // Generate unique authenticator
  const generateUniqueAuthenticator = async () => {
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      const code = generateAuthenticator();
      // Use lean() for more efficient query
      const existing = await GeneralUser.findOne(
        { authentificator: code },
        { _id: 1 }
      ).lean().exec();
      
      if (!existing) {
        return code;
      }
      attempts++;
    }
    throw new Error('Could not generate unique authenticator after multiple attempts');
  };
  
  try {
    // Double-check if username already exists - use projection to get just what we need
    const existingUser = await GeneralUser.findOne(
      { username },
      { _id: 1 }
    ).lean().exec();
    
    if (existingUser) {
      throw new Error(`Username '${username}' already exists in general database`);
    }
    
    // Generate unique authenticator
    const authentificator = await generateUniqueAuthenticator();
    
    // Create personal database URL
    const personalDbUrl = createPersonalDatabaseUrl();
    console.log(`Created personal database URL for ${username}: ${personalDbUrl}`);
    
    // Create and save the user - batch operation in one go
    const newGeneralUser = new GeneralUser({
      authentificator,
      username,
      password, // Should already be hashed
      database_url: personalDbUrl
    });
    
    await newGeneralUser.save();
    return { authentificator, database_url: personalDbUrl };
  } catch (err) {
    console.error(`Error registering user '${username}' in general database:`, err);
    
    // Better error handling
    if (err.code === 11000) { // MongoDB duplicate key error
      if (err.keyPattern?.username) {
        throw new Error(`Username '${username}' already exists in general database`);
      } else if (err.keyPattern?.authentificator) {
        throw new Error('Authentication key collision. Please try again.');
      }
    }
    
    throw err;
  }
}

// Add these improved encryption utility functions
function generateKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
}

// Generate a random symmetric key for local message encryption
function generateSymmetricKey() {
  return crypto.randomBytes(32).toString('hex');
}

// Encrypt with public key (for E2E encryption)
function encryptWithPublicKey(publicKey, message) {
  if (!message || !publicKey) return message;
  try {
    return crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
      },
      Buffer.from(String(message))
    ).toString('base64');
  } catch (err) {
    console.error('RSA encryption error:', err);
    return message;
  }
}

// Decrypt with private key (for E2E encryption)
function decryptWithPrivateKey(privateKey, encryptedMessage) {
  if (!encryptedMessage || !privateKey) return encryptedMessage;
  try {
    // Check if the message is actually encrypted (base64)
    if (!/^[A-Za-z0-9+/=]+$/.test(encryptedMessage)) {
      return encryptedMessage;
    }
    
    return crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
      },
      Buffer.from(encryptedMessage, 'base64')
    ).toString();
  } catch (err) {
    console.error('RSA decryption error:', err);
    return encryptedMessage;
  }
}

// AES encryption for local storage (symmetric)
function encryptWithSymmetricKey(key, message) {
  if (!message || !key) return message;
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
    let encrypted = cipher.update(String(message), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return iv.toString('hex') + ':' + encrypted; // Store IV with the message
  } catch (err) {
    console.error('AES encryption error:', err);
    return message;
  }
}

// AES decryption for local storage (symmetric)
function decryptWithSymmetricKey(key, encryptedMessage) {
  if (!encryptedMessage || !key || !encryptedMessage.includes(':')) return encryptedMessage;
  try {
    const parts = encryptedMessage.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('AES decryption error:', err);
    return encryptedMessage;
  }
}

// ----------------------------
// New Endpoint to Link External Databases (Bidirectional Insertion)
// ----------------------------
// When a user (e.g. Alice) submits another user's authenticator (e.g. Bob's),
//   - Step 1: Insert a record into the central external_databases for the current user (Alice)
//             using her own username as owner and storing Bob's authenticator and Bob's database URL.
//   - Step 2: Retrieve Alice's general record.
//   - Step 3: Connect to Bob's external database (using Bob's database URL) and insert a record
//             so that Bob's external database now has a reciprocal record for Alice.
// ----------------------------
app.post('/link-database', async (req, res) => {
  const { externalAuthenticator, username } = req.body;
  const currentUser = req.session.username || username;
  
  if (!externalAuthenticator || !currentUser) {
    return res.status(400).json({ error: 'Authenticator and username are required.' });
  }
  
  try {
    // 0. First, check if the authenticator belongs to the current user to prevent self-linking
    const currentUserRecord = await GeneralUser.findOne({ username: currentUser }).exec();
    if (!currentUserRecord) {
      return res.status(404).json({ error: 'Current user not found in general database.' });
    }
    
    if (currentUserRecord.authentificator === externalAuthenticator) {
      return res.status(400).json({ error: 'Cannot link to your own database.' });
    }
    
    // 1. Look up the target user (Bob) by his authenticator.
    const targetUser = await GeneralUser.findOne({ authentificator: externalAuthenticator }).exec();
    if (!targetUser) {
      return res.status(404).json({ error: 'Authenticator not found.' });
    }
    
    console.log(`Linking databases between ${currentUser} and ${targetUser.username}`);
    
    // Sanitize database URLs
    let currentUserDbUrl = currentUserRecord.database_url;
    if (!currentUserDbUrl.startsWith('mongodb://') && !currentUserDbUrl.startsWith('mongodb+srv://')) {
      if (currentUserDbUrl.includes('@') && currentUserDbUrl.includes('.')) {
        currentUserDbUrl = 'mongodb+srv://' + currentUserDbUrl;
      } else {
        return res.status(500).json({ error: 'Invalid current user database URL format.' });
      }
    }
    
    let targetUserDbUrl = targetUser.database_url;
    if (!targetUserDbUrl.startsWith('mongodb://') && !targetUserDbUrl.startsWith('mongodb+srv://')) {
      if (targetUserDbUrl.includes('@') && targetUserDbUrl.includes('.')) {
        targetUserDbUrl = 'mongodb+srv://' + targetUserDbUrl;
      } else {
        return res.status(500).json({ error: 'Invalid target user database URL format.' });
      }
    }
    
    // Create connections to both databases
    const { User: CurrentUser, ExternalDatabase: CurrentExternalDB } = 
      await createPersonalDatabaseConnection(currentUserDbUrl);
    
    const { User: TargetUser, ExternalDatabase: TargetExternalDB } = 
      await createPersonalDatabaseConnection(targetUserDbUrl);
    
    // Check if the databases are already linked
    const existingLink = await CurrentExternalDB.findOne({
      username: targetUser.username,
      authentificator: externalAuthenticator
    });
    
    if (existingLink) {
      return res.status(400).json({ error: 'Databases are already linked.' });
    }
    
    // Get current user's public key
    const currentUserDoc = await CurrentUser.findOne({ username: currentUser });
    if (!currentUserDoc || !currentUserDoc.public_key) {
      return res.status(400).json({ error: 'Current user public key not found.' });
    }
    
    const currentUserPublicKey = currentUserDoc.public_key;
    
    // 2. Insert Bob into Alice's users table
    try {
      await CurrentUser.findOneAndUpdate(
        { username: targetUser.username },
        { username: targetUser.username, online: false },
        { upsert: true }
      );
    } catch (err) {
      console.error('Error inserting user into local database:', err);
      return res.status(500).json({ error: 'Error inserting user into local database.' });
    }
    
    // 3. Get Bob's public key
    let targetUserPublicKey = null;
    try {
      const targetUserDoc = await TargetUser.findOne({ username: targetUser.username });
      if (targetUserDoc && targetUserDoc.public_key) {
        targetUserPublicKey = targetUserDoc.public_key;
      }
    } catch (err) {
      console.error('Error retrieving target user public key:', err);
    }
    
    // 4. Insert into Alice's external_databases table a record for Bob with his public key
    try {
      await CurrentExternalDB.findOneAndUpdate(
        {
          username: targetUser.username,
          authentificator: externalAuthenticator
        },
        {
          username: targetUser.username,
          authentificator: externalAuthenticator,
          database_url: targetUser.database_url,
          public_key: targetUserPublicKey
        },
        { upsert: true }
      );
    } catch (err) {
      console.error('Error inserting external database record:', err);
      return res.status(500).json({ error: 'Error inserting external database record.' });
    }
    
    // 5. Insert Alice into Bob's users table and external_databases
    try {
      // Insert Alice into Bob's users table
      await TargetUser.findOneAndUpdate(
        { username: currentUser },
        { username: currentUser, online: false },
        { upsert: true }
      );
      
      // Insert Alice's details into Bob's external_databases table with her public key
      await TargetExternalDB.findOneAndUpdate(
        {
          username: currentUser,
          authentificator: currentUserRecord.authentificator
        },
        {
          username: currentUser,
          authentificator: currentUserRecord.authentificator,
          database_url: currentUserRecord.database_url,
          public_key: currentUserPublicKey
        },
        { upsert: true }
      );
      
      // Ensure current user record has the public URL
      if (currentUserRecord.database_url !== process.env.DATABASE_PUBLIC_URL && process.env.DATABASE_PUBLIC_URL) {
        // Update the record to use the public URL
        currentUserRecord.database_url = process.env.DATABASE_PUBLIC_URL;
        await currentUserRecord.save();
        console.log(`Updated ${currentUser}'s database URL to public URL in general database`);
      }
      
      console.log(`Successfully linked databases between ${currentUser} and ${targetUser.username}`);
      
      res.json({ 
        message: 'External database linked successfully.',
        linkedUser: targetUser.username
      });
    } catch (err) {
      console.error('Error connecting to or inserting into target database:', err);
      return res.status(500).json({ 
        error: 'Error connecting to target database. Please verify the authenticator is correct.'
      });
    }
  } catch (err) {
    console.error('Error linking database:', err);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});

// ----------------------------
// Track Users and Their Socket Connections
// ----------------------------
const users = {}; // { username: { socketId, online, pushSubscription } }

// ----------------------------
// Web Push Configuration
// ----------------------------
webpush.setVapidDetails(
  'mailto:jeremie.html@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ----------------------------
// Create HTTP Server and Attach Socket.IO
// ----------------------------
const server = createServer(app);
const io = new Server(server);

// ----------------------------
// Load Combined Users for a Socket (Local + External)
// ----------------------------
async function loadCombinedUsers(socket) {
  const currentUser = socket.username;
  try {
    console.log(`Loading combined users and groups for ${currentUser}`);
    const userRecord = await GeneralUser.findOne({ username: currentUser }).exec();
    if (!userRecord) {
      throw new Error('User not found in general database');
    }

    // Sanitize database URL if needed
    let database_url = userRecord.database_url;
    if (!database_url.startsWith('mongodb://') && !database_url.startsWith('mongodb+srv://')) {
      if (database_url.includes('@') && database_url.includes('.')) {
        database_url = 'mongodb+srv://' + database_url;
        console.log(`Fixed database URL for user list of ${currentUser}: ${database_url}`);
      }
    }

    const { User, ExternalDatabase, GroupChat } = await createPersonalDatabaseConnection(database_url);
    
    // Get local users
    const localUsers = await User.find({ username: { $ne: currentUser } })
      .select('username online');
    
    // Get external database links
    const externalLinks = await ExternalDatabase.find();
    
    // Get user's groups
    const userGroups = await GroupChat.find({ members: currentUser });
    console.log(`Found ${userGroups.length} groups for user ${currentUser}`);
    
    let allUsers = localUsers.map(u => ({
      username: u.username,
      online: u.online,
      type: 'user'
    }));
    
    // Add groups to the user list
    const groupUsers = userGroups.map(group => ({
      username: group.name,
      id: group._id,
      members: group.members,
      creator: group.creator,
      type: 'group'
    }));
    
    allUsers = allUsers.concat(groupUsers);
    
    console.log(`Found ${localUsers.length} local users, ${userGroups.length} groups, and ${externalLinks.length} external databases for ${currentUser}`);
    
    // Get users from external databases
    for (const link of externalLinks) {
      try {
        // Sanitize external database URL
        let extUrl = link.database_url;
        if (!extUrl.startsWith('mongodb://') && !extUrl.startsWith('mongodb+srv://')) {
          if (extUrl.includes('@') && extUrl.includes('.')) {
            extUrl = 'mongodb+srv://' + extUrl;
          } else {
            console.error(`Invalid external database URL: ${extUrl}`);
            continue;
          }
        }
        
        const { User: ExtUser } = await createPersonalDatabaseConnection(extUrl);
        const externalUsers = await ExtUser.find({ username: { $ne: currentUser } })
          .select('username online');
        
        allUsers = allUsers.concat(externalUsers.map(u => ({
          username: u.username,
          online: u.online,
          type: 'user'
        })));
        
        console.log(`Added ${externalUsers.length} users from external database ${link.username}`);
      } catch (err) {
        console.error(`Error fetching users from external database:`, err);
      }
    }
    
    // Remove duplicates
    const uniqueUsers = {};
    allUsers.forEach(u => { 
      // Keep group type entries separate by ID
      if (u.type === 'group') {
        uniqueUsers[`group_${u.id}`] = u;
      } else {
        uniqueUsers[u.username] = u; 
      }
    });
    const userList = Object.values(uniqueUsers);
    
    console.log(`Sending combined list with ${userList.length} entries to ${currentUser}`);
    socket.emit('users', userList);
    
  } catch (err) {
    console.error(`Error fetching users list for ${currentUser}:`, err);
    socket.emit('error', 'Error loading contacts. Please try refreshing.');
  }
}

// ----------------------------
// Socket.IO Events
// ----------------------------
io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('login', async ({ username, password }) => {
    try {
      console.log(`Login attempt for user: ${username}`);
      const existingGeneralUser = await GeneralUser.findOne({ username }).exec();
      if (!existingGeneralUser) {
        console.log(`User ${username} not found in general database`);
        socket.emit('prompt signup', 'User not found. Would you like to sign up?');
        return;
      }

      console.log(`User ${username} found in general database, connecting to personal database...`);
      const { User } = await createPersonalDatabaseConnection(existingGeneralUser.database_url);
      const user = await User.findOne({ username });
      
      if (!user) {
        console.log(`User ${username} not found in personal database`);
        socket.emit('login failed', 'User account is incomplete. Please sign up again.');
        return;
      }
      
      if (!user.password) {
        console.log(`User ${username} has no password set`);
        socket.emit('prompt signup', 'User exists but no password set. Would you like to set a password?');
        return;
      }
      
      const match = await bcrypt.compare(password, user.password);
      if (match) {
        console.log(`Password match for user ${username}, logging in...`);
        await loginUser(socket, username, existingGeneralUser.database_url);
      } else {
        console.log(`Invalid password for user ${username}`);
        socket.emit('login failed', 'Invalid password.');
      }
    } catch (err) {
      console.error('Error during login:', err);
      socket.emit('login failed', 'An error occurred during login: ' + err.message);
    }
  });

  socket.on('signup', async ({ username, password }) => {
    try {
      // Validate inputs
      if (!username || username.trim() === '') {
        return socket.emit('signup failed', 'Username cannot be empty.');
      }
      
      if (!password || password.length < 6) {
        return socket.emit('signup failed', 'Password must be at least 6 characters long.');
      }
      
      // FIRST: Check if user exists in the general database (MongoDB)
      console.log(`Checking if username '${username}' exists in general database...`);
      
      try {
        const existingGeneralUser = await GeneralUser.findOne({ username }).exec();
        
        if (existingGeneralUser) {
          console.log(`Username '${username}' already exists in general database.`);
          return socket.emit('signup failed', 'Username already exists in our system.');
        }
        
        console.log(`Username '${username}' is available. Creating account...`);
        
        // Hash password and create user
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Generate RSA keypair for E2E encryption
        const { publicKey, privateKey } = generateKeyPair();
        
        // First register in general database to get authenticator and create personal database
        const { authentificator, database_url } = await registerGeneralUser(username, hashedPassword);
        console.log(`User ${username} registered in general database with authenticator: ${authentificator}`);
        
        try {
          // Create personal database connection
          const { User, Message, ExternalDatabase } = await createPersonalDatabaseConnection(database_url);
          
          // Create user in personal database
          const newUser = new User({
            username,
            password: hashedPassword,
            online: true,
            public_key: publicKey,
            private_key: privateKey,
            symmetric_key: generateSymmetricKey()
          });
          
          await newUser.save();
          console.log(`User ${username} created in personal database`);
          
          socket.username = username;
          socket.authentificator = authentificator;
          socket.emit('signup successful', username);
          socket.emit('login success', { username, authentificator });
          
          // Set user as online
          users[username] = { 
            socketId: socket.id, 
            online: true, 
            database_url
          };
          
          socket.broadcast.emit('user connected', username);
        } catch (personalDBError) {
          console.error(`Error creating personal database for ${username}:`, personalDBError);
          
          // Roll back general DB entry
          try {
            await GeneralUser.deleteOne({ username });
            console.log(`Rolled back general DB entry for ${username} due to error.`);
          } catch (rollbackErr) {
            console.error(`Failed to roll back general DB entry for ${username}:`, rollbackErr);
          }
          
          return socket.emit('signup failed', 'Error creating your personal database. Please try again.');
        }
      } catch (generalDBError) {
        console.error('Error checking/creating user in general database:', generalDBError);
        return socket.emit('signup failed', 'Database connection error. Please try again later.');
      }
    } catch (err) {
      console.error('Error during signup:', err);
      socket.emit('signup failed', 'Registration failed. Please try again later.');
    }
  });

  socket.on('chat message', async ({ to, msg }) => {
    if (!socket.username) return;
    const now = new Date();
    const messageId = generateMessageId();
    const message = {
      from: socket.username,
      msg,
      to,
      timestamp: formatTime(now),
      dayLabel: formatDayLabel(now),
      messageId
    };

    try {
      // Get sender's database URL
      const senderUser = await GeneralUser.findOne({ username: socket.username }).exec();
      if (!senderUser) {
        throw new Error('Sender not found in general database');
      }

      // Sanitize database URL
      let database_url = senderUser.database_url;
      if (!database_url.startsWith('mongodb://') && !database_url.startsWith('mongodb+srv://')) {
        if (database_url.includes('@') && database_url.includes('.')) {
          database_url = 'mongodb+srv://' + database_url;
          console.log(`Fixed database URL for chat message from ${socket.username}: ${database_url}`);
        }
      }

      const { User, ExternalDatabase } = await createPersonalDatabaseConnection(database_url);
      
      // Get recipient's public key for E2E encryption
      let recipientPublicKey = null;
      const recipientUser = await User.findOne({ username: to });
      
      if (recipientUser && recipientUser.public_key) {
        recipientPublicKey = recipientUser.public_key;
      }
      
      // Also check external database users
      if (!recipientPublicKey) {
        const externalUser = await ExternalDatabase.findOne({ username: to });
        
        if (externalUser && externalUser.public_key) {
          recipientPublicKey = externalUser.public_key;
        }
      }
      
      // Get sender's symmetric key for local encryption
      const sender = await User.findOne({ username: socket.username });
      const symmetricKey = sender?.symmetric_key;
      
      // For recipient DB: encrypt with recipient's public key (E2E)
      let recipientEncryptedMsg = recipientPublicKey ? 
        encryptWithPublicKey(recipientPublicKey, msg) : msg;
      
      // For sender DB: encrypt with sender's symmetric key
      let senderStoredMsg = symmetricKey ? 
        encryptWithSymmetricKey(symmetricKey, msg) : msg;
      
      // Both are encrypted, just with different methods
      const isEncrypted = true;
      
      // Save message to local database (encrypted with symmetric key)
      await saveMessage(socket.username, to, senderStoredMsg, isEncrypted);
      console.log(`Message from ${socket.username} to ${to} saved locally`);
      
      // Send to recipient if online
      if (users[to] && users[to].online) {
        io.to(users[to].socketId).emit('chat message', message);
        io.to(users[to].socketId).emit('notification', `New message from ${socket.username}`);
        console.log(`Message delivered to online user ${to}`);
        
        if (users[to].pushSubscription) {
          sendPushNotification(JSON.parse(users[to].pushSubscription), {
            title: 'New Message',
            body: `You have a new message from ${socket.username}`
          });
        }
      } else {
        console.log(`User ${to} is offline, message will be delivered when they log in`);
      }
      
      // Send back to sender for UI update
      socket.emit('chat message', message);
      
      // Cross-database messaging
      const recipientDB = await ExternalDatabase.findOne({ username: to });
      
      if (recipientDB) {
        console.log(`Sending message to external database of user ${to}`);
        let extUrl = recipientDB.database_url;
        if (!extUrl.startsWith('mongodb://') && !extUrl.startsWith('mongodb+srv://')) {
          if (extUrl.includes('@') && extUrl.includes('.')) {
            extUrl = 'mongodb+srv://' + extUrl;
          }
        }
        
        await saveMessageToExternalDB(
          extUrl, 
          socket.username, 
          to, 
          recipientEncryptedMsg, 
          null,
          true // E2E encrypted
        );
      }
    } catch (err) {
      console.error('Error in chat message:', err);
      socket.emit('error', 'Failed to send message. Please try again.');
    }
  });

  socket.on('file message', async ({ to, fileUrl, name, type, size, transcription }) => {
    if (!socket.username) return;
    const now = new Date();
    const messageId = generateMessageId();
    const message = {
      from: socket.username,
      fileUrl: fileUrl,
      fileName: name,
      fileType: type,
      fileSize: size,
      to,
      timestamp: formatTime(now),
      dayLabel: formatDayLabel(now),
      messageId,
      isFileMessage: true
    };

    try {
      // Get sender's database URL
      const senderUser = await GeneralUser.findOne({ username: socket.username }).exec();
      if (!senderUser) {
        throw new Error('Sender not found in general database');
      }

      // Sanitize database URL
      let database_url = senderUser.database_url;
      if (!database_url.startsWith('mongodb://') && !database_url.startsWith('mongodb+srv://')) {
        if (database_url.includes('@') && database_url.includes('.')) {
          database_url = 'mongodb+srv://' + database_url;
          console.log(`Fixed database URL for file message from ${socket.username}: ${database_url}`);
        }
      }

      const { User, ExternalDatabase } = await createPersonalDatabaseConnection(database_url);
      
      // Get recipient's public key for encryption
      let recipientPublicKey = null;
      const recipientUser = await User.findOne({ username: to });
      
      if (recipientUser && recipientUser.public_key) {
        recipientPublicKey = recipientUser.public_key;
      }
      
      // Also check external database users
      if (!recipientPublicKey) {
        const externalUser = await ExternalDatabase.findOne({ username: to });
        
        if (externalUser && externalUser.public_key) {
          recipientPublicKey = externalUser.public_key;
        }
      }
      
      // Get sender's symmetric key for self-encryption
      const sender = await User.findOne({ username: socket.username });
      const symmetricKey = sender?.symmetric_key;
      
      // For recipient: encrypt with recipient's key if available
      let recipientEncryptedUrl = recipientPublicKey ? encryptWithPublicKey(recipientPublicKey, fileUrl) : fileUrl;
      let recipientEncryptedName = recipientPublicKey ? encryptWithPublicKey(recipientPublicKey, name) : name;
      let recipientEncryptedType = recipientPublicKey ? encryptWithPublicKey(recipientPublicKey, type) : type;
      
      // For sender: encrypt with symmetric key
      let senderEncryptedUrl = symmetricKey ? encryptWithSymmetricKey(symmetricKey, fileUrl) : fileUrl;
      let senderEncryptedName = symmetricKey ? encryptWithSymmetricKey(symmetricKey, name) : name;
      let senderEncryptedType = symmetricKey ? encryptWithSymmetricKey(symmetricKey, type) : type;
      
      // All data is encrypted (with different methods)
      const isEncrypted = true;
      
      // Save to sender's database (encrypted with symmetric key)
      await saveFileMessage(socket.username, to, senderEncryptedUrl, senderEncryptedName, senderEncryptedType, size, isEncrypted);
      console.log(`File message from ${socket.username} to ${to} saved locally`);
      
      // Send to recipient if online
      if (users[to] && users[to].online) {
        io.to(users[to].socketId).emit('file message', message);
        io.to(users[to].socketId).emit('notification', `New file from ${socket.username}`);
        console.log(`File message delivered to online user ${to}`);
      } else {
        console.log(`User ${to} is offline, file message will be delivered when they log in`);
      }
      
      // Send back to sender for UI update
      socket.emit('file message', message);
      
      // Cross-database file message handling
      const recipientDB = await ExternalDatabase.findOne({ username: to });
      
      if (recipientDB) {
        console.log(`Sending file message to external database of user ${to}`);
        let extUrl = recipientDB.database_url;
        if (!extUrl.startsWith('mongodb://') && !extUrl.startsWith('mongodb+srv://')) {
          if (extUrl.includes('@') && extUrl.includes('.')) {
            extUrl = 'mongodb+srv://' + extUrl;
          }
        }
        
        await saveMessageToExternalDB(
          extUrl, 
          socket.username, 
          to, 
          null, 
          { 
            fileUrl: recipientEncryptedUrl, 
            name: recipientEncryptedName, 
            type: recipientEncryptedType, 
            size 
          },
          true
        );
      }
    } catch (err) {
      console.error('Error in file message:', err);
      socket.emit('error', 'Failed to send file message. Please try again.');
    }
  });

  socket.on('load messages', ({ user }) => {
    if (socket.username && user) {
      loadPrivateMessageHistory(socket.username, user, (messages) => {
        socket.emit('chat history', messages);
      });
    } else {
      socket.emit('chat history', []);
    }
  });

  socket.on('load users', () => {
    if (socket.username) {
      loadCombinedUsers(socket);
    }
  });

  socket.on('disconnect', async () => {
    if (socket.username) {
      try {
        const userRecord = await GeneralUser.findOne({ username: socket.username }).exec();
        if (userRecord) {
          const { User } = await createPersonalDatabaseConnection(userRecord.database_url);
          await User.findOneAndUpdate(
            { username: socket.username },
            { online: false }
          );
        }
        
        if (users[socket.username]) {
          users[socket.username].online = false;
        }
        
        for (const [id, sock] of io.of("/").sockets) {
          if (sock.username) {
            loadCombinedUsers(sock);
          }
        }
      } catch (err) {
        console.error('Error marking user offline:', err);
      }
    }
    console.log('A user disconnected');
  });

  socket.on('setup password', async ({ username, password }) => {
    try {
      const userRecord = await GeneralUser.findOne({ username }).exec();
      if (!userRecord) {
        throw new Error('User not found in general database');
      }

      const { User } = await createPersonalDatabaseConnection(userRecord.database_url);
      const hashedPassword = await bcrypt.hash(password, 10);
      
      await User.findOneAndUpdate(
        { username },
        { password: hashedPassword }
      );
      
      socket.emit('password setup successful');
      await loginUser(socket, username, userRecord.database_url);
    } catch (err) {
      console.error('Error setting up password:', err);
      socket.emit('setup failed', 'Password setup failed.');
    }
  });

  socket.on('subscribe', async (subscription) => {
    try {
      const userRecord = await GeneralUser.findOne({ username: socket.username }).exec();
      if (!userRecord) {
        throw new Error('User not found in general database');
      }

      const { User } = await createPersonalDatabaseConnection(userRecord.database_url);
      
      await User.findOneAndUpdate(
        { username: socket.username },
        { push_subscription: JSON.stringify(subscription) }
      );
      
      console.log(`User ${socket.username} subscribed to push notifications.`);
    } catch (err) {
      console.error('Error saving push subscription:', err);
    }
  });

  socket.on('check auth', async ({ username, password }) => {
    // This handler provides a fallback for devices where cookies don't work
    try {
      console.log(`Auth check for user: ${username}`);
      const existingGeneralUser = await GeneralUser.findOne({ username }).exec();
      if (!existingGeneralUser) {
        console.log(`User ${username} not found in general database`);
        socket.emit('auth failed', 'User not found');
        return;
      }

      const { User } = await createPersonalDatabaseConnection(existingGeneralUser.database_url);
      const user = await User.findOne({ username });
      
      if (!user) {
        console.log(`User ${username} not found in personal database`);
        socket.emit('auth failed', 'User account is incomplete');
        return;
      }
      
      if (!user.password) {
        console.log(`User ${username} has no password set`);
        socket.emit('auth failed', 'Password not set');
        return;
      }
      
      const match = await bcrypt.compare(password, user.password);
      if (match) {
        console.log(`Auth check passed for user ${username}`);
        await loginUser(socket, username, existingGeneralUser.database_url);
      } else {
        console.log(`Invalid password for user ${username}`);
        socket.emit('auth failed', 'Invalid password');
      }
    } catch (err) {
      console.error('Error during auth check:', err);
      socket.emit('auth failed', 'Authentication check failed');
    }
  });

  async function sendPushNotification(subscription, message) {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(message));
    } catch (err) {
      console.error('Error sending push notification:', err);
    }
  }

  socket.on('create group', async ({ name, members }) => {
    if (!socket.username) return;
    
    try {
      console.log(`User ${socket.username} attempting to create group "${name}" with members:`, members);
      
      // Get user's database
      const userRecord = await GeneralUser.findOne({ username: socket.username }).exec();
      if (!userRecord) {
        throw new Error('User not found in general database');
      }
      
      // Create connection to user's database
      const { GroupChat, ExternalDatabase } = await createPersonalDatabaseConnection(userRecord.database_url);
      
      // Create unique group ID - ensure it's a string
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 8);
      const groupId = `group-${timestamp}-${randomString}`;
      
      console.log(`Generated group ID: ${groupId}`);
      
      // Add creator to members list if not already included
      if (!members.includes(socket.username)) {
        members.push(socket.username);
      }
      
      // Create group - explicitly setting all fields
      const groupData = {
        _id: groupId,
        name: name,
        creator: socket.username,
        members: members,
        created_at: new Date()
      };
      
      // Use create method instead of new + save
      const groupDoc = await GroupChat.create(groupData);
      console.log(`Group "${name}" created with ID ${groupId} in creator's database`, groupDoc);
      
      // Now, add the group to each member's database
      console.log(`Adding group to each member's database...`);
      
      // Find external databases for each member
      const externalDatabases = await ExternalDatabase.find({
        username: { $in: members.filter(m => m !== socket.username) }
      });
      
      console.log(`Found ${externalDatabases.length} external databases for group members`);
      
      // Add group to each member's database
      for (const memberDb of externalDatabases) {
        try {
          // Sanitize database URL if needed
          let extUrl = memberDb.database_url;
          if (!extUrl.startsWith('mongodb://') && !extUrl.startsWith('mongodb+srv://')) {
            if (extUrl.includes('@') && extUrl.includes('.')) {
              extUrl = 'mongodb+srv://' + extUrl;
            } else {
              console.error(`Invalid external database URL for member ${memberDb.username}: ${extUrl}`);
              continue;
            }
          }
          
          console.log(`Adding group "${name}" to ${memberDb.username}'s database`);
          
          // Connect to member's database and add the group
          const { GroupChat: MemberGroupChat } = await createPersonalDatabaseConnection(extUrl);
          
          // Check if group already exists
          const existingGroup = await MemberGroupChat.findOne({ _id: groupId });
          if (!existingGroup) {
            await MemberGroupChat.create(groupData);
            console.log(`Group "${name}" added to ${memberDb.username}'s database`);
          } else {
            console.log(`Group "${name}" already exists in ${memberDb.username}'s database`);
          }
        } catch (err) {
          console.error(`Error adding group to ${memberDb.username}'s database:`, err);
        }
      }
      
      // Notify all online members
      const notificationData = {
        id: groupId,
        name,
        creator: socket.username,
        members,
        type: 'group'
      };
      
      // Send to creator
      socket.emit('group created', notificationData);
      console.log(`Notified creator ${socket.username} about new group`);
      
      // Send to other members who are online
      members.forEach(member => {
        if (member !== socket.username && users[member] && users[member].online) {
          try {
            io.to(users[member].socketId).emit('group created', notificationData);
            console.log(`Notified member ${member} about new group`);
          } catch (err) {
            console.error(`Error notifying member ${member}:`, err);
          }
        }
      });
      
      // Update users list for each member to include the new group
      members.forEach(member => {
        if (users[member] && users[member].online) {
          try {
            loadCombinedUsers(io.sockets.sockets.get(users[member].socketId));
            console.log(`Updated users list for ${member} to include new group`);
          } catch (err) {
            console.error(`Error updating users list for ${member}:`, err);
          }
        }
      });
      
      console.log(`Group "${name}" creation completed successfully`);
    } catch (error) {
      console.error('Error creating group:', error);
      socket.emit('error', 'Failed to create group chat. Please try again.');
    }
  });

  socket.on('load group messages', async ({ groupId }) => {
    if (!socket.username) return;
    
    try {
      console.log(`User ${socket.username} loading messages for group ${groupId}`);
      
      // Get user's database
      const userRecord = await GeneralUser.findOne({ username: socket.username }).exec();
      if (!userRecord) {
        throw new Error('User not found in general database');
      }
      
      // Connect to user's database
      const { GroupChat, GroupMessage } = await createPersonalDatabaseConnection(userRecord.database_url);
      
      // Check if user is member of this group
      const group = await GroupChat.findOne({ _id: groupId });
      if (!group) {
        console.error(`Group ${groupId} not found in database`);
        socket.emit('error', 'Group chat not found.');
        return;
      }
      
      if (!group.members.includes(socket.username)) {
        console.error(`User ${socket.username} is not a member of group ${groupId}`);
        socket.emit('error', 'You are not a member of this group chat.');
        return;
      }
      
      console.log(`Loading messages for group ${groupId} (${group.name})`);
      
      // Load messages
      const messages = await GroupMessage.find({ group_id: groupId }).sort({ timestamp: 1 });
      console.log(`Found ${messages.length} messages for group ${groupId}`);
      
      // Format messages for client
      const formattedMessages = messages.map(msg => ({
        groupId: msg.group_id,
        from: msg.sender,
        msg: msg.message,
        fileUrl: msg.file_url,
        fileName: msg.file_name,
        fileType: msg.file_type,
        fileSize: msg.file_size,
        timestamp: formatTime(msg.timestamp),
        dayLabel: formatDayLabel(msg.timestamp),
        messageId: msg._id,
        isFileMessage: !!msg.file_url
      }));
      
      socket.emit('group chat history', formattedMessages);
    } catch (error) {
      console.error('Error loading group messages:', error);
      socket.emit('error', 'Failed to load group messages.');
    }
  });

  socket.on('group message', async ({ groupId, msg }) => {
    if (!socket.username) {
      console.error('Group message attempt from unauthenticated socket.');
      return socket.emit('error', 'Authentication required.');
    }

    console.log(`[GroupMsg RX ${groupId}] User ${socket.username} sending: "${msg.substring(0,30)}"`);

    try {
      const userRecord = await GeneralUser.findOne({ username: socket.username }).lean().exec();
      if (!userRecord) {
        console.error(`[GroupMsg ERR ${groupId}] Sender ${socket.username} not found in general DB.`);
        return socket.emit('error', 'Sender user record not found.');
      }

      const senderDbUrl = userRecord.database_url;
      console.log(`[GroupMsg DB ${groupId}] Sender ${socket.username} DB URL: ${senderDbUrl.substring(0,20)}...`);

      const senderDbResult = await performDatabaseOperation(
        senderDbUrl,
        async ({ GroupChat, GroupMessage, ExternalDatabase }) => {
          const group = await GroupChat.findOne({ _id: groupId });
          if (!group) {
            console.error(`[GroupMsg ERR ${groupId}] Group not found in sender ${socket.username}'s DB.`);
            return { success: false, error: 'Group not found in your database' };
          }

          if (!group.members.includes(socket.username)) {
            console.error(`[GroupMsg ERR ${groupId}] Sender ${socket.username} not member of group.`);
            return { success: false, error: 'You are not a member of this group' };
          }

          console.log(`[GroupMsg DB ${groupId}] Group "${group.name}" found in sender ${socket.username}'s DB. Members: ${group.members.length}`);
          
          const now = new Date();
          const messageData = {
            group_id: groupId,
            sender: socket.username,
            message: msg,
            timestamp: now
          };

          const newMessage = new GroupMessage(messageData);
          await newMessage.save();
          console.log(`[GroupMsg SAVE ${groupId}] Message saved to sender ${socket.username}'s DB. Msg ID: ${newMessage._id}`);

          // Update the group's updated_at timestamp in the sender's DB
          group.updated_at = now;
          await group.save();
          console.log(`[GroupMsg UPDATE ${groupId}] Group updated_at set in sender ${socket.username}'s DB.`);

          const allMemberUsernames = [...new Set(group.members)];
          const otherMemberUsernames = allMemberUsernames.filter(m => m !== socket.username);

          const memberDbRecords = await ExternalDatabase.find({
            username: { $in: otherMemberUsernames }
          }).lean();
          
          const memberDbMap = new Map();
          memberDbRecords.forEach(dbRec => memberDbMap.set(dbRec.username, dbRec.database_url));
          console.log(`[GroupMsg DB ${groupId}] Found ${memberDbMap.size} external DB records for other members.`);

          return {
            success: true,
            groupFromSender: group.toObject(), // Pass a plain object copy
            newMessageId: newMessage._id.toString(),
            memberDbMap,
            messageData, // Contains the raw message object
            timestamp: now
          };
        }
      );

      if (!senderDbResult || !senderDbResult.success) {
        return socket.emit('error', senderDbResult.error || 'Failed to process message in sender DB.');
      }

      const { groupFromSender, newMessageId, memberDbMap, messageData, timestamp } = senderDbResult;
      const otherMembersToProcess = [...memberDbMap.keys()]; // Usernames of other members with DB records

      console.log(`[GroupMsg DIST ${groupId}] Propagating message to ${otherMembersToProcess.length} other members.`);

      const batchSize = 3;
      for (let i = 0; i < otherMembersToProcess.length; i += batchSize) {
        const batch = otherMembersToProcess.slice(i, i + batchSize);
        await Promise.all(batch.map(async (memberUsername) => {
          const memberDbUrl = memberDbMap.get(memberUsername);
          if (!memberDbUrl) {
            console.error(`[GroupMsg DIST ERR ${groupId}] No DB URL for member ${memberUsername}. Skipping.`);
            return;
          }
          
          console.log(`[GroupMsg DIST DB ${groupId}] Processing for member ${memberUsername} at ${memberDbUrl.substring(0,20)}...`);
          
          try {
            await performDatabaseOperation(
              memberDbUrl,
              async ({ GroupMessage: MemberGroupMessage, GroupChat: MemberGroupChat }) => {
                let groupInMemberDb = await MemberGroupChat.findOne({ _id: groupId });
                if (!groupInMemberDb) {
                  console.log(`[GroupMsg DIST SYNC ${groupId}] Group not found in ${memberUsername}'s DB. Creating...`);
                  await MemberGroupChat.create({
                    ...groupFromSender, // Create with data from sender's group copy
                    _id: groupId // ensure _id is explicitly set
                  });
                  console.log(`[GroupMsg DIST SYNC ${groupId}] Group created in ${memberUsername}'s DB.`);
                } else {
                  // Ensure member list and updated_at are consistent
                  let changed = false;
                  if (JSON.stringify(groupInMemberDb.members.slice().sort()) !== JSON.stringify(groupFromSender.members.slice().sort())) {
                    groupInMemberDb.members = [...groupFromSender.members];
                    changed = true;
                    console.log(`[GroupMsg DIST SYNC ${groupId}] Members list updated in ${memberUsername}'s DB.`);
                  }
                  // Always update updated_at to sender's group updated_at if it's newer or doesn't exist
                  if (!groupInMemberDb.updated_at || new Date(groupFromSender.updated_at) > new Date(groupInMemberDb.updated_at)) {
                      groupInMemberDb.updated_at = new Date(groupFromSender.updated_at);
                      changed = true;
                      console.log(`[GroupMsg DIST SYNC ${groupId}] updated_at updated in ${memberUsername}'s DB.`);
                  }

                  if(changed) await groupInMemberDb.save();
                }
                
                // Check if message already exists (e.g. if sender is also in this DB copy somehow)
                const existingMessage = await MemberGroupMessage.findOne({ _id: newMessageId });
                if (existingMessage) {
                    console.log(`[GroupMsg DIST SKIP ${groupId}] Message ${newMessageId} already exists in ${memberUsername}'s DB. Skipping save.`);
                } else {
                    await MemberGroupMessage.create({ ...messageData, _id: newMessageId}); // Use original messageData and ID
                    console.log(`[GroupMsg DIST SAVE ${groupId}] Message saved to ${memberUsername}'s DB.`);
                }
              }
            );
          } catch (memberErr) {
            console.error(`[GroupMsg DIST ERR ${groupId}] Error processing for member ${memberUsername} at ${memberDbUrl.substring(0,20)}...:`, memberErr);
          }
        }));
        if (i + batchSize < otherMembersToProcess.length) {
          await new Promise(resolve => setTimeout(resolve, 100)); // Delay between batches
        }
      }

      const clientMessageData = {
        groupId,
        groupName: groupFromSender.name,
        from: socket.username,
        msg,
        timestamp: formatTime(timestamp),
        dayLabel: formatDayLabel(timestamp),
        messageId: newMessageId
      };

      const onlineMembers = groupFromSender.members.filter(member => users[member] && users[member].online);
      console.log(`[GroupMsg EMIT ${groupId}] Emitting to ${onlineMembers.length} online members.`);
      
      onlineMembers.forEach(memberUsername => {
        if (users[memberUsername]?.socketId) {
          io.to(users[memberUsername].socketId).emit('group message', clientMessageData);
          console.log(`[GroupMsg EMIT ${groupId}] Sent to ${memberUsername} via socket ${users[memberUsername].socketId}`);
        }
      });

    } catch (error) {
      console.error(`[GroupMsg FATAL ${groupId}] Error for user ${socket.username}:`, error);
      socket.emit('error', 'Critical error sending group message. Please try again.');
    }
  });

  socket.on('group file message', async ({ groupId, fileUrl, name, type, size }) => {
    if (!socket.username) return;
    
    try {
      // Implementation similar to group_message but for files
      // Save the file message and send to all online group members
    } catch (error) {
      console.error('Error sending group file message:', error);
      socket.emit('error', 'Failed to send file to group');
    }
  });

  // Handler for deleting a group
  socket.on('delete group', async ({ groupId }) => {
    if (!socket.username) return;
    
    try {
      console.log(`User ${socket.username} attempting to delete group ${groupId}`);
      
      // Get user's database
      const userRecord = await GeneralUser.findOne({ username: socket.username }).exec();
      if (!userRecord) {
        throw new Error('User not found in general database');
      }
      
      // Connect to user's database
      const { GroupChat, GroupMessage, ExternalDatabase } = await createPersonalDatabaseConnection(userRecord.database_url);
      
      // Check if user is the creator of this group
      const group = await GroupChat.findOne({ _id: groupId });
      if (!group) {
        console.error(`Group ${groupId} not found in database`);
        socket.emit('error', 'Group not found.');
        return;
      }
      
      if (group.creator !== socket.username) {
        console.error(`User ${socket.username} is not the creator of group ${groupId}`);
        socket.emit('error', 'Only the group creator can delete the group.');
        return;
      }
      
      const groupName = group.name;
      const groupMembers = [...group.members];
      
      console.log(`Deleting group ${groupId} (${groupName}) created by ${socket.username}`);
      
      // Delete group and its messages from the creator's database
      await GroupChat.deleteOne({ _id: groupId });
      await GroupMessage.deleteMany({ group_id: groupId });
      
      console.log(`Group ${groupId} deleted from creator's database`);
      
      // Delete group from each member's database
      for (const memberUsername of groupMembers) {
        // Skip creator as we already processed their database
        if (memberUsername === socket.username) continue;
        
        try {
          // Get member's database info
          const memberDb = await ExternalDatabase.findOne({ username: memberUsername });
          
          if (!memberDb || !memberDb.database_url) {
            console.error(`Could not find database info for member ${memberUsername}`);
            continue;
          }
          
          // Sanitize database URL
          let extUrl = memberDb.database_url;
          if (!extUrl.startsWith('mongodb://') && !extUrl.startsWith('mongodb+srv://')) {
            if (extUrl.includes('@') && extUrl.includes('.')) {
              extUrl = 'mongodb+srv://' + extUrl;
            } else {
              console.error(`Invalid external database URL for member ${memberUsername}: ${extUrl}`);
              continue;
            }
          }
          
          console.log(`Deleting group ${groupId} from ${memberUsername}'s database`);
          
          // Connect to member's database
          try {
            const { GroupChat: MemberGroupChat, GroupMessage: MemberGroupMessage } = 
              await createPersonalDatabaseConnection(extUrl);
            
            // Delete group and its messages
            await MemberGroupChat.deleteOne({ _id: groupId });
            await MemberGroupMessage.deleteMany({ group_id: groupId });
            
            console.log(`Group ${groupId} successfully deleted from ${memberUsername}'s database`);
          } catch (connErr) {
            console.error(`Error connecting to ${memberUsername}'s database:`, connErr);
          }
        } catch (memberErr) {
          console.error(`Error processing member ${memberUsername}:`, memberErr);
        }
      }
      
      // Notify all online members about the deletion
      const deleteData = {
        groupId: groupId,
        groupName: groupName,
        deletedBy: socket.username
      };
      
      // Send to creator (confirmation)
      socket.emit('group deleted', deleteData);
      
      // Send to all online members
      groupMembers.forEach(member => {
        if (member !== socket.username && users[member] && users[member].online) {
          try {
            io.to(users[member].socketId).emit('group deleted', deleteData);
            console.log(`Notified member ${member} about group deletion`);
          } catch (err) {
            console.error(`Error notifying member ${member}:`, err);
          }
        }
      });
      
      // Update user lists for all affected members
      groupMembers.forEach(member => {
        if (users[member] && users[member].online) {
          try {
            loadCombinedUsers(io.sockets.sockets.get(users[member].socketId));
            console.log(`Updated users list for ${member} after group deletion`);
          } catch (err) {
            console.error(`Error updating users list for ${member}:`, err);
          }
        }
      });
      
      console.log(`Group "${groupName}" deletion completed successfully`);
    } catch (error) {
      console.error('Error deleting group:', error);
      socket.emit('error', 'Failed to delete group chat. Please try again.');
    }
  });

  // Handler for adding members to an existing group
  socket.on('add group members', async ({ groupId, newMembers }) => {
    if (!socket.username) return;
    
    try {
      console.log(`User ${socket.username} attempting to add members to group ${groupId}: ${newMembers.join(', ')}`);
      
      // Get user's database
      const userRecord = await GeneralUser.findOne({ username: socket.username }).exec();
      if (!userRecord) {
        throw new Error('User not found in general database');
      }
      
      // Connect to user's database
      const { GroupChat, ExternalDatabase } = await createPersonalDatabaseConnection(userRecord.database_url);
      
      // Check if user is a member of this group
      const group = await GroupChat.findOne({ _id: groupId });
      if (!group) {
        console.error(`Group ${groupId} not found in database`);
        socket.emit('error', 'Group chat not found.');
        return;
      }
      
      if (!group.members.includes(socket.username)) {
        console.error(`User ${socket.username} is not a member of group ${groupId}`);
        socket.emit('error', 'You are not a member of this group chat.');
        return;
      }
      
      // Filter out members who are already in the group
      const existingMembers = new Set(group.members);
      const actualNewMembers = newMembers.filter(m => !existingMembers.has(m));
      
      if (actualNewMembers.length === 0) {
        console.log('No new members to add to the group');
        socket.emit('info', 'All users are already members of this group.');
        return;
      }
      
      console.log(`Adding ${actualNewMembers.length} new members to group ${groupId} (${group.name})`);
      
      // Update members list in original group
      const updatedMembers = [...group.members, ...actualNewMembers];
      group.members = updatedMembers;
      group.updated_at = new Date();
      await group.save();
      
      console.log(`Group ${groupId} updated with new members in initiator's database`);
      
      // Update or add group for both existing and new members
      // First, ensure existing members have the updated group
      for (const memberUsername of group.members) {
        // Skip the initiator as we already updated their database
        if (memberUsername === socket.username) continue;
        
        try {
          // Get member's database info
          const memberDb = await ExternalDatabase.findOne({ username: memberUsername });
          
          if (!memberDb || !memberDb.database_url) {
            console.error(`Could not find database info for member ${memberUsername}`);
            continue;
          }
          
          // Sanitize database URL
          let extUrl = memberDb.database_url;
          if (!extUrl.startsWith('mongodb://') && !extUrl.startsWith('mongodb+srv://')) {
            if (extUrl.includes('@') && extUrl.includes('.')) {
              extUrl = 'mongodb+srv://' + extUrl;
            } else {
              console.error(`Invalid external database URL for member ${memberUsername}: ${extUrl}`);
              continue;
            }
          }
          
          console.log(`Updating group ${groupId} in ${memberUsername}'s database`);
          
          try {
            const { GroupChat: MemberGroupChat } = await createPersonalDatabaseConnection(extUrl);
            
            // Check if group exists for this member
            const groupInMemberDb = await MemberGroupChat.findOne({ _id: groupId });
            
            if (groupInMemberDb) {
              // Group exists, just update members
              groupInMemberDb.members = updatedMembers;
              groupInMemberDb.updated_at = new Date();
              await groupInMemberDb.save();
              console.log(`Updated existing group for ${memberUsername}`);
            } else {
              // Group doesn't exist, create it
              await MemberGroupChat.create({
                _id: group._id,
                name: group.name,
                creator: group.creator,
                members: updatedMembers,
                created_at: group.created_at,
                updated_at: new Date()
              });
              console.log(`Created group for ${memberUsername}`);
            }
          } catch (connErr) {
            console.error(`Error connecting to ${memberUsername}'s database:`, connErr);
          }
        } catch (memberErr) {
          console.error(`Error processing member ${memberUsername}:`, memberErr);
        }
      }
      
      // Prepare notification data
      const updateData = {
        groupId: groupId,
        groupName: group.name,
        addedBy: socket.username,
        addedMembers: actualNewMembers,
        allMembers: updatedMembers
      };
      
      // Notify the member who initiated the add
      socket.emit('group members added', updateData);
      
      // Notify all online members
      updatedMembers.forEach(member => {
        if (member !== socket.username && users[member] && users[member].online) {
          try {
            // New members get "added to group" notification
            if (actualNewMembers.includes(member)) {
              io.to(users[member].socketId).emit('added to group', {
                groupId: groupId,
                groupName: group.name,
                addedBy: socket.username
              });
            } else {
              // Existing members get "members added" notification
              io.to(users[member].socketId).emit('group members added', updateData);
            }
            console.log(`Notified member ${member} about group update`);
          } catch (err) {
            console.error(`Error notifying member ${member}:`, err);
          }
        }
      });
      
      // Update user lists for all affected members
      updatedMembers.forEach(member => {
        if (users[member] && users[member].online) {
          try {
            loadCombinedUsers(io.sockets.sockets.get(users[member].socketId));
          } catch (err) {
            console.error(`Error updating users list for ${member}:`, err);
          }
        }
      });
      
      console.log(`Members successfully added to group "${group.name}"`);
    } catch (error) {
      console.error('Error adding members to group:', error);
      socket.emit('error', 'Failed to add members to group chat. Please try again.');
    }
  });

  // Handler for getting group details
  socket.on('get group details', async ({ groupId }) => {
    if (!socket.username) return;
    
    try {
      console.log(`User ${socket.username} requesting details for group ${groupId}`);
      
      // Get user's database
      const userRecord = await GeneralUser.findOne({ username: socket.username }).exec();
      if (!userRecord) {
        throw new Error('User not found in general database');
      }
      
      // Connect to user's database
      const { User, GroupChat, ExternalDatabase } = await createPersonalDatabaseConnection(userRecord.database_url);
      
      // Get group details
      const group = await GroupChat.findOne({ _id: groupId });
      if (!group) {
        console.error(`Group ${groupId} not found in database`);
        socket.emit('error', 'Group not found.');
        return;
      }
      
      if (!group.members.includes(socket.username)) {
        console.error(`User ${socket.username} is not a member of group ${groupId}`);
        socket.emit('error', 'You are not a member of this group chat.');
        return;
      }
      
      // Get all contacts (exclude current user)
      const localUsers = await User.find({ 
        username: { $ne: socket.username }
      }).select('username').lean();
      
      // Get all external contacts
      const externalDbs = await ExternalDatabase.find().select('username').lean();
      
      // Combine into a unique list of contact usernames
      const availableContacts = [
        ...new Set([
          ...localUsers.map(u => u.username),
          ...externalDbs.map(db => db.username)
        ])
      ].sort();
      
      // Send group details back to client
      socket.emit('group details', {
        _id: group._id,
        name: group.name,
        creator: group.creator,
        members: group.members,
        created_at: group.created_at,
        updated_at: group.updated_at || group.created_at,
        availableContacts
      });
      
      console.log(`Sent details for group ${groupId} to user ${socket.username}`);
    } catch (error) {
      console.error('Error fetching group details:', error);
      socket.emit('error', 'Failed to fetch group details.');
    }
  });
});

// ----------------------------
// Helper Functions (Outside Socket.IO)
// ----------------------------
async function loginUser(socket, username, database_url) {
  try {
    // Get user's database URL from general database if not provided
    if (!database_url) {
      const generalUser = await GeneralUser.findOne({ username }).exec();
      if (!generalUser) {
        throw new Error('User not found in general database');
      }
      database_url = generalUser.database_url;
      console.log(`Retrieved database URL for ${username}: ${database_url}`);
    }

    // Sanitize database URL if needed
    if (!database_url.startsWith('mongodb://') && !database_url.startsWith('mongodb+srv://')) {
      if (database_url.includes('@') && database_url.includes('.')) {
        database_url = 'mongodb+srv://' + database_url;
        console.log(`Fixed database URL for ${username}: ${database_url}`);
      }
    }

    console.log(`Connecting to personal database for ${username}...`);
    // Create personal database connection
    const { User, Message, ExternalDatabase } = await createPersonalDatabaseConnection(database_url);
    console.log(`Successfully connected to database for user ${username}`);
    
    // Update user's online status
    await User.findOneAndUpdate(
      { username },
      { online: true },
      { new: true }
    );
    
    users[username] = { socketId: socket.id, online: true, database_url };
    socket.username = username;

    // Check if user has encryption keys
    const user = await User.findOne({ username });
    if (user) {
      if (!user.public_key || !user.private_key) {
        console.log(`User ${username} is missing RSA keys. Generating...`);
        const { publicKey, privateKey } = generateKeyPair();
        await User.findOneAndUpdate(
          { username },
          { public_key: publicKey, private_key: privateKey }
        );
      }
      
      if (!user.symmetric_key) {
        console.log(`User ${username} is missing symmetric key. Generating...`);
        const symmetricKey = generateSymmetricKey();
        await User.findOneAndUpdate(
          { username },
          { symmetric_key: symmetricKey }
        );
      }
    }

    let authentificator = 'Not set';
    try {
      const generalUser = await GeneralUser.findOne({ username }).exec();
      if (generalUser && generalUser.authentificator) {
        authentificator = generalUser.authentificator;
      }
    } catch (error) {
      console.error('Error retrieving authentificator for', username, error);
    }

    console.log(`User ${username} logging in with authentificator: ${authentificator}`);
    socket.emit('login success', { username, authentificator });
    
    loadCombinedUsers(socket);
    
    loadPrivateMessageHistory(username, null, (messages) => {
      socket.emit('chat history', messages);
    });
  } catch (error) {
    console.error('Error during login:', error);
    socket.emit('login failed', 'Error during login: ' + error.message);
  }
}

async function saveMessage(sender, receiver, message, isEncrypted = true) {
  try {
    const senderUser = await GeneralUser.findOne({ username: sender }).exec();
    if (!senderUser) {
      throw new Error('Sender not found in general database');
    }

    // Sanitize database URL
    let database_url = senderUser.database_url;
    if (!database_url.startsWith('mongodb://') && !database_url.startsWith('mongodb+srv://')) {
      if (database_url.includes('@') && database_url.includes('.')) {
        database_url = 'mongodb+srv://' + database_url;
        console.log(`Fixed database URL for saving message from ${sender}: ${database_url}`);
      } else {
        throw new Error('Invalid database URL format');
      }
    }

    const { Message } = await createPersonalDatabaseConnection(database_url);
    
    await Message.create({
      sender,
      receiver,
      message,
      is_encrypted: isEncrypted
    });
    
    return true;
  } catch (err) {
    console.error('Error saving message:', err);
    return false;
  }
}

async function saveFileMessage(sender, receiver, fileUrl, name, type, size, isEncrypted = true) {
  try {
    const senderUser = await GeneralUser.findOne({ username: sender }).exec();
    if (!senderUser) {
      throw new Error('Sender not found in general database');
    }

    // Sanitize database URL
    let database_url = senderUser.database_url;
    if (!database_url.startsWith('mongodb://') && !database_url.startsWith('mongodb+srv://')) {
      if (database_url.includes('@') && database_url.includes('.')) {
        database_url = 'mongodb+srv://' + database_url;
        console.log(`Fixed database URL for saving file message from ${sender}: ${database_url}`);
      } else {
        throw new Error('Invalid database URL format');
      }
    }

    const { Message } = await createPersonalDatabaseConnection(database_url);
    
    await Message.create({
      sender,
      receiver,
      message: 'File attachment',
      file_url: fileUrl,
      file_name: name,
      file_type: type,
      file_size: size,
      is_encrypted: isEncrypted
    });
    
    return true;
  } catch (err) {
    console.error('Error saving file message:', err);
    return false;
  }
}

async function loadPrivateMessageHistory(user1, user2, callback) {
  if (!user2) {
    callback([]);
    return;
  }
  
  try {
    const user1Record = await GeneralUser.findOne({ username: user1 }).exec();
    if (!user1Record) {
      throw new Error('User not found in general database');
    }

    // Sanitize database URL if needed
    let database_url = user1Record.database_url;
    if (!database_url.startsWith('mongodb://') && !database_url.startsWith('mongodb+srv://')) {
      if (database_url.includes('@') && database_url.includes('.')) {
        database_url = 'mongodb+srv://' + database_url;
        console.log(`Fixed database URL for message history of ${user1}: ${database_url}`);
      }
    }

    const { Message, User } = await createPersonalDatabaseConnection(database_url);
    
    // Get user's keys for decryption
    const user = await User.findOne({ username: user1 });
    const privateKey = user?.private_key;
    const symmetricKey = user?.symmetric_key;
    
    // Get messages
    const messages = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    }).sort({ timestamp: 1 });
    
    console.log(`Found ${messages.length} messages between ${user1} and ${user2}`);
    
    const formattedMessages = messages.map(msg => {
      const isFileMessage = msg.file_url && msg.file_name;
      const isSentByMe = msg.sender === user1;
      
      let finalMessage = msg.message;
      let finalFileUrl = msg.file_url;
      let finalFileName = msg.file_name;
      let finalFileType = msg.file_type;
      
      if (msg.is_encrypted) {
        try {
          if (isSentByMe && symmetricKey) {
            // Decrypt self-messages with symmetric key
            if (!isFileMessage && msg.message) {
              finalMessage = decryptWithSymmetricKey(symmetricKey, msg.message);
            }
            
            if (isFileMessage) {
              if (msg.file_url) finalFileUrl = decryptWithSymmetricKey(symmetricKey, msg.file_url);
              if (msg.file_name) finalFileName = decryptWithSymmetricKey(symmetricKey, msg.file_name);
              if (msg.file_type) finalFileType = decryptWithSymmetricKey(symmetricKey, msg.file_type);
            }
          } else if (!isSentByMe && privateKey) {
            // Decrypt messages from others with private key (E2E)
            if (!isFileMessage && msg.message) {
              finalMessage = decryptWithPrivateKey(privateKey, msg.message);
            }
            
            if (isFileMessage) {
              if (msg.file_url) finalFileUrl = decryptWithPrivateKey(privateKey, msg.file_url);
              if (msg.file_name) finalFileName = decryptWithPrivateKey(privateKey, msg.file_name);
              if (msg.file_type) finalFileType = decryptWithPrivateKey(privateKey, msg.file_type);
            }
          }
        } catch (decryptError) {
          console.error('Error decrypting message content:', decryptError);
        }
      }
      
      return {
        from: msg.sender,
        to: msg.receiver,
        msg: isFileMessage ? 'File attachment' : finalMessage,
        fileUrl: finalFileUrl,
        fileName: finalFileName,
        fileType: finalFileType,
        fileSize: msg.file_size,
        timestamp: formatTime(msg.timestamp),
        dayLabel: formatDayLabel(msg.timestamp),
        messageId: generateMessageId(),
        isFileMessage: isFileMessage
      };
    });
    
    callback(formattedMessages);
  } catch (err) {
    console.error('Error loading message history:', err);
    callback([]);
  }
}

function formatDate(date) {
  const options = { year: '2-digit', month: '2-digit', day: '2-digit' };
  return new Date(date).toLocaleDateString('en-GB', options);
}

function formatTime(date) {
  const d = new Date(date);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatDayLabel(date) {
  const today = new Date();
  const messageDate = new Date(date);
  const todayString = today.toDateString();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const yesterdayString = yesterday.toDateString();
  if (todayString === messageDate.toDateString()) {
    return "Today";
  } else if (yesterdayString === messageDate.toDateString()) {
    return "Yesterday";
  } else {
    return formatDate(messageDate);
  }
}

function generateMessageId() {
  return `${Date.now()}${Math.random().toString(36).substring(2, 9)}`;
}

// Updated saveMessageToExternalDB function
async function saveMessageToExternalDB(databaseUrl, sender, receiver, msg, fileData, isEncrypted = false) {
  if (!databaseUrl) {
    console.error('Missing database URL for external message');
    return;
  }
  
  // Ensure URL has correct prefix
  let sanitizedUrl = databaseUrl;
  if (!sanitizedUrl.startsWith('mongodb://') && !sanitizedUrl.startsWith('mongodb+srv://')) {
    if (sanitizedUrl.includes('@') && sanitizedUrl.includes('.')) {
      sanitizedUrl = 'mongodb+srv://' + sanitizedUrl;
    } else {
      console.error('Invalid MongoDB URL for external message:', sanitizedUrl);
      return;
    }
  }
  
  try {
    console.log(`Saving message to external DB: ${sanitizedUrl}`);
    const { Message } = await createPersonalDatabaseConnection(sanitizedUrl);
    
    if (fileData) {
      await Message.create({
        sender,
        receiver,
        message: 'File attachment',
        file_url: fileData.fileUrl,
        file_name: fileData.name,
        file_type: fileData.type,
        file_size: fileData.size,
        is_encrypted: isEncrypted
      });
      console.log(`File message from ${sender} to ${receiver} saved to external DB`);
    } else if (msg) {
      await Message.create({
        sender,
        receiver,
        message: msg,
        is_encrypted: isEncrypted
      });
      console.log(`Text message from ${sender} to ${receiver} saved to external DB`);
    }
  } catch (err) {
    console.error('Error inserting message into external DB:', err);
  }
}

// ----------------------------
// Start the Server
// ----------------------------
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
