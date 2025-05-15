import mongoose from 'mongoose';
import { createModels } from '../models/index.js';
import { dbConfig } from '../config/index.js';

// Store active connections
const connections = new Map();

// Connect to general database
export async function connectToGeneralDB() {
  try {
    await mongoose.connect(dbConfig.generalDbURI, dbConfig.mongoOptions);
    console.log('Connected to general database');
    return mongoose.connection;
  } catch (error) {
    console.error('Error connecting to general database:', error);
    throw error;
  }
}

// Connect to personal database
export async function connectToPersonalDB(databaseUrl) {
  if (!databaseUrl) {
    throw new Error('Database URL is required');
  }

  // Check if connection already exists
  if (connections.has(databaseUrl)) {
    return connections.get(databaseUrl);
  }

  try {
    const connection = await mongoose.createConnection(databaseUrl, dbConfig.mongoOptions);
    console.log(`Connected to personal database: ${databaseUrl}`);
    
    // Create models for this connection
    const models = createModels(connection);
    
    // Store connection and models
    connections.set(databaseUrl, { connection, models });
    
    return { connection, models };
  } catch (error) {
    console.error('Error connecting to personal database:', error);
    throw error;
  }
}

// Close a personal database connection
export async function closePersonalDBConnection(databaseUrl) {
  if (connections.has(databaseUrl)) {
    const { connection } = connections.get(databaseUrl);
    await connection.close();
    connections.delete(databaseUrl);
    console.log(`Closed connection to personal database: ${databaseUrl}`);
  }
}

// Close all database connections
export async function closeAllConnections() {
  // Close all personal database connections
  for (const [databaseUrl, { connection }] of connections) {
    await connection.close();
    console.log(`Closed connection to personal database: ${databaseUrl}`);
  }
  connections.clear();

  // Close general database connection
  await mongoose.connection.close();
  console.log('Closed connection to general database');
}

// Get models for a specific database
export function getModels(databaseUrl) {
  if (!connections.has(databaseUrl)) {
    throw new Error('Database connection not found');
  }
  return connections.get(databaseUrl).models;
}

// Validate MongoDB URL
export function isValidMongoDBUrl(url) {
  try {
    new URL(url);
    return url.startsWith('mongodb://') || url.startsWith('mongodb+srv://');
  } catch {
    return false;
  }
} 