/**
 * Tests for Chat's two-phase prompt builders (buildPhase1Prompt /
 * buildPhase2Prompt). These prompts were REORDERED to be prompt-cache friendly:
 * the large, byte-identical instruction text (dataset structure, query
 * instructions, FORMAT/style guidance) is placed FIRST so providers with
 * automatic prefix caching (Groq/OpenAI/Gemini) can reuse it, and the only
 * volatile part — the user's question (plus the query results in phase 2) — is
 * placed LAST.
 *
 * The reorder must NOT drop any instruction content and must NOT leave a
 * dangling reference (e.g. "the results above" when the results now come
 * after). These tests pin both the ordering invariant and content preservation.
 */
const { loadModule } = require('../helpers/loadModule.js');

describe('Chat two-phase prompt builders (cache-aware ordering)', () => {
  let Chat;

  beforeEach(() => {
    // Builders reference the global Utils.formatIndianNumber at call time.
    global.Utils = { formatIndianNumber: (n) => String(n) };
    Chat = loadModule('ui/chat.js', 'Chat');
  });

  afterEach(() => {
    delete global.Utils;
  });

  const metadataContext = (extra = {}) => ({
    fields: ['amount', 'category', 'date'],
    queryInstructions: 'Use e.amount and e.category. Return filterCode as an arrow function.',
    ...extra,
  });

  describe('buildPhase1Prompt', () => {
    it('places the volatile user query LAST (after the dataset structure + task)', () => {
      const out = Chat.buildPhase1Prompt('how much on groceries?', 'expenses', metadataContext());
      const structureIdx = out.indexOf('dataset with the following structure');
      const taskIdx = out.indexOf('Your task:');
      const queryIdx = out.indexOf('User Query:');
      // Stable prefix first…
      expect(structureIdx).toBeGreaterThanOrEqual(0);
      expect(taskIdx).toBeGreaterThan(structureIdx);
      // …volatile query last.
      expect(queryIdx).toBeGreaterThan(taskIdx);
    });

    it('still embeds the query instructions and the user query text', () => {
      const out = Chat.buildPhase1Prompt('coffee spend', 'expenses', metadataContext());
      expect(out).toContain('Use e.amount and e.category'); // queryInstructions preserved
      expect(out).toContain('coffee spend'); // user query preserved
      expect(out).toContain('Return ONLY a JSON object'); // output contract preserved
    });

    it('has no dangling "answer this question" with no referent (question now comes after)', () => {
      const out = Chat.buildPhase1Prompt('x', 'expenses', metadataContext());
      // We reworded to "the user's question"; a bare "answer this question"
      // ahead of the query would be a dangling referent.
      expect(out).toContain("answer the user's question");
    });

    it('labels investments dataset correctly', () => {
      const out = Chat.buildPhase1Prompt('portfolio split', 'investments', metadataContext());
      expect(out).toContain('investments dataset');
    });
  });

  describe('buildPhase2Prompt', () => {
    const sumResult = {
      result: { type: 'sum', count: 3, field: 'amount', value: 5000 },
      explanation: 'Summed groceries',
    };

    it('places the FORMAT/style block FIRST and the volatile question + results LAST', () => {
      const out = Chat.buildPhase2Prompt('how much on groceries?', sumResult, 'expenses', metadataContext());
      const formatIdx = out.indexOf('FORMAT:');
      const askedIdx = out.indexOf('User asked:');
      const resultsIdx = out.indexOf('got these results');
      expect(formatIdx).toBeGreaterThanOrEqual(0);
      // Stable FORMAT block precedes the volatile question and results.
      expect(askedIdx).toBeGreaterThan(formatIdx);
      expect(resultsIdx).toBeGreaterThan(formatIdx);
    });

    it('refers to the results as "below" (they now follow the instructions), not "above"', () => {
      const out = Chat.buildPhase2Prompt('q', sumResult, 'expenses', metadataContext());
      expect(out).toContain('figures present in the results below');
      expect(out).not.toContain('figures present in the results above');
    });

    it('preserves the user question, result summary, and next-steps block', () => {
      const out = Chat.buildPhase2Prompt('grocery total?', sumResult, 'expenses', metadataContext());
      expect(out).toContain('grocery total?');
      expect(out).toContain('Total amount: ₹5000');
      expect(out).toContain('Next steps');
    });

    it('uses the investments analysis guidance for investments mode', () => {
      const out = Chat.buildPhase2Prompt('q', sumResult, 'investments', metadataContext());
      expect(out).toContain('Asset allocation');
      expect(out).not.toContain('Where the money went');
    });

    it('uses the expenses analysis guidance for expenses mode', () => {
      const out = Chat.buildPhase2Prompt('q', sumResult, 'expenses', metadataContext());
      expect(out).toContain('Where the money went');
      expect(out).not.toContain('Asset allocation');
    });

    it('appends the zero-results caveat (as the LAST, volatile piece) when nothing matched', () => {
      const zero = { result: { type: 'count', value: 0, count: 0 }, explanation: '' };
      const out = Chat.buildPhase2Prompt('q', zero, 'expenses', metadataContext());
      expect(out).toContain('Zero results were found');
      // The caveat is volatile — it must sit after the stable FORMAT block.
      expect(out.indexOf('Zero results were found')).toBeGreaterThan(out.indexOf('FORMAT:'));
    });

    it('includes the USER PROFILE snapshot (volatile) after the FORMAT block when present', () => {
      const withSnap = metadataContext({
        snapshot: { avgMonthlyIncome: 100000, sipsMonthlyTotal: 0, pendingPlansTotal: 0, activeSips: [], pendingPlans: [] },
      });
      const out = Chat.buildPhase2Prompt('q', sumResult, 'expenses', withSnap);
      expect(out).toContain('USER PROFILE');
      expect(out).toContain('Avg monthly income');
      expect(out.indexOf('USER PROFILE')).toBeGreaterThan(out.indexOf('FORMAT:'));
    });
  });
});
