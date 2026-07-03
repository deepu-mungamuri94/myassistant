/**
 * AI Data-Sharing Consent
 *
 * A one-time, LAZY consent gate for the AI features. The very first time the
 * user triggers ANY AI feature we show an in-app modal explaining exactly what
 * financial SUMMARY data leaves the device (and what never does). Nothing is
 * shown at app launch / onboarding, because many users may never touch AI.
 *
 * The decision is persisted on-device in the same DB blob as every other
 * setting:
 *     window.DB.settings.aiConsent = { granted: true|false, at: <ISO>, version: 1 }
 * and saved via window.Storage.save() (identical persistence to the AI-provider
 * settings — see navigation.saveAISettings).
 *
 * SINGLE CHOKE POINT: AIProvider.call() awaits AIConsent.ensure() before it
 * contacts any provider, so no current OR future AI feature can bypass the
 * gate. ensure() resolves:
 *   - true  → consent granted (previously or just now) → the AI call proceeds
 *   - false → the user declined → the caller aborts the AI call cleanly
 *
 * Settings integration: hasConsent() + revoke() back a re-consent toggle in the
 * AI Provider Settings screen.
 */

const AIConsent = {
    // Bump when the disclosure materially changes; a stored decision from an
    // older version is treated as "undecided" so the user is asked again.
    CURRENT_VERSION: 1,

    // In-flight ensure() promise. If two AI calls race (e.g. the two-phase chat
    // path fires call() twice), they share ONE modal instead of stacking two.
    _pending: null,

    /**
     * Read the persisted consent record (or null if never decided).
     * @returns {{granted:boolean, at:string, version:number}|null}
     */
    getConsent() {
        const settings = (window.DB && window.DB.settings) || {};
        return settings.aiConsent || null;
    },

    /**
     * True only when the user has AFFIRMATIVELY consented under the CURRENT
     * disclosure version. A declined or missing record — or a record from an
     * older version — is NOT consent.
     * @returns {boolean}
     */
    hasConsent() {
        const c = this.getConsent();
        return !!(c && c.granted === true && c.version === this.CURRENT_VERSION);
    },

    /**
     * Persist a decision to DB.settings and flush to storage.
     * @param {boolean} granted
     * @returns {{granted:boolean, at:string, version:number}} the stored record
     */
    _record(granted) {
        if (!window.DB) return null;
        if (!window.DB.settings) window.DB.settings = {};
        const record = {
            granted: !!granted,
            at: new Date().toISOString(),
            version: this.CURRENT_VERSION
        };
        window.DB.settings.aiConsent = record;
        // Persist exactly like other settings do (debounced write).
        if (window.Storage && typeof window.Storage.save === 'function') {
            window.Storage.save();
        }
        return record;
    },

    /**
     * Ensure the user has consented before an AI call proceeds. Shows the
     * one-time modal on first use; remembers the decision thereafter.
     *
     * @returns {Promise<boolean>} true if the AI call may proceed, false if the
     *   user declined (caller must abort the AI call).
     */
    async ensure() {
        // Fast path: already granted under the current disclosure version.
        if (this.hasConsent()) return true;

        // A previously-recorded decline is remembered for the rest of this app
        // session — don't nag on every AI tap. The user can re-enable it from
        // AI Settings (revoke()/clearing re-arms the prompt).
        const existing = this.getConsent();
        if (existing && existing.granted === false && existing.version === this.CURRENT_VERSION) {
            return false;
        }

        // Coalesce concurrent callers onto a single modal.
        if (this._pending) return this._pending;

        this._pending = (async () => {
            const agreed = await this._showModal();
            this._record(agreed);
            return agreed;
        })();

        try {
            return await this._pending;
        } finally {
            this._pending = null;
        }
    },

    /**
     * Revoke consent (Settings toggle "off"). After this, the next AI use will
     * re-show the disclosure. Persists granted=false immediately.
     * @returns {{granted:boolean, at:string, version:number}}
     */
    revoke() {
        return this._record(false);
    },

    /**
     * Grant consent programmatically (Settings toggle "on"), without showing the
     * modal — the Settings row already explains the sharing. Persists
     * granted=true immediately.
     * @returns {{granted:boolean, at:string, version:number}}
     */
    grant() {
        return this._record(true);
    },

    /**
     * The exact disclosure text. Kept as data so tests (and any future consent
     * log) can assert on it, and so bumping CURRENT_VERSION is a deliberate edit.
     */
    DISCLOSURE_HTML:
        '<div class="text-left text-sm text-gray-600 space-y-3">' +
            '<p>To answer your questions, this app sends a <strong>financial summary</strong> ' +
            '(for example: income totals, expense categories, investment holdings, and loan &amp; plan info) ' +
            'to the third-party AI provider you selected ' +
            '(<strong>Google Gemini, OpenAI, Perplexity, or Groq</strong>) to generate answers.</p>' +
            '<p>This data is sent <strong>over HTTPS</strong> to that provider.</p>' +
            '<p class="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800">' +
                '<strong>Never sent:</strong> full card numbers, CVV, credit limits, ' +
                'outstanding balances, and all your stored credentials/passwords.</p>' +
            '<p class="text-xs text-gray-500">You can change this any time in AI Provider Settings.</p>' +
        '</div>',

    /**
     * Show the in-app consent modal and resolve to the user's choice.
     *
     * Reuses the app's shared #custom-confirm-modal DOM (same element
     * Utils.confirm drives) so styling and z-index match, but injects rich HTML
     * copy and the design's custom button labels ("Agree & Continue" /
     * "Not now"). Falls back to Utils.confirm (plain text) when the rich modal
     * DOM isn't present.
     *
     * @returns {Promise<boolean>} true = "Agree & Continue", false = "Not now"/dismiss
     */
    _showModal() {
        return new Promise((resolve) => {
            const modal = document.getElementById('custom-confirm-modal');
            const titleEl = document.getElementById('confirm-modal-title');
            const messageEl = document.getElementById('confirm-modal-message');
            const confirmBtn = document.getElementById('confirm-modal-confirm');
            const cancelBtn = document.getElementById('confirm-modal-cancel');

            // Fallback: the shared modal isn't in the DOM (unlikely). Use the
            // text-only confirm if available; otherwise fail SAFE (no consent).
            if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
                if (window.Utils && typeof window.Utils.confirm === 'function') {
                    window.Utils.confirm(
                        'This app sends a financial summary (income totals, expense categories, ' +
                        'investment holdings, loan & plan info) over HTTPS to the AI provider you ' +
                        'selected (Google Gemini / OpenAI / Perplexity / Groq) to generate answers. ' +
                        'Full card numbers, CVV, credit limits, outstanding balances, and all stored ' +
                        'credentials/passwords are NEVER sent. Continue?',
                        'Share data with AI?'
                    ).then(resolve).catch(() => resolve(false));
                    return;
                }
                resolve(false);
                return;
            }

            // Remember original labels/markup so the shared modal is pristine
            // for the next Utils.confirm caller.
            const originalMessageHtml = messageEl.innerHTML;
            const originalConfirmText = confirmBtn.textContent;
            const originalCancelText = cancelBtn.textContent;

            titleEl.textContent = 'Share data with AI?';
            messageEl.innerHTML = this.DISCLOSURE_HTML;
            confirmBtn.textContent = 'Agree & Continue';
            cancelBtn.textContent = 'Not now';

            modal.classList.remove('hidden');

            const cleanup = () => {
                confirmBtn.removeEventListener('click', onAgree);
                cancelBtn.removeEventListener('click', onDecline);
                modal.removeEventListener('click', onBackdrop);
                document.removeEventListener('keydown', onKeydown);
                // Restore the shared modal to its default state.
                messageEl.innerHTML = originalMessageHtml;
                confirmBtn.textContent = originalConfirmText;
                cancelBtn.textContent = originalCancelText;
            };

            const finish = (agreed) => {
                modal.classList.add('hidden');
                cleanup();
                resolve(agreed);
            };

            const onAgree = () => finish(true);
            const onDecline = () => finish(false);
            const onBackdrop = (e) => { if (e.target === modal) finish(false); };
            const onKeydown = (e) => { if (e.key === 'Escape') finish(false); };

            confirmBtn.addEventListener('click', onAgree);
            cancelBtn.addEventListener('click', onDecline);
            modal.addEventListener('click', onBackdrop);
            document.addEventListener('keydown', onKeydown);
        });
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.AIConsent = AIConsent;
}
