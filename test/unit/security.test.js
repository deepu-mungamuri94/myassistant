/**
 * Unit tests for Security module
 * Tests PIN management, lockout policy, session management, and app suspend/resume
 */

const { loadModule } = require('../helpers/loadModule.js');

describe('Security Module', () => {
  let Security;

  beforeAll(() => {
    Security = loadModule('core/security.js', 'Security');
  });

  beforeEach(() => {
    // Reset Security instance state
    Security.isUnlocked = false;
    Security.sessionTimestamp = null;
    Security.currentSecurePage = null;
    Security.leftPageTimestamp = null;
    Security.appSuspendedTimestamp = null;

    // Reset mocks and window.DB
    window.DB = {
      security: {
        pinHash: null,
        pinSalt: null,
        pinVersion: 1,
        isSetup: false,
        biometricEnabled: false,
        failedPinAttempts: 0,
        pinLockoutUntil: 0,
        masterPassword: ''
      }
    };

    // Mock Storage
    window.Storage = {
      save: vi.fn()
    };

    // Mock Crypto utilities
    window.Crypto = {
      randomSaltBase64: vi.fn(() => 'base64salt=='),
      deriveBitsHex: vi.fn(async (pin, salt, iter, bits) => 'hex-hash-' + pin),
      base64ToArrayBuffer: vi.fn(() => new Uint8Array(16).buffer)
    };

    // Mock crypto.subtle for legacy hashPin
    window.crypto = {
      subtle: {
        digest: vi.fn(async (algo, data) => new Uint8Array(32).buffer)
      }
    };

    // Mock Capacitor
    window.Capacitor = undefined;

    // Clear all timers
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ========== isSetup Tests ==========
  describe('isSetup', () => {
    it('returns falsy when security is not set up', () => {
      expect(Security.isSetup()).toBeFalsy();
    });

    it('returns falsy when isSetup is false', () => {
      window.DB.security.isSetup = false;
      window.DB.security.pinHash = 'somehash';
      expect(Security.isSetup()).toBeFalsy();
    });

    it('returns falsy when pinHash is missing', () => {
      window.DB.security.isSetup = true;
      window.DB.security.pinHash = null;
      expect(Security.isSetup()).toBeFalsy();
    });

    it('returns truthy when both isSetup and pinHash are present', () => {
      window.DB.security.isSetup = true;
      window.DB.security.pinHash = 'somehash';
      expect(Security.isSetup()).toBeTruthy();
    });
  });

  // ========== setupPin Tests ==========
  describe('setupPin', () => {
    it('sets up a 4-digit PIN successfully', async () => {
      await Security.setupPin('1234');

      expect(window.DB.security.pinSalt).toBe('base64salt==');
      expect(window.DB.security.pinHash).toBe('hex-hash-1234');
      expect(window.DB.security.pinVersion).toBe(2);
      expect(window.DB.security.isSetup).toBe(true);
      expect(window.DB.security.failedPinAttempts).toBe(0);
      expect(window.DB.security.pinLockoutUntil).toBe(0);
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('rejects PIN with less than 4 digits', async () => {
      await expect(Security.setupPin('123')).rejects.toThrow('PIN must be exactly 4 digits');
    });

    it('rejects PIN with more than 4 digits', async () => {
      await expect(Security.setupPin('12345')).rejects.toThrow('PIN must be exactly 4 digits');
    });

    it('rejects empty PIN', async () => {
      await expect(Security.setupPin('')).rejects.toThrow('PIN must be exactly 4 digits');
    });

    it('rejects null PIN', async () => {
      await expect(Security.setupPin(null)).rejects.toThrow('PIN must be exactly 4 digits');
    });
  });

  // ========== verifyPin Tests ==========
  describe('verifyPin', () => {
    beforeEach(async () => {
      // Setup a PIN for verification tests
      await Security.setupPin('1234');
    });

    it('verifies correct PIN successfully', async () => {
      const result = await Security.verifyPin('1234');
      expect(result).toBe(true);
      expect(window.DB.security.failedPinAttempts).toBe(0);
      expect(window.DB.security.pinLockoutUntil).toBe(0);
    });

    it('rejects incorrect PIN', async () => {
      const result = await Security.verifyPin('9999');
      expect(result).toBe(false);
      expect(window.DB.security.failedPinAttempts).toBe(1);
    });

    it('returns false when locked out', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      // Set lockout
      window.DB.security.pinLockoutUntil = now + 30000;

      const result = await Security.verifyPin('1234');
      expect(result).toBe(false);

      vi.useRealTimers();
    });

    it('increments failed attempts on wrong PIN', async () => {
      await Security.verifyPin('9999');
      expect(window.DB.security.failedPinAttempts).toBe(1);

      await Security.verifyPin('8888');
      expect(window.DB.security.failedPinAttempts).toBe(2);
    });

    it('resets failed attempts on successful verification', async () => {
      window.DB.security.failedPinAttempts = 3;

      await Security.verifyPin('1234');

      expect(window.DB.security.failedPinAttempts).toBe(0);
      expect(window.DB.security.pinLockoutUntil).toBe(0);
    });
  });

  // ========== Legacy PIN Migration Tests ==========
  describe('legacy PIN migration', () => {
    it('migrates v1 (legacy) PIN to v2 on successful verification', async () => {
      // Setup legacy PIN (v1)
      window.DB.security.pinVersion = 1;
      window.DB.security.pinHash = 'legacy-hash';
      window.DB.security.pinSalt = null;
      window.DB.security.isSetup = true;

      // Mock legacy hashPin to return the stored hash
      Security.hashPin = vi.fn(async (pin) => {
        return pin === '1234' ? 'legacy-hash' : 'wrong-hash';
      });

      const result = await Security.verifyPin('1234');

      expect(result).toBe(true);
      expect(window.DB.security.pinVersion).toBe(2);
      expect(window.DB.security.pinSalt).toBe('base64salt==');
      expect(window.DB.security.pinHash).toBe('hex-hash-1234');
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('does not migrate on failed v1 verification', async () => {
      window.DB.security.pinVersion = 1;
      window.DB.security.pinHash = 'legacy-hash';
      window.DB.security.pinSalt = null;

      Security.hashPin = vi.fn(async (pin) => {
        // Only return the stored hash for the correct PIN
        return pin === '1234' ? 'legacy-hash' : 'wrong-hash';
      });

      const result = await Security.verifyPin('9999');

      expect(result).toBe(false);
      expect(window.DB.security.pinVersion).toBe(1);
      expect(window.DB.security.pinSalt).toBeNull();
    });
  });

  // ========== Lockout Tests ==========
  describe('lockout policy', () => {
    it('calculates 0ms lockout for attempts below threshold (5)', () => {
      expect(Security._lockoutMsForAttempts(0)).toBe(0);
      expect(Security._lockoutMsForAttempts(4)).toBe(0);
    });

    it('calculates exponential backoff starting at attempt 5', () => {
      expect(Security._lockoutMsForAttempts(5)).toBe(30000); // 30s
      expect(Security._lockoutMsForAttempts(6)).toBe(60000); // 60s
      expect(Security._lockoutMsForAttempts(7)).toBe(120000); // 120s
      expect(Security._lockoutMsForAttempts(8)).toBe(240000); // 240s
    });

    it('caps lockout at 15 minutes (900000ms)', () => {
      expect(Security._lockoutMsForAttempts(10)).toBe(900000); // 15 min cap
      expect(Security._lockoutMsForAttempts(20)).toBe(900000); // Still capped
    });

    it('getLockoutRemainingMs returns 0 when not locked out', () => {
      window.DB.security.pinLockoutUntil = 0;
      expect(Security.getLockoutRemainingMs()).toBe(0);
    });

    it('getLockoutRemainingMs returns remaining time when locked out', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      window.DB.security.pinLockoutUntil = now + 30000;
      expect(Security.getLockoutRemainingMs()).toBe(30000);

      vi.advanceTimersByTime(10000);
      expect(Security.getLockoutRemainingMs()).toBe(20000);

      vi.advanceTimersByTime(20000);
      expect(Security.getLockoutRemainingMs()).toBe(0);

      vi.useRealTimers();
    });

    it('triggers lockout after 5 failed attempts', async () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      await Security.setupPin('1234');

      // First 4 failures: no lockout
      for (let i = 0; i < 4; i++) {
        await Security.verifyPin('9999');
      }
      expect(window.DB.security.failedPinAttempts).toBe(4);
      expect(window.DB.security.pinLockoutUntil).toBe(0);

      // 5th failure: triggers lockout
      await Security.verifyPin('9999');
      expect(window.DB.security.failedPinAttempts).toBe(5);
      expect(window.DB.security.pinLockoutUntil).toBeGreaterThan(startTime);
      expect(Security.getLockoutRemainingMs()).toBe(30000);

      vi.useRealTimers();
    });
  });

  // ========== Session Management Tests ==========
  describe('session management', () => {
    it('isSessionValid returns false when no session exists', () => {
      expect(Security.isSessionValid('cards')).toBe(false);
    });

    it('isSessionValid returns true when on same secure page', () => {
      Security.sessionTimestamp = Date.now();
      Security.currentSecurePage = 'cards';

      expect(Security.isSessionValid('cards')).toBe(true);
    });

    it('isSessionValid returns true within timeout after leaving page', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      Security.sessionTimestamp = now;
      Security.leftPageTimestamp = now;

      vi.advanceTimersByTime(5000); // 5 seconds < 10 second timeout
      expect(Security.isSessionValid('cards')).toBe(true);

      vi.useRealTimers();
    });

    it('isSessionValid returns false after timeout', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      Security.sessionTimestamp = now;
      Security.leftPageTimestamp = now;

      vi.advanceTimersByTime(11000); // 11 seconds > 10 second timeout
      expect(Security.isSessionValid('cards')).toBe(false);

      vi.useRealTimers();
    });

    it('isSessionValid checks sessionTimestamp when no leftPageTimestamp', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      Security.sessionTimestamp = now;
      Security.leftPageTimestamp = null;

      vi.advanceTimersByTime(5000); // Within timeout
      expect(Security.isSessionValid('cards')).toBe(true);

      vi.advanceTimersByTime(6000); // Total 11s > timeout
      expect(Security.isSessionValid('cards')).toBe(false);

      vi.useRealTimers();
    });

    it('setCurrentPage clears leftPageTimestamp', () => {
      Security.sessionTimestamp = Date.now();
      Security.leftPageTimestamp = Date.now();

      Security.setCurrentPage('cards');

      expect(Security.currentSecurePage).toBe('cards');
      expect(Security.leftPageTimestamp).toBeNull();
    });

    it('setCurrentPage clears session if too much time passed', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      Security.sessionTimestamp = now;
      Security.leftPageTimestamp = now;

      vi.advanceTimersByTime(11000); // Exceed timeout
      Security.setCurrentPage('cards');

      expect(Security.sessionTimestamp).toBeNull();
      expect(Security.currentSecurePage).toBe('cards');
      expect(Security.leftPageTimestamp).toBeNull();

      vi.useRealTimers();
    });

    it('clearCurrentPage records leftPageTimestamp', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      Security.currentSecurePage = 'cards';
      Security.clearCurrentPage();

      expect(Security.currentSecurePage).toBeNull();
      expect(Security.leftPageTimestamp).toBe(now);

      vi.useRealTimers();
    });

    it('clearCurrentPage does nothing if no current page', () => {
      Security.currentSecurePage = null;
      Security.leftPageTimestamp = null;

      Security.clearCurrentPage();

      expect(Security.leftPageTimestamp).toBeNull();
    });

    it('updateSession sets sessionTimestamp', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      Security.updateSession();
      expect(Security.sessionTimestamp).toBe(now);

      vi.useRealTimers();
    });

    it('clearSession resets all session state', () => {
      Security.sessionTimestamp = Date.now();
      Security.currentSecurePage = 'cards';
      Security.leftPageTimestamp = Date.now();

      Security.clearSession();

      expect(Security.sessionTimestamp).toBeNull();
      expect(Security.currentSecurePage).toBeNull();
      expect(Security.leftPageTimestamp).toBeNull();
    });
  });

  // ========== App Suspend/Resume Tests ==========
  describe('app suspend and resume', () => {
    it('onAppSuspended records timestamp', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      Security.onAppSuspended();
      expect(Security.appSuspendedTimestamp).toBe(now);

      vi.useRealTimers();
    });

    it('onAppResumed returns false if never suspended', () => {
      Security.appSuspendedTimestamp = null;
      expect(Security.onAppResumed()).toBe(false);
    });

    it('onAppResumed returns false if suspended less than timeout', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      Security.appSuspendedTimestamp = now;

      vi.advanceTimersByTime(30000); // 30s < 60s timeout
      expect(Security.onAppResumed()).toBe(false);
      expect(Security.appSuspendedTimestamp).toBeNull();

      vi.useRealTimers();
    });

    it('onAppResumed locks app and returns true if suspended more than timeout', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      Security.isUnlocked = true;
      Security.appSuspendedTimestamp = now;

      vi.advanceTimersByTime(61000); // 61s > 60s timeout
      expect(Security.onAppResumed()).toBe(true);
      expect(Security.isUnlocked).toBe(false);
      expect(Security.appSuspendedTimestamp).toBeNull();

      vi.useRealTimers();
    });

    it('onAppResumed exactly at timeout threshold locks app', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      Security.isUnlocked = true;
      Security.appSuspendedTimestamp = now;

      vi.advanceTimersByTime(60000); // Exactly 60s
      expect(Security.onAppResumed()).toBe(true);
      expect(Security.isUnlocked).toBe(false);

      vi.useRealTimers();
    });
  });

  // ========== unlockWithPin Tests ==========
  describe('unlockWithPin', () => {
    beforeEach(async () => {
      await Security.setupPin('1234');
    });

    it('unlocks with correct PIN', async () => {
      const result = await Security.unlockWithPin('1234');
      expect(result).toBe(true);
      expect(Security.isUnlocked).toBe(true);
      expect(Security.sessionTimestamp).not.toBeNull();
    });

    it('does not unlock with incorrect PIN', async () => {
      const result = await Security.unlockWithPin('9999');
      expect(result).toBe(false);
      expect(Security.isUnlocked).toBe(false);
    });

    it('updates session on successful unlock', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      await Security.unlockWithPin('1234');
      expect(Security.sessionTimestamp).toBe(now);

      vi.useRealTimers();
    });
  });

  // ========== lock Tests ==========
  describe('lock', () => {
    it('sets isUnlocked to false', () => {
      Security.isUnlocked = true;
      Security.lock();
      expect(Security.isUnlocked).toBe(false);
    });

    it('can lock when already locked', () => {
      Security.isUnlocked = false;
      Security.lock();
      expect(Security.isUnlocked).toBe(false);
    });
  });

  // ========== changePin Tests ==========
  describe('changePin', () => {
    beforeEach(async () => {
      await Security.setupPin('1234');
    });

    it('changes PIN with correct old PIN', async () => {
      await Security.changePin('1234', '5678');

      expect(window.DB.security.pinVersion).toBe(2);
      expect(window.DB.security.pinHash).toBe('hex-hash-5678');
      expect(window.DB.security.pinSalt).toBe('base64salt==');
      expect(window.DB.security.failedPinAttempts).toBe(0);
      expect(window.DB.security.pinLockoutUntil).toBe(0);

      // Verify new PIN works
      const result = await Security.verifyPin('5678');
      expect(result).toBe(true);
    });

    it('rejects change with incorrect old PIN', async () => {
      await expect(Security.changePin('9999', '5678')).rejects.toThrow('Current PIN is incorrect');
    });

    it('rejects new PIN shorter than 4 digits', async () => {
      await expect(Security.changePin('1234', '123')).rejects.toThrow('New PIN must be at least 4 digits');
    });

    it('rejects empty new PIN', async () => {
      await expect(Security.changePin('1234', '')).rejects.toThrow('New PIN must be at least 4 digits');
    });

    it('rejects null new PIN', async () => {
      await expect(Security.changePin('1234', null)).rejects.toThrow('New PIN must be at least 4 digits');
    });

    it('allows new PIN longer than 4 digits', async () => {
      await Security.changePin('1234', '567890');

      const result = await Security.verifyPin('567890');
      expect(result).toBe(true);
    });

    it('resets failed attempts and lockout on successful change', async () => {
      // Set failed attempts but below lockout threshold
      window.DB.security.failedPinAttempts = 3;
      window.DB.security.pinLockoutUntil = 0; // No lockout yet

      await Security.changePin('1234', '5678');

      expect(window.DB.security.failedPinAttempts).toBe(0);
      expect(window.DB.security.pinLockoutUntil).toBe(0);
    });
  });

  // ========== resetSecurity Tests ==========
  describe('resetSecurity', () => {
    beforeEach(async () => {
      await Security.setupPin('1234');
      Security.isUnlocked = true;
    });

    it('resets all security settings to defaults', async () => {
      await Security.resetSecurity();

      expect(window.DB.security.pinHash).toBeNull();
      expect(window.DB.security.pinSalt).toBeNull();
      expect(window.DB.security.pinVersion).toBe(1);
      expect(window.DB.security.failedPinAttempts).toBe(0);
      expect(window.DB.security.pinLockoutUntil).toBe(0);
      expect(window.DB.security.biometricEnabled).toBe(false);
      expect(window.DB.security.isSetup).toBe(false);
      expect(window.DB.security.masterPassword).toBe('');
      expect(Security.isUnlocked).toBe(false);
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('isSetup returns false after reset', async () => {
      await Security.resetSecurity();
      expect(Security.isSetup()).toBe(false);
    });

    it('clears isUnlocked state', async () => {
      Security.isUnlocked = true;
      await Security.resetSecurity();
      expect(Security.isUnlocked).toBe(false);
    });
  });

  // ========== Integration Tests ==========
  describe('integration scenarios', () => {
    it('complete flow: setup, verify, lock, unlock', async () => {
      // Setup
      await Security.setupPin('1234');
      expect(Security.isSetup()).toBeTruthy();

      // Unlock
      await Security.unlockWithPin('1234');
      expect(Security.isUnlocked).toBe(true);

      // Lock
      Security.lock();
      expect(Security.isUnlocked).toBe(false);

      // Unlock again
      await Security.unlockWithPin('1234');
      expect(Security.isUnlocked).toBe(true);
    });

    it('session persists within timeout across page navigation', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      await Security.setupPin('1234');
      await Security.unlockWithPin('1234');

      // Navigate to cards page
      Security.setCurrentPage('cards');
      expect(Security.isSessionValid('cards')).toBe(true);

      // Leave cards page
      Security.clearCurrentPage();

      // Navigate to credentials within timeout
      vi.advanceTimersByTime(5000); // 5s < 10s timeout
      expect(Security.isSessionValid('credentials')).toBe(true);

      vi.useRealTimers();
    });

    it('session expires after timeout', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      await Security.setupPin('1234');
      await Security.unlockWithPin('1234');

      Security.setCurrentPage('cards');
      Security.clearCurrentPage();

      // Wait beyond timeout
      vi.advanceTimersByTime(11000); // 11s > 10s timeout
      expect(Security.isSessionValid('credentials')).toBe(false);

      vi.useRealTimers();
    });

    it('lockout prevents verification until timeout expires', async () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      await Security.setupPin('1234');

      // Trigger lockout with 5 failures
      for (let i = 0; i < 5; i++) {
        await Security.verifyPin('9999');
      }

      // Correct PIN should fail during lockout
      let result = await Security.verifyPin('1234');
      expect(result).toBe(false);

      // Advance time past lockout
      vi.advanceTimersByTime(31000); // 31s > 30s lockout

      // Now correct PIN should work
      result = await Security.verifyPin('1234');
      expect(result).toBe(true);

      vi.useRealTimers();
    });
  });
});
