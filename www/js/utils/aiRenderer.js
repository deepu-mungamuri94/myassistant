/**
 * AIRenderer
 *
 * Single entry point for turning AI markdown output into beautiful HTML.
 * All AI surfaces (card benefits, chat advisor, dashboard insights) should
 * route through AIRenderer.toHtml so formatting stays consistent.
 *
 * Depends on the global `marked` and `DOMPurify` from the vendored script
 * tags in index.html. If marked failed to load we fall back to a minimal
 * escape-and-newline renderer so the user still sees readable text instead
 * of a blank box.
 *
 * SECURITY: AI output is UNTRUSTED (a compromised/prompt-injected provider
 * response can contain hostile markup). marked.parse() emits raw HTML, so its
 * output MUST be run through DOMPurify before it ever touches innerHTML. This
 * is the single choke point every AI surface (chat, card benefits, dashboard
 * insights) routes through, so sanitizing here covers all of them.
 */
const AIRenderer = {
    _configured: false,

    // Tags/attributes allowed to survive sanitization. Deliberately permissive
    // for formatting (headings, lists, tables, emphasis, links) but WITHOUT
    // <img> — an <img src=x onerror=...> is a classic data-exfiltration vector,
    // and AI insights never legitimately need to embed images. DOMPurify strips
    // all on* event handlers and javascript:/data: URLs regardless of this list.
    _SANITIZE_CONFIG: {
        ALLOWED_TAGS: [
            'p', 'br', 'hr', 'span', 'div',
            'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark',
            'ul', 'ol', 'li',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'blockquote', 'code', 'pre',
            'a',
            'table', 'thead', 'tbody', 'tr', 'th', 'td',
        ],
        ALLOWED_ATTR: ['class', 'href', 'title', 'target', 'rel'],
        // Only allow safe URL schemes on links (blocks javascript:, data:, etc.).
        ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel):/i,
    },

    _ensureConfigured() {
        if (this._configured) return;
        if (typeof window.marked === 'undefined') return;

        // GFM = GitHub-flavored markdown (tables, strikethrough, autolinks).
        // breaks: treat single \n as <br> — AI output rarely uses double newlines.
        window.marked.setOptions({
            gfm: true,
            breaks: true,
            headerIds: false,
            mangle: false,
        });
        this._configured = true;
    },

    /**
     * Sanitize HTML produced by the markdown renderer. AI output is untrusted,
     * so this is a hard security boundary — see the file header.
     * @param {string} html  raw HTML from marked.parse
     * @returns {string} HTML safe to assign to innerHTML
     */
    _sanitize(html) {
        if (typeof window.DOMPurify !== 'undefined') {
            return window.DOMPurify.sanitize(html, this._SANITIZE_CONFIG);
        }
        // Fail SAFE: if DOMPurify is somehow unavailable, never emit raw AI
        // HTML. Escape everything and keep line breaks so the user still sees
        // readable (inert) text instead of an XSS vector or a blank box.
        console.warn('AIRenderer: DOMPurify unavailable — falling back to full HTML escape');
        const escaped = window.Utils
            ? window.Utils.escapeHtml(html)
            : String(html).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return escaped.replace(/\n/g, '<br>');
    },

    /**
     * Convert markdown text to HTML wrapped in an .ai-content container.
     * The container's CSS (styles.css) handles typography for headings,
     * lists, bold, links, and currency highlighting.
     *
     * @param {string} text  raw markdown from the AI
     * @param {object} [opts]
     * @param {boolean} [opts.compact]  use tighter spacing (for inline cards)
     * @returns {string} sanitized HTML
     */
    toHtml(text, opts = {}) {
        if (!text) return '';

        this._ensureConfigured();

        // Pre-process: strip stray LaTeX artifacts the prompt asks AI to avoid
        // but which still leak through occasionally.
        let cleaned = String(text)
            .replace(/\\times/g, '×')
            .replace(/\\\$/g, '$')
            .replace(/\\text\{([^}]*)\}/g, '$1');

        let rawHtml;
        if (typeof window.marked !== 'undefined') {
            // marked emits raw HTML from untrusted AI text — sanitize before use.
            rawHtml = this._sanitize(window.marked.parse(cleaned));
        } else {
            // Minimal fallback — escape and preserve line breaks. Already safe
            // (fully escaped), so it does not need to go through _sanitize.
            rawHtml = (window.Utils ? window.Utils.escapeHtml(cleaned) : cleaned)
                .replace(/\n/g, '<br>');
        }

        // Highlight Indian Rupee amounts so they pop out for the user.
        // Runs on already-sanitized HTML and injects only our own trusted
        // <span class="ai-amount"> markup, so it cannot reintroduce XSS.
        // Only touches text nodes between tags so we don't break attributes.
        rawHtml = rawHtml.replace(/(>[^<]*)(₹[\d,]+(?:\.\d+)?)/g, (m, prefix, amt) => {
            return `${prefix}<span class="ai-amount">${amt}</span>`;
        });

        const cls = opts.compact ? 'ai-content ai-content-compact' : 'ai-content';
        return `<div class="${cls}">${rawHtml}</div>`;
    },

    /**
     * Strip markdown to plain text — useful for previews, search, accessibility.
     */
    toPlainText(text) {
        if (!text) return '';
        return String(text)
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^[-*+]\s+/gm, '• ')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .trim();
    },
};

window.AIRenderer = AIRenderer;
