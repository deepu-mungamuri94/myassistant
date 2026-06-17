/**
 * Accessibility (a11y) helper.
 *
 * The app's UI is built from ~8k lines of hand-written HTML plus many modules
 * that render markup at runtime. Rather than hand-annotate every element, this
 * module applies accessibility semantics programmatically and keeps them in
 * sync as new markup is injected:
 *
 *   1. Modal overlays get role="dialog" + aria-modal + a label (from their title).
 *   2. Icon-only buttons/links get an aria-label derived from their title attr.
 *   3. Open modals get a focus trap, initial focus, focus restore on close, and
 *      Escape-to-close (reusing the modal's existing backdrop-click handler).
 *
 * It's intentionally defensive: anything unexpected is skipped, never thrown.
 */
const A11y = {
    // Lock screens must not be Escape-dismissable.
    _escapeExcluded: new Set(['security-unlock-modal', 'security-setup-modal']),

    _activeModal: null,
    _focusReturn: null,
    _rescanTimer: null,

    init() {
        try {
            this._enhanceModals(document);
            this._labelControls(document);
            this._installModalObservers();
            document.addEventListener('keydown', (e) => this._onKeydown(e), true);
            // Re-apply semantics to markup injected by module render() calls.
            this._installMutationRescan();
            console.log('♿ Accessibility helpers initialized');
        } catch (e) {
            console.error('A11y init error:', e);
        }
    },

    /** All modal overlay containers (the full-screen backdrop elements). */
    _modalEls() {
        return Array.from(document.querySelectorAll('[id*="modal" i]'))
            .filter(el => el.classList.contains('fixed') && el.classList.contains('inset-0'));
    },

    _enhanceModals(root) {
        const scope = root === document ? document : root;
        const els = (scope.querySelectorAll ? Array.from(scope.querySelectorAll('[id*="modal" i]')) : [])
            .filter(el => el.classList && el.classList.contains('fixed') && el.classList.contains('inset-0'));
        els.forEach(el => {
            if (!el.getAttribute('role')) el.setAttribute('role', 'dialog');
            el.setAttribute('aria-modal', 'true');
            if (!el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
                const titleEl = el.querySelector('h1, h2, h3, [id$="-title"]');
                if (titleEl) {
                    if (!titleEl.id) titleEl.id = `${el.id || 'modal'}-a11y-title`;
                    el.setAttribute('aria-labelledby', titleEl.id);
                } else {
                    el.setAttribute('aria-label', 'Dialog');
                }
            }
        });
    },

    /**
     * Give interactive elements an accessible name when they have none.
     * Uses the existing `title` attribute as the label source (so we never
     * invent wrong labels). Elements with visible text are left alone.
     */
    _labelControls(root) {
        const scope = root && root.querySelectorAll ? root : document;
        const controls = scope.querySelectorAll('button, a[href], [role="button"]');
        controls.forEach(el => {
            if (this._hasAccessibleName(el)) return;
            const title = el.getAttribute('title');
            if (title && title.trim()) {
                el.setAttribute('aria-label', title.trim());
            }
        });
    },

    _hasAccessibleName(el) {
        if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return true;
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return text.length > 0;
    },

    /** Watch each modal's class attribute to detect show/hide transitions. */
    _installModalObservers() {
        const obs = new MutationObserver((mutations) => {
            mutations.forEach(m => {
                if (m.attributeName !== 'class') return;
                const el = m.target;
                const hidden = el.classList.contains('hidden');
                if (hidden) {
                    this._onModalHidden(el);
                } else {
                    this._onModalShown(el);
                }
            });
        });
        this._modalEls().forEach(el => obs.observe(el, { attributes: true, attributeFilter: ['class'] }));
        this._modalObserver = obs;
    },

    _onModalShown(modal) {
        this._activeModal = modal;
        // Remember where focus was so we can restore it on close.
        if (!modal.contains(document.activeElement)) {
            this._focusReturn = document.activeElement;
        }
        // Move focus into the dialog (container itself, so modules can still
        // focus a specific field afterward without us fighting them).
        if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');
        requestAnimationFrame(() => {
            if (this._activeModal === modal && !modal.contains(document.activeElement)) {
                try { modal.focus({ preventScroll: true }); } catch (_) { modal.focus(); }
            }
        });
    },

    _onModalHidden(modal) {
        if (this._activeModal === modal) {
            this._activeModal = null;
            // Re-point to the next visible modal (if a stacked dialog closed).
            const stillOpen = this._modalEls().filter(m => !m.classList.contains('hidden'));
            this._activeModal = stillOpen.length ? stillOpen[stillOpen.length - 1] : null;
            if (!this._activeModal && this._focusReturn && typeof this._focusReturn.focus === 'function') {
                try { this._focusReturn.focus(); } catch (_) { /* element may be gone */ }
                this._focusReturn = null;
            }
        }
    },

    _topVisibleModal() {
        const visible = this._modalEls().filter(m => !m.classList.contains('hidden'));
        return visible.length ? visible[visible.length - 1] : null;
    },

    _focusable(container) {
        const sel = 'a[href], button:not([disabled]), input:not([disabled]), ' +
            'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        return Array.from(container.querySelectorAll(sel))
            .filter(el => el.offsetParent !== null || el === container);
    },

    _onKeydown(e) {
        if (e.key === 'Escape') {
            const top = this._topVisibleModal();
            if (top && !this._escapeExcluded.has(top.id)) {
                // Reuse the modal's own backdrop-close handler: dispatching a
                // click on the overlay sets event.target === the overlay, which
                // is exactly what the inline `if(event.target===this)` checks.
                e.preventDefault();
                top.click();
            }
            return;
        }
        if (e.key === 'Tab' && this._activeModal && !this._activeModal.classList.contains('hidden')) {
            const f = this._focusable(this._activeModal).filter(el => el !== this._activeModal);
            if (!f.length) return;
            const first = f[0];
            const last = f[f.length - 1];
            const active = document.activeElement;
            if (e.shiftKey && (active === first || active === this._activeModal)) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        }
    },

    /** Re-apply roles/labels to dynamically rendered markup (debounced). */
    _installMutationRescan() {
        const obs = new MutationObserver((mutations) => {
            let added = false;
            for (const m of mutations) {
                if (m.addedNodes && m.addedNodes.length) { added = true; break; }
            }
            if (!added) return;
            if (this._rescanTimer) return;
            this._rescanTimer = setTimeout(() => {
                this._rescanTimer = null;
                try {
                    this._labelControls(document);
                } catch (_) { /* never break the app over labeling */ }
            }, 400);
        });
        obs.observe(document.body, { childList: true, subtree: true });
        this._rescanObserver = obs;
    }
};

window.A11y = A11y;
