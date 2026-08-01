/**
 * Unit tests for Utils module
 * Tests currency formatting, number parsing, and percentage calculations
 */

const { loadModule } = require('../helpers/loadModule.js');

describe('Utils Module', () => {
  let Utils;

  beforeAll(() => {
    Utils = loadModule('core/utils.js', 'Utils');
  });

  describe('formatCurrency', () => {
    it('formats currency with ₹ symbol and commas', () => {
      const formatted = Utils.formatCurrency(1000);
      expect(formatted).toMatch(/^₹/);
      expect(formatted).toContain('1,000.00');
    });

    it('handles zero', () => {
      const formatted = Utils.formatCurrency(0);
      expect(formatted).toBe('₹0.00');
    });

    it('handles invalid input', () => {
      const formatted = Utils.formatCurrency('not a number');
      expect(formatted).toBe('₹0');
    });
  });

  describe('formatIndianNumber', () => {
    it('formats with Indian lakh/crore grouping', () => {
      // 1,00,00,000 = 1 crore
      const formatted = Utils.formatIndianNumber(10000000);
      expect(formatted).toBe('1,00,00,000');
    });

    it('formats smaller numbers correctly', () => {
      expect(Utils.formatIndianNumber(1000)).toBe('1,000');
      expect(Utils.formatIndianNumber(100000)).toBe('1,00,000'); // 1 lakh
    });

    it('handles decimals correctly', () => {
      const formatted = Utils.formatIndianNumber(12345.67);
      expect(formatted).toBe('12,345.67');
    });

    it('handles zero', () => {
      expect(Utils.formatIndianNumber(0)).toBe('0');
    });

    it('handles null/undefined', () => {
      expect(Utils.formatIndianNumber(null)).toBe('0');
      expect(Utils.formatIndianNumber(undefined)).toBe('0');
    });
  });

  describe('formatCompactNumber', () => {
    it('leaves sub-thousand amounts as whole rupees', () => {
      expect(Utils.formatCompactNumber(0)).toBe('0');
      expect(Utils.formatCompactNumber(850)).toBe('850');
      expect(Utils.formatCompactNumber(999)).toBe('999');
    });

    it('abbreviates thousands with k and drops a trailing .0', () => {
      expect(Utils.formatCompactNumber(1000)).toBe('1k');
      expect(Utils.formatCompactNumber(2200)).toBe('2.2k');
      expect(Utils.formatCompactNumber(5000)).toBe('5k');
      expect(Utils.formatCompactNumber(99900)).toBe('99.9k');
    });

    it('abbreviates lakhs with L', () => {
      expect(Utils.formatCompactNumber(100000)).toBe('1L');
      expect(Utils.formatCompactNumber(125000)).toBe('1.3L'); // 1.25 → 1.3 (toFixed rounds)
      expect(Utils.formatCompactNumber(9990000)).toBe('99.9L');
    });

    it('abbreviates crores with Cr', () => {
      expect(Utils.formatCompactNumber(10000000)).toBe('1Cr');
      expect(Utils.formatCompactNumber(12500000)).toBe('1.3Cr');
    });

    it('handles negatives and invalid input', () => {
      expect(Utils.formatCompactNumber(-2200)).toBe('-2.2k');
      expect(Utils.formatCompactNumber(null)).toBe('0');
      expect(Utils.formatCompactNumber('not a number')).toBe('0');
    });
  });

  describe('safeParseFloat', () => {
    it('parses valid float', () => {
      expect(Utils.safeParseFloat('123.45')).toBe(123.45);
      expect(Utils.safeParseFloat(123.45)).toBe(123.45);
    });

    it('returns default value for invalid input', () => {
      expect(Utils.safeParseFloat('not a number', 10)).toBe(10);
      expect(Utils.safeParseFloat('', 0)).toBe(0);
    });

    it('uses default of 0 when not specified', () => {
      expect(Utils.safeParseFloat('invalid')).toBe(0);
    });
  });

  describe('safeParseInt', () => {
    it('parses valid integer', () => {
      expect(Utils.safeParseInt('123')).toBe(123);
      expect(Utils.safeParseInt(123)).toBe(123);
    });

    it('returns default value for invalid input', () => {
      expect(Utils.safeParseInt('not a number', 5)).toBe(5);
    });
  });

  describe('calculatePercentage', () => {
    it('calculates percentage correctly', () => {
      const percent = Utils.calculatePercentage(25, 100);
      expect(percent).toBe(25.0);
    });

    it('handles decimals with specified precision', () => {
      const percent = Utils.calculatePercentage(1, 3, 2);
      expect(percent).toBeCloseTo(33.33, 2);
    });

    it('returns 0 for zero total', () => {
      expect(Utils.calculatePercentage(10, 0)).toBe(0);
    });

    it('returns 0 for NaN inputs', () => {
      expect(Utils.calculatePercentage('not', 'numbers')).toBe(0);
    });
  });

  describe('escapeHtml', () => {
    it('escapes HTML special characters', () => {
      const input = '<script>alert("XSS")</script>';
      const escaped = Utils.escapeHtml(input);
      expect(escaped).not.toContain('<');
      expect(escaped).not.toContain('>');
      expect(escaped).toContain('&lt;');
      expect(escaped).toContain('&gt;');
    });

    it('handles null and undefined', () => {
      expect(Utils.escapeHtml(null)).toBe('');
      expect(Utils.escapeHtml(undefined)).toBe('');
    });

    it('escapes quotes and ampersands', () => {
      const input = 'He said "hello" & goodbye';
      const escaped = Utils.escapeHtml(input);
      expect(escaped).toContain('&quot;');
      expect(escaped).toContain('&amp;');
    });

    it('escapes single quotes', () => {
      const input = "x'y";
      const escaped = Utils.escapeHtml(input);
      expect(escaped).toContain('&#39;');
    });
  });

  describe('escapeJsAttr', () => {
    // Simulate how a browser hands an onclick="fn('${value}')" value to the JS
    // engine: the HTML attribute is entity-decoded first, THEN the JS string is
    // parsed. This helper models that round-trip to prove no breakout survives.
    const htmlDecode = (s) => String(s)
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    // Recover the JS-string literal's value: strip the enclosing quotes and undo
    // backslash escapes (\\ , \' , \r , \n).
    const jsStringValue = (literalBody) => literalBody
      .replace(/\\n/g, '\n').replace(/\\r/g, '\r')
      .replace(/\\'/g, "'").replace(/\\\\/g, '\\');

    const roundTrip = (raw) => jsStringValue(htmlDecode(Utils.escapeJsAttr(raw)));

    it('handles null and undefined', () => {
      expect(Utils.escapeJsAttr(null)).toBe('');
      expect(Utils.escapeJsAttr(undefined)).toBe('');
    });

    it('round-trips a plain string unchanged (behavior-preserving)', () => {
      expect(roundTrip('Goa Trip')).toBe('Goa Trip');
      expect(roundTrip('Food & Dining')).toBe('Food & Dining');
    });

    it('round-trips names with apostrophes (e.g. "Mom\'s Birthday")', () => {
      expect(roundTrip("Mom's Birthday")).toBe("Mom's Birthday");
    });

    it('neutralizes the classic onclick breakout payload', () => {
      // This is exactly what the old escapeHtml(x).replace(/'/g,"\\'") FAILED to stop.
      const payload = "');alert(document.cookie);//";
      const out = Utils.escapeJsAttr(payload);
      // The emitted attribute must NOT contain a raw single quote that could close
      // the JS string; it is emitted as the &#39; entity instead.
      expect(out).not.toMatch(/(^|[^\\])'/); // no unescaped raw quote
      expect(out).toContain('&#39;');
      // And after the browser's decode + JS parse, it is just inert data.
      expect(roundTrip(payload)).toBe(payload);
    });

    it('neutralizes double-quote attribute breakout', () => {
      const payload = '" onmouseover="alert(1)';
      const out = Utils.escapeJsAttr(payload);
      expect(out).not.toContain('"');   // raw double-quote would break the attribute
      expect(out).toContain('&quot;');
      expect(roundTrip(payload)).toBe(payload);
    });

    it('escapes angle brackets so no tag can be injected', () => {
      const out = Utils.escapeJsAttr('<img src=x onerror=alert(1)>');
      expect(out).not.toContain('<');
      expect(out).not.toContain('>');
    });

    it('escapes backslashes so they cannot escape our escaping', () => {
      // A trailing backslash must not swallow the closing quote we control.
      expect(roundTrip("path\\")).toBe("path\\");
      expect(roundTrip("a\\'b")).toBe("a\\'b");
    });
  });

  describe('generateId', () => {
    it('returns a number', () => {
      const id = Utils.generateId();
      expect(typeof id).toBe('number');
      expect(Number.isFinite(id)).toBe(true);
    });

    it('returns strictly-increasing values across rapid successive calls', () => {
      // Call generateId 1000 times in a tight loop with no delay.
      // Under the old implementation (plain Date.now()), calls within the same
      // millisecond would return identical values, causing collisions.
      // The hardened implementation with _lastId monotonic guard ensures every
      // call returns a strictly greater value than the previous.
      const ids = [];
      for (let i = 0; i < 1000; i++) {
        ids.push(Utils.generateId());
      }

      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBeGreaterThan(ids[i - 1]);
      }
    });

    it('never returns duplicate ids', () => {
      // Generate 1000 ids and collect them in a Set.
      // If any duplicates exist, Set size will be less than 1000.
      const ids = [];
      for (let i = 0; i < 1000; i++) {
        ids.push(Utils.generateId());
      }

      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(1000);
    });
  });
});
