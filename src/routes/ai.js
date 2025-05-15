import express from 'express';
import {
  generateChatCompletion,
  transcribeAudio,
  generateImageDescription,
  generateCodeCompletion,
  generateTextSummary
} from '../services/ai.js';

const router = express.Router();

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Generate chat completion
router.post('/chat', requireAuth, async (req, res) => {
  try {
    const { messages } = req.body;

    // Generate chat completion
    const completion = await generateChatCompletion(messages);

    res.json({
      message: 'Chat completion generated successfully',
      data: completion
    });
  } catch (error) {
    console.error('Error generating chat completion:', error);
    res.status(500).json({ error: error.message });
  }
});

// Transcribe audio
router.post('/transcribe', requireAuth, async (req, res) => {
  try {
    const { audioBuffer } = req.body;

    if (!audioBuffer) {
      return res.status(400).json({ error: 'No audio buffer provided' });
    }

    // Transcribe audio
    const transcription = await transcribeAudio(Buffer.from(audioBuffer, 'base64'));

    res.json({
      message: 'Audio transcribed successfully',
      data: transcription
    });
  } catch (error) {
    console.error('Error transcribing audio:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate image description
router.post('/describe-image', requireAuth, async (req, res) => {
  try {
    const { imageBuffer } = req.body;

    if (!imageBuffer) {
      return res.status(400).json({ error: 'No image buffer provided' });
    }

    // Generate image description
    const description = await generateImageDescription(Buffer.from(imageBuffer, 'base64'));

    res.json({
      message: 'Image description generated successfully',
      data: description
    });
  } catch (error) {
    console.error('Error generating image description:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate code completion
router.post('/complete-code', requireAuth, async (req, res) => {
  try {
    const { code, language } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language are required' });
    }

    // Generate code completion
    const completion = await generateCodeCompletion(code, language);

    res.json({
      message: 'Code completion generated successfully',
      data: completion
    });
  } catch (error) {
    console.error('Error generating code completion:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate text summary
router.post('/summarize', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    // Generate text summary
    const summary = await generateTextSummary(text);

    res.json({
      message: 'Text summary generated successfully',
      data: summary
    });
  } catch (error) {
    console.error('Error generating text summary:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router; 