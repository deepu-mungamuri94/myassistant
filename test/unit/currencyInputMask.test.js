/**
 * Regression tests for the live currency-input mask.
 *
 * Bug: editing "Total Premium" (income-insurance-total) and "Annual CTC"
 * (income-ctc) ate the decimal point. Typing "16564.57" corrupted to a huge
 * integer like "1,65,654.57" because the oninput handler ran the DISPLAY
 * formatter (Utils.formatIndianNumber → toFixed(2), drops ".00") as a LIVE
 * input mask on every keystroke.
 *
 * These tests lock in the fix:
 *   - Utils.formatIndianCurrencyInput(raw): pure, live-safe masking string fn
 *   - Utils.applyCurrencyMask(inputEl): DOM wrapper that also restores caret
 *
 * The `typeInto` helper reproduces the ORIGINAL bug scenario exactly: it feeds
 * one character at a time, running the mask after each keystroke, the same way
 * a real oninput handler fires.
 */

const { loadModule } = require('../helpers/loadModule.js');

describe('Live currency input mask', () => {
  let Utils;

  beforeAll(() => {
    Utils = loadModule('core/utils.js', 'Utils');
  });

  // --- pure masking function -------------------------------------------------
  describe('formatIndianCurrencyInput (pure)', () => {
    it('groups whole numbers with Indian lakh/crore commas', () => {
      expect(Utils.formatIndianCurrencyInput('16564')).toBe('16,564');
      expect(Utils.formatIndianCurrencyInput('100000')).toBe('1,00,000');
      expect(Utils.formatIndianCurrencyInput('2400000')).toBe('24,00,000');
      expect(Utils.formatIndianCurrencyInput('10000000')).toBe('1,00,00,000');
    });

    it('PRESERVES a bare trailing decimal point (the core bug)', () => {
      // Previously "16564." reformatted to "16,564" — dot eaten.
      expect(Utils.formatIndianCurrencyInput('16564.')).toBe('16,564.');
    });

    it('preserves one in-progress decimal digit without padding', () => {
      // Previously "16564.5" became "16,564.50" (phantom 0) or ate the dot.
      expect(Utils.formatIndianCurrencyInput('16564.5')).toBe('16,564.5');
    });

    it('preserves two decimal digits exactly', () => {
      expect(Utils.formatIndianCurrencyInput('16564.57')).toBe('16,564.57');
    });

    it('truncates (does NOT round) beyond two decimals', () => {
      // A live mask must never round in-progress input.
      expect(Utils.formatIndianCurrencyInput('16564.579')).toBe('16,564.57');
      expect(Utils.formatIndianCurrencyInput('16564.575')).toBe('16,564.57');
    });

    it('re-groups a value that already contains commas', () => {
      expect(Utils.formatIndianCurrencyInput('1,65,64.57')).toBe('16,564.57');
      expect(Utils.formatIndianCurrencyInput('24,00,000')).toBe('24,00,000');
    });

    it('strips non-numeric junk but keeps digits and the decimal', () => {
      expect(Utils.formatIndianCurrencyInput('16564.57abc')).toBe('16,564.57');
      expect(Utils.formatIndianCurrencyInput('₹16564')).toBe('16,564');
    });

    it('collapses multiple decimal points to the first one', () => {
      expect(Utils.formatIndianCurrencyInput('165.64.57')).toBe('165.64');
    });

    it('handles empty / all-junk input as empty string', () => {
      expect(Utils.formatIndianCurrencyInput('')).toBe('');
      expect(Utils.formatIndianCurrencyInput('abc')).toBe('');
      expect(Utils.formatIndianCurrencyInput(null)).toBe('');
      expect(Utils.formatIndianCurrencyInput(undefined)).toBe('');
    });

    it('strips redundant leading zeros but keeps a single zero', () => {
      expect(Utils.formatIndianCurrencyInput('007')).toBe('7');
      expect(Utils.formatIndianCurrencyInput('0')).toBe('0');
      expect(Utils.formatIndianCurrencyInput('00')).toBe('0');
      expect(Utils.formatIndianCurrencyInput('0.5')).toBe('0.5');
    });

    it('round-trips cleanly: masking an already-masked value is stable', () => {
      const once = Utils.formatIndianCurrencyInput('16564.57');
      expect(Utils.formatIndianCurrencyInput(once)).toBe(once);
    });
  });

  // --- DOM wrapper + real typing simulation ---------------------------------
  describe('applyCurrencyMask (DOM) — reproduces the reported bug scenario', () => {
    /**
     * Simulate a user typing `text` one character at a time into a real
     * <input>, running the mask after every keystroke (exactly what the
     * oninput handler does). Returns the final displayed value.
     */
    function typeInto(input, text) {
      input.value = '';
      input.setSelectionRange(0, 0);
      for (const ch of text) {
        const pos = input.selectionStart == null ? input.value.length : input.selectionStart;
        input.value = input.value.slice(0, pos) + ch + input.value.slice(pos);
        input.setSelectionRange(pos + 1, pos + 1);
        Utils.applyCurrencyMask(input);
      }
      return input.value;
    }

    let input;
    beforeEach(() => {
      input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);
    });
    afterEach(() => {
      input.remove();
    });

    it('typing "16564.57" yields "16,564.57" (was corrupted before)', () => {
      expect(typeInto(input, '16564.57')).toBe('16,564.57');
    });

    it('the decimal point survives the moment it is typed', () => {
      typeInto(input, '16564');
      // now type the dot
      const pos = input.selectionStart;
      input.value = input.value.slice(0, pos) + '.' + input.value.slice(pos);
      input.setSelectionRange(pos + 1, pos + 1);
      Utils.applyCurrencyMask(input);
      expect(input.value).toBe('16,564.');
    });

    it('typing a single decimal "16564.5" keeps the 5 as a decimal, not an integer digit', () => {
      expect(typeInto(input, '16564.5')).toBe('16,564.5');
    });

    it('the masked value parses back to the number the user intended', () => {
      const displayed = typeInto(input, '16564.57');
      const parsed = parseFloat(displayed.replace(/,/g, ''));
      expect(parsed).toBe(16564.57);
    });

    it('typing a large CTC "2400000" yields "24,00,000"', () => {
      expect(typeInto(input, '2400000')).toBe('24,00,000');
    });

    it('keeps the caret after the just-typed digit (no jump to end)', () => {
      // Type "16564", then move caret to the middle and insert a digit.
      typeInto(input, '16564'); // "16,564", caret at end (6)
      // Place caret right before the last "4" i.e. after "16,56" (index 5)
      input.setSelectionRange(5, 5);
      input.value = input.value.slice(0, 5) + '7' + input.value.slice(5);
      input.setSelectionRange(6, 6);
      Utils.applyCurrencyMask(input); // raw "16567" + trailing 4 → "1,65,674"
      // The inserted 7 should be reflected and caret should sit right after it,
      // not slammed to the end of the string.
      expect(input.value).toBe('1,65,674');
      // caret should be positioned at the "7" we inserted (4th significant char)
      // significant chars before old caret = '1','6','5','6','7' minus grouping = 5 → after 5 digits
      expect(input.selectionStart).toBeLessThan(input.value.length);
    });

    it('is a no-op that does not throw on empty input', () => {
      expect(() => Utils.applyCurrencyMask(input)).not.toThrow();
      expect(input.value).toBe('');
    });

    it('typing a leading "." then "5" yields "0.5" (not "5.")', () => {
      // Regression: a bare "." synthesizes "0." and the caret must land AFTER
      // the dot so the next digit is a decimal, not an integer digit.
      expect(typeInto(input, '.5')).toBe('0.5');
      expect(parseFloat(input.value.replace(/,/g, ''))).toBe(0.5);
    });

    it('typing ".57" yields "0.57"', () => {
      expect(typeInto(input, '.57')).toBe('0.57');
      expect(parseFloat(input.value.replace(/,/g, ''))).toBe(0.57);
    });

    it('after typing "." alone the caret sits after the synthesized "0."', () => {
      input.value = '.';
      input.setSelectionRange(1, 1);
      Utils.applyCurrencyMask(input);
      expect(input.value).toBe('0.');
      expect(input.selectionStart).toBe(2); // caret after the dot
    });
  });
});
