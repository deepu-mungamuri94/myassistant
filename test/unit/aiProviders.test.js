/**
 * Tests for the individual AI provider implementations (gemini/chatgpt/
 * groq/perplexity). Unlike provider.test.js — which mocks each provider's
 * .call() — these load the REAL provider files and mock global fetch, so they
 * exercise:
 *   - the model IDs actually sent on the wire (regression guard against the
 *     dead perplexity `llama-3.1-sonar-*` model)
 *   - malformed / empty / safety-blocked response handling (no raw TypeError)
 *   - that fetch is routed through AIProvider.fetchWithTimeout
 */
const { loadModule } = require('../helpers/loadModule.js');

/** Build a fake fetch Response. */
function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

describe('AI provider implementations (real files, mocked fetch)', () => {
  let GeminiAI, ChatGPT, GroqAI, Perplexity;
  let lastFetch;

  beforeEach(() => {
    window.DB = {
      settings: {
        geminiApiKey: 'gem-key',
        chatGptApiKey: 'gpt-key',
        perplexityApiKey: 'pplx-key',
      },
      groqApiKey: 'groq-key',
    };

    // Real provider files call window.AIProvider.getSystemInstruction /
    // formatContextText / fetchWithTimeout. Provide a light stub so we test the
    // provider files in isolation (fetchWithTimeout delegates to global fetch).
    window.AIProvider = {
      getSystemInstruction: () => 'system',
      formatContextText: (ctx) => JSON.stringify(ctx),
      fetchWithTimeout: (url, opts) => fetch(url, opts),
    };

    lastFetch = { url: null, options: null, body: null };
    global.fetch = vi.fn(async (url, options) => {
      lastFetch.url = url;
      lastFetch.options = options;
      lastFetch.body = options && options.body ? JSON.parse(options.body) : null;
      // Default: a well-formed successful response for each provider shape.
      if (String(url).includes('generativelanguage.googleapis.com')) {
        return jsonResponse({ candidates: [{ content: { parts: [{ text: 'gemini ok' }] } }] });
      }
      return jsonResponse({ choices: [{ message: { content: 'ok' } }] });
    });

    GeminiAI = loadModule('ai/gemini.js', 'GeminiAI');
    ChatGPT = loadModule('ai/chatgpt.js', 'ChatGPT');
    GroqAI = loadModule('ai/groq.js', 'GroqAI');
    Perplexity = loadModule('ai/perplexity.js', 'Perplexity');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('model IDs on the wire', () => {
    it('Gemini uses gemini-2.5-flash-lite by default (NOT the retired gemini-2.0-flash-lite model)', async () => {
      await GeminiAI.call('hi');
      expect(lastFetch.url).toContain('gemini-2.5-flash-lite');
      expect(lastFetch.url).not.toContain('gemini-2.0-flash-lite');
    });

    it('ChatGPT uses gpt-4o-mini by default', async () => {
      await ChatGPT.call('hi');
      expect(lastFetch.body.model).toBe('gpt-4o-mini');
    });

    it('Groq uses llama-3.3-70b-versatile by default', async () => {
      await GroqAI.call('hi');
      expect(lastFetch.body.model).toBe('llama-3.3-70b-versatile');
    });

    it('Perplexity uses sonar-pro by default (NOT the retired llama-3.1-sonar model)', async () => {
      await Perplexity.call('hi');
      expect(lastFetch.body.model).toBe('sonar-pro');
      expect(lastFetch.body.model).not.toMatch(/llama-3\.1-sonar/);
    });

    it('providers honor a user-configured model override', async () => {
      window.DB.settings.perplexityModel = 'sonar';
      await Perplexity.call('hi');
      expect(lastFetch.body.model).toBe('sonar');
    });
  });

  describe('successful parse', () => {
    it('Gemini returns the candidate text', async () => {
      await expect(GeminiAI.call('hi')).resolves.toBe('gemini ok');
    });

    it('Gemini joins text across multiple parts (google_search grounding)', async () => {
      global.fetch = vi.fn(async () =>
        jsonResponse({
          candidates: [{
            content: {
              parts: [
                { functionCall: { name: 'google_search' } }, // non-text grounding part
                { text: 'Part A. ' },
                { text: 'Part B.' },
              ],
            },
          }],
        }));
      await expect(GeminiAI.call('hi')).resolves.toBe('Part A. Part B.');
    });

    it('ChatGPT returns the message content', async () => {
      await expect(ChatGPT.call('hi')).resolves.toBe('ok');
    });

    it('Groq returns the message content', async () => {
      await expect(GroqAI.call('hi')).resolves.toBe('ok');
    });

    it('Perplexity returns the message content', async () => {
      await expect(Perplexity.call('hi')).resolves.toBe('ok');
    });
  });

  describe('malformed / empty responses do not throw raw TypeError', () => {
    it('Gemini throws a readable error when candidates are missing', async () => {
      global.fetch = vi.fn(async () => jsonResponse({}));
      await expect(GeminiAI.call('hi')).rejects.toThrow(/empty or blocked/i);
    });

    it('Gemini surfaces the safety blockReason', async () => {
      global.fetch = vi.fn(async () => jsonResponse({ promptFeedback: { blockReason: 'SAFETY' } }));
      await expect(GeminiAI.call('hi')).rejects.toThrow(/SAFETY/);
    });

    it('ChatGPT throws a readable error when choices are missing', async () => {
      global.fetch = vi.fn(async () => jsonResponse({}));
      await expect(ChatGPT.call('hi')).rejects.toThrow(/empty or malformed/i);
    });

    it('Groq throws a readable error when choices are missing', async () => {
      global.fetch = vi.fn(async () => jsonResponse({}));
      await expect(GroqAI.call('hi')).rejects.toThrow(/empty or malformed/i);
    });

    it('Perplexity throws a readable error when choices are missing', async () => {
      global.fetch = vi.fn(async () => jsonResponse({}));
      await expect(Perplexity.call('hi')).rejects.toThrow(/empty or malformed/i);
    });

    it('ChatGPT throws when content is null', async () => {
      global.fetch = vi.fn(async () => jsonResponse({ choices: [{ message: { content: null } }] }));
      await expect(ChatGPT.call('hi')).rejects.toThrow(/empty or malformed/i);
    });

    // An empty/whitespace-only completion is a failed generation, not a valid
    // answer — it must throw so AIProvider.call() falls back to the next
    // provider instead of surfacing a blank "success" to the user.
    it('ChatGPT throws on an empty-string completion', async () => {
      global.fetch = vi.fn(async () => jsonResponse({ choices: [{ message: { content: '' } }] }));
      await expect(ChatGPT.call('hi')).rejects.toThrow(/empty or malformed/i);
    });

    it('Groq throws on a whitespace-only completion', async () => {
      global.fetch = vi.fn(async () => jsonResponse({ choices: [{ message: { content: '   \n  ' } }] }));
      await expect(GroqAI.call('hi')).rejects.toThrow(/empty or malformed/i);
    });

    it('Perplexity throws on an empty-string completion', async () => {
      global.fetch = vi.fn(async () => jsonResponse({ choices: [{ message: { content: '' } }] }));
      await expect(Perplexity.call('hi')).rejects.toThrow(/empty or malformed/i);
    });

    it('Gemini throws on a whitespace-only candidate text', async () => {
      global.fetch = vi.fn(async () =>
        jsonResponse({ candidates: [{ content: { parts: [{ text: '   ' }] } }] }));
      await expect(GeminiAI.call('hi')).rejects.toThrow(/empty or blocked/i);
    });
  });

  describe('HTTP error handling', () => {
    it('Gemini surfaces the API error message on non-ok, tolerating a non-JSON body', async () => {
      global.fetch = vi.fn(async () => ({ ok: false, json: async () => { throw new Error('not json'); } }));
      await expect(GeminiAI.call('hi')).rejects.toThrow(/Gemini/);
    });

    it('ChatGPT surfaces the API error message on non-ok', async () => {
      global.fetch = vi.fn(async () => jsonResponse({ error: { message: 'bad key' } }, false));
      await expect(ChatGPT.call('hi')).rejects.toThrow(/bad key/);
    });
  });

  describe('fetch routing', () => {
    it('routes through AIProvider.fetchWithTimeout', async () => {
      const spy = vi.spyOn(window.AIProvider, 'fetchWithTimeout');
      await ChatGPT.call('hi');
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
