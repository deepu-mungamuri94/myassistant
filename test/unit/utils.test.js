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
});
