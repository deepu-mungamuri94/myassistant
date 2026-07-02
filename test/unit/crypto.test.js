/**
 * Unit tests for Crypto module
 * Tests encryption/decryption security properties
 */

const { loadModule } = require('../helpers/loadModule.js');

describe('Crypto Module', () => {
  let Crypto;

  beforeAll(() => {
    Crypto = loadModule('utils/crypto.js', 'Crypto');
  });

  describe('encrypt/decrypt round-trip', () => {
    it('encrypts and decrypts data correctly', async () => {
      const plaintext = 'This is a secret message with special chars: <>&"\'';
      const password = 'mySecurePassword123!';

      const encrypted = await Crypto.encrypt(plaintext, password);
      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(0);

      const decrypted = await Crypto.decrypt(encrypted, password);
      expect(decrypted).toBe(plaintext);
    });

    it('handles JSON data correctly', async () => {
      const data = JSON.stringify({ user: 'alice', balance: 1000.50 });
      const password = 'test123';

      const encrypted = await Crypto.encrypt(data, password);
      const decrypted = await Crypto.decrypt(encrypted, password);

      expect(decrypted).toBe(data);
      const parsed = JSON.parse(decrypted);
      expect(parsed.user).toBe('alice');
      expect(parsed.balance).toBe(1000.50);
    });
  });

  describe('security: wrong password rejection', () => {
    it('rejects decryption with wrong password', async () => {
      const plaintext = 'secret';
      const correctPassword = 'correct123';
      const wrongPassword = 'wrong456';

      const encrypted = await Crypto.encrypt(plaintext, correctPassword);

      // Attempting to decrypt with wrong password should throw/reject
      await expect(
        Crypto.decrypt(encrypted, wrongPassword)
      ).rejects.toThrow();
    });

    it('produces non-deterministic ciphertext (random IV/salt)', async () => {
      const plaintext = 'same text every time';
      const password = 'samePassword';

      // Encrypt same plaintext twice with same password
      const encrypted1 = await Crypto.encrypt(plaintext, password);
      const encrypted2 = await Crypto.encrypt(plaintext, password);

      // Ciphertexts should differ (random salt and IV)
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same plaintext
      const decrypted1 = await Crypto.decrypt(encrypted1, password);
      const decrypted2 = await Crypto.decrypt(encrypted2, password);
      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });
  });

  describe('arrayBufferToBase64 / base64ToArrayBuffer', () => {
    it('round-trips binary data correctly', () => {
      const originalBytes = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]); // "Hello World"

      const base64 = Crypto.arrayBufferToBase64(originalBytes);
      expect(typeof base64).toBe('string');
      expect(base64.length).toBeGreaterThan(0);

      const decoded = Crypto.base64ToArrayBuffer(base64);
      expect(decoded).toBeInstanceOf(Uint8Array);
      expect(decoded.length).toBe(originalBytes.length);

      // Compare byte-by-byte
      for (let i = 0; i < originalBytes.length; i++) {
        expect(decoded[i]).toBe(originalBytes[i]);
      }
    });

    it('handles random binary data', () => {
      const randomBytes = window.crypto.getRandomValues(new Uint8Array(32));
      const base64 = Crypto.arrayBufferToBase64(randomBytes);
      const decoded = Crypto.base64ToArrayBuffer(base64);

      expect(decoded.length).toBe(randomBytes.length);
      for (let i = 0; i < randomBytes.length; i++) {
        expect(decoded[i]).toBe(randomBytes[i]);
      }
    });
  });
});
