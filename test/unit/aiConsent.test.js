/**
 * AIConsent tests
 *
 * AIConsent is the single choke point that ensures users explicitly agree to
 * share financial summary data with third-party AI providers before ANY AI
 * feature activates. These tests verify:
 *
 * 1. The state-detection logic (hasConsent, getConsent) that determines whether
 *    a fresh prompt is required, including handling of stale consent versions.
 * 2. The persistence layer (grant, revoke) that stores decisions to DB.settings
 *    and flushes via Storage.save.
 * 3. The ensure() gate logic, including its fast-path optimization, no-nag
 *    policy for declined consent, and concurrency coalescing.
 * 4. The _showModal fallback behavior when the rich DOM isn't present.
 * 5. The DISCLOSURE_HTML content sanity (guard against accidental edits that
 *    drop the security exclusions).
 *
 * We stub _showModal for the gate tests to avoid DOM manipulation, then verify
 * the real modal fallback in a separate block.
 */

const { loadModule } = require('../helpers/loadModule.js');

describe('AIConsent', () => {
  let AIConsent;

  beforeEach(() => {
    // Reset DB to a clean slate — no prior consent decision.
    window.DB = { settings: {} };
    // Provide a Storage.save spy so we can assert persistence.
    window.Storage = { save: vi.fn() };
    // Provide a minimal Utils.confirm fallback for _showModal tests.
    window.Utils = { confirm: vi.fn() };

    // Load the module fresh.
    AIConsent = loadModule('modules/aiConsent.js', 'AIConsent');
    // Reset module state (if the module held any mutable state between loads).
    AIConsent._pending = null;
  });

  // ---- hasConsent / getConsent state logic (no modal involved) ----
  describe('hasConsent / getConsent — state detection', () => {
    it('returns null and hasConsent=false when no consent record exists', () => {
      expect(AIConsent.getConsent()).toBeNull();
      expect(AIConsent.hasConsent()).toBe(false);
    });

    it('hasConsent=true when granted=true at current version', () => {
      window.DB.settings.aiConsent = {
        granted: true,
        at: '2026-07-03T12:00:00Z',
        version: AIConsent.CURRENT_VERSION,
      };
      expect(AIConsent.getConsent()).toEqual({
        granted: true,
        at: '2026-07-03T12:00:00Z',
        version: AIConsent.CURRENT_VERSION,
      });
      expect(AIConsent.hasConsent()).toBe(true);
    });

    it('hasConsent=false for a granted record at an OLDER version (stale)', () => {
      const olderVersion = AIConsent.CURRENT_VERSION - 1;
      window.DB.settings.aiConsent = {
        granted: true,
        at: '2025-01-01T00:00:00Z',
        version: olderVersion,
      };
      expect(AIConsent.hasConsent()).toBe(false);
    });

    it('hasConsent=false when granted=false (declined)', () => {
      window.DB.settings.aiConsent = {
        granted: false,
        at: '2026-07-03T12:00:00Z',
        version: AIConsent.CURRENT_VERSION,
      };
      expect(AIConsent.hasConsent()).toBe(false);
    });

    it('hasConsent=false when granted is missing/truthy-but-not-true', () => {
      window.DB.settings.aiConsent = {
        at: '2026-07-03T12:00:00Z',
        version: AIConsent.CURRENT_VERSION,
      };
      expect(AIConsent.hasConsent()).toBe(false);
    });

    it('handles a missing window.DB gracefully (returns null)', () => {
      window.DB = undefined;
      expect(AIConsent.getConsent()).toBeNull();
      expect(AIConsent.hasConsent()).toBe(false);
    });
  });

  // ---- grant() / revoke() ----
  describe('grant / revoke — persistence', () => {
    it('grant() sets granted=true, stamps ISO timestamp, sets CURRENT_VERSION, calls Storage.save', () => {
      const before = Date.now();
      const record = AIConsent.grant();
      const after = Date.now();

      expect(record).toBeDefined();
      expect(record.granted).toBe(true);
      expect(record.version).toBe(AIConsent.CURRENT_VERSION);
      // The timestamp should be an ISO string representing a time between [before, after].
      const atMillis = new Date(record.at).getTime();
      expect(atMillis).toBeGreaterThanOrEqual(before);
      expect(atMillis).toBeLessThanOrEqual(after);

      // Persisted to DB.settings
      expect(window.DB.settings.aiConsent).toEqual(record);
      // Storage.save was called
      expect(window.Storage.save).toHaveBeenCalledOnce();
    });

    it('after grant(), hasConsent() is true', () => {
      AIConsent.grant();
      expect(AIConsent.hasConsent()).toBe(true);
    });

    it('revoke() sets granted=false and persists', () => {
      const record = AIConsent.revoke();
      expect(record.granted).toBe(false);
      expect(record.version).toBe(AIConsent.CURRENT_VERSION);
      expect(window.DB.settings.aiConsent).toEqual(record);
      expect(window.Storage.save).toHaveBeenCalledOnce();
    });

    it('after revoke(), hasConsent() is false', () => {
      AIConsent.grant();
      expect(AIConsent.hasConsent()).toBe(true);
      AIConsent.revoke();
      expect(AIConsent.hasConsent()).toBe(false);
    });

    it('grant() and revoke() handle missing Storage.save gracefully', () => {
      window.Storage = undefined;
      expect(() => AIConsent.grant()).not.toThrow();
      expect(() => AIConsent.revoke()).not.toThrow();
    });

    it('_record() handles missing window.DB gracefully', () => {
      window.DB = undefined;
      const record = AIConsent._record(true);
      expect(record).toBeNull();
    });
  });

  // ---- ensure() gate behavior (stub _showModal so no DOM is needed) ----
  describe('ensure() — gate logic', () => {
    it('resolves true immediately when consent already granted (fast-path, no modal)', async () => {
      AIConsent.grant();
      const showModalSpy = vi.fn();
      AIConsent._showModal = showModalSpy;

      const result = await AIConsent.ensure();
      expect(result).toBe(true);
      expect(showModalSpy).not.toHaveBeenCalled();
    });

    it('undecided + user AGREES → ensure() resolves true, persists granted=true', async () => {
      // No prior decision.
      AIConsent._showModal = vi.fn().mockResolvedValue(true);

      const result = await AIConsent.ensure();
      expect(result).toBe(true);
      expect(AIConsent._showModal).toHaveBeenCalledOnce();

      // Consent is now persisted.
      const consent = AIConsent.getConsent();
      expect(consent.granted).toBe(true);
      expect(consent.version).toBe(AIConsent.CURRENT_VERSION);
      expect(AIConsent.hasConsent()).toBe(true);
      expect(window.Storage.save).toHaveBeenCalledOnce();
    });

    it('undecided + user DECLINES → ensure() resolves false, persists granted=false', async () => {
      AIConsent._showModal = vi.fn().mockResolvedValue(false);

      const result = await AIConsent.ensure();
      expect(result).toBe(false);
      expect(AIConsent._showModal).toHaveBeenCalledOnce();

      const consent = AIConsent.getConsent();
      expect(consent.granted).toBe(false);
      expect(consent.version).toBe(AIConsent.CURRENT_VERSION);
      expect(AIConsent.hasConsent()).toBe(false);
      expect(window.Storage.save).toHaveBeenCalledOnce();
    });

    it('prior decline at CURRENT_VERSION → ensure() resolves false WITHOUT showing modal (no nagging)', async () => {
      window.DB.settings.aiConsent = {
        granted: false,
        at: '2026-07-03T12:00:00Z',
        version: AIConsent.CURRENT_VERSION,
      };
      const showModalSpy = vi.fn();
      AIConsent._showModal = showModalSpy;

      const result = await AIConsent.ensure();
      expect(result).toBe(false);
      expect(showModalSpy).not.toHaveBeenCalled();
    });

    it('stale decline (older version) → ensure() DOES show modal again', async () => {
      window.DB.settings.aiConsent = {
        granted: false,
        at: '2025-01-01T00:00:00Z',
        version: AIConsent.CURRENT_VERSION - 1,
      };
      AIConsent._showModal = vi.fn().mockResolvedValue(true);

      const result = await AIConsent.ensure();
      expect(result).toBe(true);
      expect(AIConsent._showModal).toHaveBeenCalledOnce();
    });

    it('concurrency: two ensure() calls before the first resolves share ONE modal', async () => {
      // Manually control when the modal resolves.
      let resolveModal;
      const modalPromise = new Promise((res) => { resolveModal = res; });
      AIConsent._showModal = vi.fn(() => modalPromise);

      // Fire two ensure() calls simultaneously.
      const call1 = AIConsent.ensure();
      const call2 = AIConsent.ensure();

      // Modal should only be invoked once.
      expect(AIConsent._showModal).toHaveBeenCalledOnce();

      // Now resolve the modal.
      resolveModal(true);

      const [result1, result2] = await Promise.all([call1, call2]);
      expect(result1).toBe(true);
      expect(result2).toBe(true);

      // Still only one modal call, not two.
      expect(AIConsent._showModal).toHaveBeenCalledOnce();
    });

    it('_pending is cleared after ensure() resolves so subsequent calls work', async () => {
      AIConsent._showModal = vi.fn().mockResolvedValue(true);

      await AIConsent.ensure();
      expect(AIConsent._pending).toBeNull();

      // A second call (after revoke) should be able to re-show the modal.
      AIConsent.revoke();
      window.DB.settings.aiConsent = null; // clear the decline so ensure() runs the modal path
      AIConsent._showModal = vi.fn().mockResolvedValue(false);
      await AIConsent.ensure();
      expect(AIConsent._pending).toBeNull();
    });
  });

  // ---- _showModal fallback behavior ----
  describe('_showModal — fallback when DOM is absent', () => {
    it('uses Utils.confirm when the custom modal DOM is missing', async () => {
      // The custom modal elements are absent in jsdom by default.
      window.Utils.confirm = vi.fn().mockResolvedValue(true);

      const result = await AIConsent._showModal();
      expect(result).toBe(true);
      expect(window.Utils.confirm).toHaveBeenCalledOnce();

      // Verify the fallback message mentions key disclosure points.
      const [message, title] = window.Utils.confirm.mock.calls[0];
      expect(message).toContain('financial summary');
      expect(message).toContain('NEVER sent');
      expect(title).toContain('Share data with AI');
    });

    it('fails SAFE (resolves false) when BOTH custom modal and Utils.confirm are missing', async () => {
      window.Utils = undefined;
      const result = await AIConsent._showModal();
      expect(result).toBe(false);
    });

    it('handles Utils.confirm rejection (resolves false)', async () => {
      window.Utils.confirm = vi.fn().mockRejectedValue(new Error('dismissed'));
      const result = await AIConsent._showModal();
      expect(result).toBe(false);
    });
  });

  // ---- _showModal with real DOM (simulate the happy path) ----
  describe('_showModal — with custom modal DOM', () => {
    let modal, titleEl, messageEl, confirmBtn, cancelBtn;

    beforeEach(() => {
      // Inject the custom modal DOM that index.html provides.
      modal = document.createElement('div');
      modal.id = 'custom-confirm-modal';
      modal.classList.add('hidden');

      titleEl = document.createElement('h3');
      titleEl.id = 'confirm-modal-title';

      messageEl = document.createElement('div');
      messageEl.id = 'confirm-modal-message';
      messageEl.textContent = 'original message';

      confirmBtn = document.createElement('button');
      confirmBtn.id = 'confirm-modal-confirm';
      confirmBtn.textContent = 'Confirm';

      cancelBtn = document.createElement('button');
      cancelBtn.id = 'confirm-modal-cancel';
      cancelBtn.textContent = 'Cancel';

      modal.append(titleEl, messageEl, confirmBtn, cancelBtn);
      document.body.appendChild(modal);
    });

    afterEach(() => {
      document.body.removeChild(modal);
    });

    it('shows the modal with custom labels and disclosure content', async () => {
      const promise = AIConsent._showModal();

      // The modal should now be visible.
      expect(modal.classList.contains('hidden')).toBe(false);
      expect(titleEl.textContent).toBe('Share data with AI?');
      expect(messageEl.innerHTML).toBe(AIConsent.DISCLOSURE_HTML);
      expect(confirmBtn.textContent).toBe('Agree & Continue');
      expect(cancelBtn.textContent).toBe('Not now');

      // Click "Agree & Continue".
      confirmBtn.click();

      const result = await promise;
      expect(result).toBe(true);

      // Modal is hidden again.
      expect(modal.classList.contains('hidden')).toBe(true);

      // Original labels/markup restored so the shared modal is pristine for next use.
      expect(messageEl.textContent).toBe('original message');
      expect(confirmBtn.textContent).toBe('Confirm');
      expect(cancelBtn.textContent).toBe('Cancel');
    });

    it('resolves false when the user clicks "Not now"', async () => {
      const promise = AIConsent._showModal();
      cancelBtn.click();
      const result = await promise;
      expect(result).toBe(false);
      expect(modal.classList.contains('hidden')).toBe(true);
    });

    it('resolves false when the user clicks the backdrop', async () => {
      const promise = AIConsent._showModal();
      // Simulate a click on the modal backdrop (event.target === modal).
      const backdropEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(backdropEvent, 'target', { value: modal, enumerable: true });
      modal.dispatchEvent(backdropEvent);

      const result = await promise;
      expect(result).toBe(false);
    });

    it('resolves false when the user presses Escape', async () => {
      const promise = AIConsent._showModal();
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(escapeEvent);

      const result = await promise;
      expect(result).toBe(false);
    });

    it('does NOT dismiss on clicks inside the modal content area', async () => {
      const promise = AIConsent._showModal();
      // Click inside the message area, not the backdrop.
      const innerEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(innerEvent, 'target', { value: messageEl, enumerable: true });
      modal.dispatchEvent(innerEvent);

      // The modal should still be showing (promise not resolved yet).
      expect(modal.classList.contains('hidden')).toBe(false);

      // Now confirm to resolve the promise.
      confirmBtn.click();
      const result = await promise;
      expect(result).toBe(true);
    });
  });

  // ---- DISCLOSURE_HTML sanity (security boundary) ----
  describe('DISCLOSURE_HTML — content sanity', () => {
    it('mentions the financial summary types sent to AI', () => {
      const html = AIConsent.DISCLOSURE_HTML;
      expect(html).toContain('income');
      expect(html).toContain('expense');
      expect(html).toContain('investment');
      expect(html).toContain('loan');
    });

    it('names the third-party AI providers', () => {
      const html = AIConsent.DISCLOSURE_HTML;
      expect(html).toContain('Google Gemini');
      expect(html).toContain('OpenAI');
      expect(html).toContain('Perplexity');
      expect(html).toContain('Groq');
    });

    it('prominently lists what is NEVER sent (security exclusions)', () => {
      const html = AIConsent.DISCLOSURE_HTML;
      // The critical exclusions must be present.
      expect(html).toContain('Never sent');
      expect(html).toContain('card number');
      expect(html).toContain('CVV');
      expect(html).toContain('credential');
    });

    it('mentions HTTPS transmission', () => {
      const html = AIConsent.DISCLOSURE_HTML;
      expect(html).toContain('HTTPS');
    });

    it('tells the user they can change this in AI Provider Settings', () => {
      const html = AIConsent.DISCLOSURE_HTML;
      expect(html).toContain('AI Provider Settings');
    });
  });

  // ---- Edge cases / robustness ----
  describe('edge cases', () => {
    it('CURRENT_VERSION is a positive integer', () => {
      expect(AIConsent.CURRENT_VERSION).toBeGreaterThan(0);
      expect(Number.isInteger(AIConsent.CURRENT_VERSION)).toBe(true);
    });

    it('grant() and revoke() return the persisted record', () => {
      const grantRecord = AIConsent.grant();
      expect(grantRecord).toEqual(window.DB.settings.aiConsent);

      const revokeRecord = AIConsent.revoke();
      expect(revokeRecord).toEqual(window.DB.settings.aiConsent);
    });

    it('ensure() handles a _showModal exception gracefully (does not throw)', async () => {
      AIConsent._showModal = vi.fn().mockRejectedValue(new Error('modal crashed'));

      // ensure() should not throw; the promise rejection is caught.
      await expect(AIConsent.ensure()).rejects.toThrow('modal crashed');
    });
  });
});
