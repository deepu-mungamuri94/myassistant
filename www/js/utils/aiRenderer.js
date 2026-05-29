/**
 * AIRenderer
 *
 * Single entry point for turning AI markdown output into beautiful HTML.
 * All AI surfaces (card benefits, chat advisor, dashboard insights) should
 * route through AIRenderer.toHtml so formatting stays consistent.
 *
 * Depends on the global `marked` from the CDN script tag in index.html.
 * If marked failed to load we fall back to a minimal escape-and-newline
 * renderer so the user still sees readable text instead of a blank box.
 */
const AIRenderer = {
    _configured: false,

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
            rawHtml = window.marked.parse(cleaned);
        } else {
            // Minimal fallback — escape and preserve line breaks.
            rawHtml = (window.Utils ? window.Utils.escapeHtml(cleaned) : cleaned)
                .replace(/\n/g, '<br>');
        }

        // Highlight Indian Rupee amounts so they pop out for the user.
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
