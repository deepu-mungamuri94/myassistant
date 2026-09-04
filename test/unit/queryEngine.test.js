/**
 * Tests for the AI QueryEngine — the two-phase natural-language-to-filter engine
 * behind expenses/investments chat. This module was previously UNTESTED; these
 * tests establish coverage for the parts that turn AI output into executed
 * queries, which is exactly the surface the new structured-output schema feeds:
 *   - getQueryEnvelopeSchema()  — the JSON schema handed to the AI provider
 *   - parseAIQuery()            — extract + JSON.parse the envelope
 *   - autoCorrectQuery()        — repair the filterCode JS string
 *   - validateQueryCode()       — sandbox blocklist for the filterCode JS
 *   - executeQuery()            — compile filterCode + aggregate
 *
 * filterCode stays a JS string (a schema can't validate JS), so autoCorrect +
 * validate remain the safety net regardless of structured output.
 */
const { loadModule } = require('../helpers/loadModule.js');

describe('QueryEngine', () => {
  let QueryEngine;

  beforeEach(() => {
    window.DB = {
      expenses: [
        { id: 1, title: 'Grocery Shopping', amount: 5000, category: 'Groceries', date: '2024-11-05', event: null, needWant: 'need' },
        { id: 2, title: 'Pharmacy run', amount: 1200, category: 'Health', date: '2024-11-20', event: 'Sick Week', needWant: 'need' },
        { id: 3, title: 'Movie night', amount: 800, category: 'Entertainment', date: '2025-01-10', event: 'Birthday Party', needWant: 'want' },
      ],
      portfolioInvestments: [
        { id: 1, name: 'Reliance', type: 'SHARES', goal: 'LONG_TERM', quantity: 10, price: 2500, currency: 'INR', createdAt: 1700000000000 },
        { id: 2, name: 'HDFC FD', type: 'FD', goal: 'SHORT_TERM', amount: 100000, createdAt: 1710000000000 },
      ],
      cards: [],
      sharePrices: [],
    };
    // No Investments module → calculateInvestmentAmount falls back to item fields.
    delete window.Investments;

    QueryEngine = loadModule('ai/queryEngine.js', 'QueryEngine');
  });

  describe('getQueryEnvelopeSchema', () => {
    it('builds a strict-safe expenses schema (all props required, additionalProperties false)', () => {
      const { name, schema } = QueryEngine.getQueryEnvelopeSchema('expenses');
      expect(name).toBe('expenses_query');
      expect(schema.type).toBe('object');
      expect(schema.additionalProperties).toBe(false);
      // OpenAI/Groq strict mode requires every property in `required`.
      expect(schema.required.sort()).toEqual(
        ['aggregation', 'aggregationField', 'explanation', 'filterCode', 'groupBy', 'operation'].sort()
      );
      expect(Object.keys(schema.properties).sort()).toEqual(schema.required.slice().sort());
    });

    it('constrains aggregation to the enum executeQuery understands', () => {
      const { schema } = QueryEngine.getQueryEnvelopeSchema('expenses');
      expect(schema.properties.aggregation.enum).toEqual(['sum', 'count', 'average', 'group', 'none']);
    });

    it('uses expenses-specific groupBy/aggregationField enums', () => {
      const { schema } = QueryEngine.getQueryEnvelopeSchema('expenses');
      expect(schema.properties.groupBy.enum).toEqual(['category', 'month', 'year', 'event', null]);
      expect(schema.properties.aggregationField.enum).toEqual(['amount', 'id', null]);
      // Nullable via type union so "no field" is valid under strict mode.
      expect(schema.properties.aggregationField.type).toEqual(['string', 'null']);
      expect(schema.properties.groupBy.type).toEqual(['string', 'null']);
    });

    it('uses investments-specific enums', () => {
      const { name, schema } = QueryEngine.getQueryEnvelopeSchema('investments');
      expect(name).toBe('investments_query');
      expect(schema.properties.groupBy.enum).toEqual(['type', 'goal', 'currency', null]);
      expect(schema.properties.aggregationField.enum).toEqual(['amount', 'quantity', null]);
    });
  });

  describe('parseAIQuery', () => {
    it('parses a clean JSON envelope', () => {
      const res = QueryEngine.parseAIQuery('{"operation":"filter","filterCode":"e => e.amount > 1000","aggregation":"none"}');
      expect(res.operation).toBe('filter');
      expect(res.aggregation).toBe('none');
      expect(res.filterCode).toContain('e.amount > 1000');
    });

    it('extracts JSON embedded in surrounding prose (defensive regex)', () => {
      const res = QueryEngine.parseAIQuery('Here is the query:\n{"operation":"filter","filterCode":"e => true","aggregation":"count"}\nHope that helps!');
      expect(res.aggregation).toBe('count');
    });

    it('auto-corrects the filterCode during parse (== → ===)', () => {
      const res = QueryEngine.parseAIQuery('{"filterCode":"e => e.category == \'Groceries\'"}');
      expect(res.filterCode).toContain('===');
      expect(res.filterCode).not.toMatch(/[^=!]==[^=]/);
    });

    it('returns null when no JSON object is present', () => {
      expect(QueryEngine.parseAIQuery('no json here at all')).toBeNull();
    });

    it('returns null on malformed JSON rather than throwing', () => {
      expect(QueryEngine.parseAIQuery('{ this is : not, valid json }')).toBeNull();
    });
  });

  describe('autoCorrectQuery', () => {
    it('strips ```javascript / ```js code fences', () => {
      expect(QueryEngine.autoCorrectQuery('```javascript\ne => e.amount > 100\n```')).toContain('e => e.amount > 100');
      expect(QueryEngine.autoCorrectQuery('```js\ne => true```')).not.toContain('```');
    });

    it('removes a leading return keyword', () => {
      expect(QueryEngine.autoCorrectQuery('return e => e.amount > 100')).toBe('e => e.amount > 100');
    });

    it('wraps a bare expense condition into an arrow function', () => {
      expect(QueryEngine.autoCorrectQuery('e.amount > 1000')).toBe('e => e.amount > 1000');
    });

    it('wraps a bare investment condition using i as the param', () => {
      expect(QueryEngine.autoCorrectQuery('i.type === "SHARES"')).toBe('i => i.type === "SHARES"');
    });

    it('fixes == to === and != to !==', () => {
      expect(QueryEngine.autoCorrectQuery('e => e.a == 1 && e.b != 2')).toContain('=== 1');
      expect(QueryEngine.autoCorrectQuery('e => e.a == 1 && e.b != 2')).toContain('!== 2');
    });

    it('rewrites e.month / e.year date shortcuts', () => {
      expect(QueryEngine.autoCorrectQuery('e => e.month === 10')).toContain('new Date(e.date).getMonth()');
      expect(QueryEngine.autoCorrectQuery('e => e.year === 2024')).toContain('new Date(e.date).getFullYear()');
    });

    it('rewrites i.month / i.year using createdAt', () => {
      expect(QueryEngine.autoCorrectQuery('i => i.month === 0')).toContain('new Date(i.createdAt).getMonth()');
      expect(QueryEngine.autoCorrectQuery('i => i.year === 2023')).toContain('new Date(i.createdAt).getFullYear()');
    });

    it('rewrites the common i.term mistake to i.goal', () => {
      expect(QueryEngine.autoCorrectQuery('i => i.term === "LONG_TERM"')).toContain('i.goal');
    });

    it('wraps a body with variable declarations in braces', () => {
      const out = QueryEngine.autoCorrectQuery('e => const d = new Date(e.date); return d.getMonth() === 0');
      expect(out).toMatch(/=>\s*\{/);
      expect(out.trim().endsWith('}')).toBe(true);
    });

    it('leaves an already-correct arrow function untouched', () => {
      const good = 'e => e.category === \'Groceries\'';
      expect(QueryEngine.autoCorrectQuery(good)).toBe(good);
    });
  });

  describe('validateQueryCode (security blocklist)', () => {
    const blocked = [
      ['eval', 'e => eval("x")'],
      ['Function', 'e => Function("return 1")()'],
      ['window', 'e => window.DB'],
      ['document', 'e => document.cookie'],
      ['localStorage', 'e => localStorage.getItem("x")'],
      ['sessionStorage', 'e => sessionStorage.clear()'],
      ['fetch', 'e => fetch("http://evil")'],
      ['XMLHttpRequest', 'e => new XMLHttpRequest()'],
      ['import', 'e => { import foo from "x"; return true; }'],
      ['import()', 'e => import("x")'],
      ['require', 'e => require("fs")'],
      ['process', 'e => process.env'],
      ['__proto__', 'e => e.__proto__'],
      // Hardened blocklist: outer-realm globals that don't spell "window".
      ['globalThis', 'e => globalThis.fetch("http://evil")'],
      ['self', 'e => self.location'],
      ['Reflect', 'e => Reflect.get(e, "x")'],
      ['Proxy', 'e => new Proxy(e, {})'],
      // window/document reachable via bracket notation (word-boundary, not dot).
      ['window[...]', 'e => window["DB"]'],
      ['document[...]', 'e => document["cookie"]'],
      // constructor-chain escape to the Function constructor. `constructor` is
      // blocked in ANY member position — dotted OR bracket-quoted (the latter
      // being the escape that slipped a narrower chain-only pattern).
      ['constructor.constructor', 'e => e.constructor.constructor("return this")()'],
      ['constructor("...")', 'e => e.constructor("return 1")'],
      ['constructor[...]', 'e => e.constructor["constructor"]'],
      ['bracket-quoted constructor chain', 'e => e["constructor"]["constructor"]("return this")()'],
      ['bracket-quoted then dotted', 'e => e["constructor"].constructor("x")()'],
      ['single .constructor read', 'e => e.category.constructor === String'],
      // Prototype-pollution vectors.
      ['prototype', 'e => e.constructor.prototype'],
      ['setPrototypeOf', 'e => Object.setPrototypeOf(e, {})'],
      // Computed member access assembled from string pieces (blocklist evasion).
      ['bracket string-concat', 'e => e["desc"+"ription"]'],
      ['this-split localStorage', 'e => this["local"+"Storage"]'],
    ];
    it.each(blocked)('throws on forbidden pattern: %s', (_label, code) => {
      expect(() => QueryEngine.validateQueryCode(code)).toThrow(/forbidden pattern/i);
    });

    it('allows a benign filter expression', () => {
      expect(QueryEngine.validateQueryCode('e => e.amount > 1000 && e.category === "Food"')).toBe(true);
    });

    it('allows normal numeric array indexing (only string-concat in brackets is blocked)', () => {
      expect(QueryEngine.validateQueryCode('e => e.tags && e.tags[0] === "food"')).toBe(true);
    });

    // Documents an INTENTIONAL over-block: arithmetic inside brackets is the
    // string-concat-evasion pattern's collateral. The app's records are flat
    // scalars, so a legit filter never assembles a computed index — if someone
    // "relaxes" this later, this test should make them reconsider.
    it('intentionally rejects arithmetic-in-brackets index (collateral of the concat guard)', () => {
      expect(() => QueryEngine.validateQueryCode('e => e.tags[e.n + 1] === "x"')).toThrow(/forbidden pattern/i);
    });
  });

  // Strict-mode execution is the SECOND layer (the blocklist is the first, and
  // is the sole defense against the constructor-chain escape). Strict mode's job
  // is the `this`-to-global class: an unbound filter that touches `this` gets
  // this===undefined, so it throws per-row (and is dropped) rather than reaching
  // window/globalThis.
  describe('executeQuery strict-mode sandbox (this is undefined)', () => {
    it('a filter referencing `this` cannot reach the global — row is dropped, query still succeeds', () => {
      // `this.DB` passes the text gate on its own but throws under strict mode
      // (this===undefined) → caught per-row → 0 matches, query still succeeds.
      const res = QueryEngine.executeQuery(
        { filterCode: 'e => this.DB !== undefined', aggregation: 'count' },
        'expenses'
      );
      expect(res.success).toBe(true);
      expect(res.result.value).toBe(0); // every row threw on `this.DB` and was dropped
    });
  });

  describe('executeQuery', () => {
    it('sum aggregation over a filtered expense set', () => {
      const res = QueryEngine.executeQuery(
        { operation: 'filter', filterCode: "e => e.category === 'Groceries'", aggregation: 'sum', aggregationField: 'amount' },
        'expenses'
      );
      expect(res.success).toBe(true);
      expect(res.result.type).toBe('sum');
      expect(res.result.value).toBe(5000);
      expect(res.result.count).toBe(1);
    });

    it('count aggregation', () => {
      const res = QueryEngine.executeQuery(
        { filterCode: 'e => true', aggregation: 'count' },
        'expenses'
      );
      expect(res.result.type).toBe('count');
      expect(res.result.value).toBe(3);
    });

    it('average aggregation', () => {
      const res = QueryEngine.executeQuery(
        { filterCode: 'e => true', aggregation: 'average', aggregationField: 'amount' },
        'expenses'
      );
      expect(res.result.type).toBe('average');
      expect(res.result.value).toBeCloseTo((5000 + 1200 + 800) / 3, 5);
    });

    it('group aggregation by category', () => {
      const res = QueryEngine.executeQuery(
        { filterCode: 'e => true', aggregation: 'group', groupBy: 'category', aggregationField: 'amount' },
        'expenses'
      );
      expect(res.result.type).toBe('group');
      expect(res.result.groups.Groceries.sum).toBe(5000);
      expect(res.result.groups.Health.count).toBe(1);
    });

    it('group aggregation by month buckets into YYYY-MM keys', () => {
      const res = QueryEngine.executeQuery(
        { filterCode: 'e => true', aggregation: 'group', groupBy: 'month', aggregationField: 'amount' },
        'expenses'
      );
      const keys = Object.keys(res.result.groups);
      expect(keys).toContain('2024-11');
      expect(keys).toContain('2025-01');
    });

    it('no aggregation returns the raw filtered data', () => {
      const res = QueryEngine.executeQuery(
        { filterCode: 'e => e.amount > 1000', aggregation: 'none' },
        'expenses'
      );
      expect(res.result.type).toBe('data');
      expect(res.result.count).toBe(2); // 5000 and 1200
    });

    it('wraps a bare condition (no arrow) into a filter function', () => {
      const res = QueryEngine.executeQuery(
        { filterCode: 'e.amount > 1000', aggregation: 'count' },
        'expenses'
      );
      expect(res.success).toBe(true);
      expect(res.result.value).toBe(2);
    });

    it('investments sum uses item fields when no Investments module present', () => {
      const res = QueryEngine.executeQuery(
        { filterCode: "i => i.type === 'FD'", aggregation: 'sum', aggregationField: 'amount' },
        'investments'
      );
      expect(res.result.value).toBe(100000);
    });

    it('drops items whose predicate throws rather than failing the whole query', () => {
      // Accessing .toLowerCase() on a null description throws for that row only.
      window.DB.expenses = [
        { id: 1, title: 'ok', amount: 10, description: 'has text', date: '2024-01-01' },
        { id: 2, title: 'boom', amount: 20, description: null, date: '2024-01-02' },
      ];
      const res = QueryEngine.executeQuery(
        { filterCode: "e => e.description.toLowerCase().includes('text')", aggregation: 'count' },
        'expenses'
      );
      expect(res.success).toBe(true);
      expect(res.result.value).toBe(1); // row 2 threw → dropped, not fatal
    });

    it('returns success:false with the blocklist error for forbidden code', () => {
      const res = QueryEngine.executeQuery(
        { filterCode: 'e => fetch("http://evil")', aggregation: 'count' },
        'expenses'
      );
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/forbidden pattern/i);
    });

    it('returns success:false on an unsupported mode', () => {
      const res = QueryEngine.executeQuery({ filterCode: 'x => true', aggregation: 'count' }, 'bogus');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/unsupported mode/i);
    });
  });
});
