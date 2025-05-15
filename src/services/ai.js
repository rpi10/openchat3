import { Groq } from 'groq-sdk';
import { aiConfig } from '../config/index.js';

// Initialize Groq client
const groq = new Groq({
  apiKey: aiConfig.groqApiKey
});

// Generate chat completion
export async function generateChatCompletion(messages) {
  try {
    const completion = await groq.chat.completions.create({
      messages,
      model: aiConfig.model,
      temperature: 0.7,
      max_tokens: 1000,
      top_p: 1,
      stream: false
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error generating chat completion:', error);
    throw error;
  }
}

// Transcribe audio
export async function transcribeAudio(audioBuffer) {
  try {
    // Convert audio buffer to base64
    const base64Audio = audioBuffer.toString('base64');

    // Create messages for transcription
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant that transcribes audio to text. Please transcribe the following audio content accurately.'
      },
      {
        role: 'user',
        content: `Please transcribe this audio: ${base64Audio}`
      }
    ];

    // Generate transcription
    const transcription = await generateChatCompletion(messages);

    return transcription;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw error;
  }
}

// Generate image description
export async function generateImageDescription(imageBuffer) {
  try {
    // Convert image buffer to base64
    const base64Image = imageBuffer.toString('base64');

    // Create messages for image description
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant that describes images. Please provide a detailed description of the following image.'
      },
      {
        role: 'user',
        content: `Please describe this image: ${base64Image}`
      }
    ];

    // Generate description
    const description = await generateChatCompletion(messages);

    return description;
  } catch (error) {
    console.error('Error generating image description:', error);
    throw error;
  }
}

// Generate code completion
export async function generateCodeCompletion(code, language) {
  try {
    // Create messages for code completion
    const messages = [
      {
        role: 'system',
        content: `You are a helpful assistant that completes code. Please complete the following ${language} code accurately and efficiently.`
      },
      {
        role: 'user',
        content: `Please complete this ${language} code:\n${code}`
      }
    ];

    // Generate completion
    const completion = await generateChatCompletion(messages);

    return completion;
  } catch (error) {
    console.error('Error generating code completion:', error);
    throw error;
  }
}

// Generate text summary
export async function generateTextSummary(text) {
  try {
    // Create messages for text summary
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant that summarizes text. Please provide a concise summary of the following text.'
      },
      {
        role: 'user',
        content: `Please summarize this text:\n${text}`
      }
    ];

    // Generate summary
    const summary = await generateChatCompletion(messages);

    return summary;
  } catch (error) {
    console.error('Error generating text summary:', error);
    throw error;
  }
} 