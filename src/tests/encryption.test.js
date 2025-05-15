const crypto = require('crypto');
const { generateKeyPair, encryptMessage, decryptMessage, generateSymmetricKey, encryptFile, decryptFile } = require('../utils/encryption');

describe('Encryption Utilities', () => {
  describe('Key Generation', () => {
    it('should generate RSA key pair', async () => {
      const { publicKey, privateKey } = await generateKeyPair();

      expect(publicKey).toBeDefined();
      expect(privateKey).toBeDefined();
      expect(typeof publicKey).toBe('string');
      expect(typeof privateKey).toBe('string');
    });

    it('should generate symmetric key', () => {
      const key = generateSymmetricKey();

      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
      expect(key.length).toBe(32); // 256 bits
    });
  });

  describe('Message Encryption/Decryption', () => {
    let publicKey;
    let privateKey;
    let testMessage;

    beforeAll(async () => {
      const keyPair = await generateKeyPair();
      publicKey = keyPair.publicKey;
      privateKey = keyPair.privateKey;
      testMessage = 'This is a test message';
    });

    it('should encrypt and decrypt message successfully', async () => {
      const encryptedMessage = await encryptMessage(testMessage, publicKey);
      const decryptedMessage = await decryptMessage(encryptedMessage, privateKey);

      expect(encryptedMessage).toBeDefined();
      expect(typeof encryptedMessage).toBe('string');
      expect(decryptedMessage).toBe(testMessage);
    });

    it('should not decrypt with wrong private key', async () => {
      const { privateKey: wrongPrivateKey } = await generateKeyPair();
      const encryptedMessage = await encryptMessage(testMessage, publicKey);

      await expect(decryptMessage(encryptedMessage, wrongPrivateKey))
        .rejects
        .toThrow();
    });

    it('should handle empty message', async () => {
      const emptyMessage = '';
      const encryptedMessage = await encryptMessage(emptyMessage, publicKey);
      const decryptedMessage = await decryptMessage(encryptedMessage, privateKey);

      expect(decryptedMessage).toBe(emptyMessage);
    });

    it('should handle special characters', async () => {
      const specialMessage = '!@#$%^&*()_+{}|:"<>?~`-=[]\\;\',./';
      const encryptedMessage = await encryptMessage(specialMessage, publicKey);
      const decryptedMessage = await decryptMessage(encryptedMessage, privateKey);

      expect(decryptedMessage).toBe(specialMessage);
    });
  });

  describe('File Encryption/Decryption', () => {
    let symmetricKey;
    let testFileContent;

    beforeAll(() => {
      symmetricKey = generateSymmetricKey();
      testFileContent = Buffer.from('This is a test file content');
    });

    it('should encrypt and decrypt file successfully', async () => {
      const encryptedFile = await encryptFile(testFileContent, symmetricKey);
      const decryptedFile = await decryptFile(encryptedFile, symmetricKey);

      expect(encryptedFile).toBeDefined();
      expect(Buffer.isBuffer(encryptedFile)).toBe(true);
      expect(decryptedFile).toEqual(testFileContent);
    });

    it('should not decrypt with wrong key', async () => {
      const wrongKey = generateSymmetricKey();
      const encryptedFile = await encryptFile(testFileContent, symmetricKey);

      await expect(decryptFile(encryptedFile, wrongKey))
        .rejects
        .toThrow();
    });

    it('should handle empty file', async () => {
      const emptyFile = Buffer.from('');
      const encryptedFile = await encryptFile(emptyFile, symmetricKey);
      const decryptedFile = await decryptFile(encryptedFile, symmetricKey);

      expect(decryptedFile).toEqual(emptyFile);
    });

    it('should handle large file', async () => {
      const largeFile = Buffer.from('x'.repeat(1024 * 1024)); // 1MB
      const encryptedFile = await encryptFile(largeFile, symmetricKey);
      const decryptedFile = await decryptFile(encryptedFile, symmetricKey);

      expect(decryptedFile).toEqual(largeFile);
    });

    it('should handle binary file', async () => {
      const binaryFile = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
      const encryptedFile = await encryptFile(binaryFile, symmetricKey);
      const decryptedFile = await decryptFile(encryptedFile, symmetricKey);

      expect(decryptedFile).toEqual(binaryFile);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid public key', async () => {
      const invalidPublicKey = 'invalid-key';
      const message = 'test message';

      await expect(encryptMessage(message, invalidPublicKey))
        .rejects
        .toThrow();
    });

    it('should handle invalid private key', async () => {
      const { publicKey } = await generateKeyPair();
      const invalidPrivateKey = 'invalid-key';
      const encryptedMessage = await encryptMessage('test message', publicKey);

      await expect(decryptMessage(encryptedMessage, invalidPrivateKey))
        .rejects
        .toThrow();
    });

    it('should handle invalid symmetric key', async () => {
      const invalidKey = 'invalid-key';
      const fileContent = Buffer.from('test content');

      await expect(encryptFile(fileContent, invalidKey))
        .rejects
        .toThrow();

      await expect(decryptFile(fileContent, invalidKey))
        .rejects
        .toThrow();
    });

    it('should handle corrupted encrypted data', async () => {
      const { publicKey, privateKey } = await generateKeyPair();
      const encryptedMessage = await encryptMessage('test message', publicKey);
      const corruptedMessage = encryptedMessage.slice(0, -1); // Remove last character

      await expect(decryptMessage(corruptedMessage, privateKey))
        .rejects
        .toThrow();
    });
  });
}); 