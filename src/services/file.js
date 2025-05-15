import fs from 'fs';
import path from 'path';
import B2 from 'backblaze-b2';
import { uploadConfig, pathConfig } from '../config/index.js';

// Initialize B2 client
const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APP_KEY
});

// Upload file to B2
export async function uploadToB2(file, filename) {
  try {
    // Authorize B2
    await b2.authorize();

    // Get upload URL
    const { uploadUrl, authorizationToken } = await b2.getUploadUrl({
      bucketId: process.env.B2_BUCKET_ID
    });

    // Upload file
    const response = await b2.uploadFile({
      uploadUrl,
      uploadAuthToken: authorizationToken,
      fileName: filename,
      contentLength: file.size,
      contentType: file.mimetype,
      data: file.buffer
    });

    return {
      url: `${process.env.B2_PUBLIC_URL}/${response.fileName}`,
      name: filename,
      type: file.mimetype,
      size: file.size
    };
  } catch (error) {
    console.error('Error uploading file to B2:', error);
    throw error;
  }
}

// Save file locally
export async function saveFileLocally(file, filename) {
  try {
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(pathConfig.uploadsDir)) {
      fs.mkdirSync(pathConfig.uploadsDir, { recursive: true });
    }

    // Save file
    const filepath = path.join(pathConfig.uploadsDir, filename);
    await fs.promises.writeFile(filepath, file.buffer);

    return {
      url: `/uploads/${filename}`,
      name: filename,
      type: file.mimetype,
      size: file.size
    };
  } catch (error) {
    console.error('Error saving file locally:', error);
    throw error;
  }
}

// Delete file from B2
export async function deleteFromB2(filename) {
  try {
    // Authorize B2
    await b2.authorize();

    // Get file info
    const { files } = await b2.listFileNames({
      bucketId: process.env.B2_BUCKET_ID,
      prefix: filename
    });

    if (files.length > 0) {
      // Delete file
      await b2.deleteFileVersion({
        fileId: files[0].fileId,
        fileName: files[0].fileName
      });
    }
  } catch (error) {
    console.error('Error deleting file from B2:', error);
    throw error;
  }
}

// Delete local file
export async function deleteLocalFile(filename) {
  try {
    const filepath = path.join(pathConfig.uploadsDir, filename);
    if (fs.existsSync(filepath)) {
      await fs.promises.unlink(filepath);
    }
  } catch (error) {
    console.error('Error deleting local file:', error);
    throw error;
  }
}

// Validate file
export function validateFile(file) {
  // Check file size
  if (file.size > uploadConfig.maxFileSize) {
    throw new Error(`File size exceeds maximum limit of ${uploadConfig.maxFileSize} bytes`);
  }

  // Check file type
  const fileType = file.mimetype.split('/')[0];
  if (!['image', 'video', 'audio', 'application'].includes(fileType)) {
    throw new Error('Invalid file type');
  }

  // Check audio file type
  if (fileType === 'audio' && !uploadConfig.supportedAudioTypes.includes(file.mimetype)) {
    throw new Error('Unsupported audio file type');
  }

  return true;
}

// Generate unique filename
export function generateFilename(originalname) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const extension = path.extname(originalname);
  return `${timestamp}-${random}${extension}`;
} 