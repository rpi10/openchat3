import mongoose from 'mongoose';

// General User Schema
export const generalUserSchema = new mongoose.Schema({
  authentificator: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  password: String,
  database_url: { type: String, required: true }
});

// Personal User Schema
export const personalUserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: String,
  online: { type: Boolean, default: false },
  push_subscription: String,
  public_key: String,
  private_key: String,
  symmetric_key: String
});

// Personal Message Schema
export const personalMessageSchema = new mongoose.Schema({
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

// Personal External Database Schema
export const personalExternalDatabaseSchema = new mongoose.Schema({
  username: { type: String, required: true },
  authentificator: { type: String, required: true },
  database_url: { type: String, required: true },
  public_key: String
});

// Group Chat Schema
export const groupChatSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  creator: { type: String, required: true },
  members: [String],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Group Message Schema
export const groupMessageSchema = new mongoose.Schema({
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

// Create models
export const GeneralUser = mongoose.model('GeneralUser', generalUserSchema);

// Function to create models for a specific connection
export function createModels(connection) {
  return {
    User: connection.model('User', personalUserSchema),
    Message: connection.model('Message', personalMessageSchema),
    ExternalDatabase: connection.model('ExternalDatabase', personalExternalDatabaseSchema),
    GroupChat: connection.model('GroupChat', groupChatSchema),
    GroupMessage: connection.model('GroupMessage', groupMessageSchema)
  };
} 