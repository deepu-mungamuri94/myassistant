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

    it('Groq uses openai/gpt-oss-120b by default (NOT the retired llama-3.3-70b-versatile model)', async () => {
      await GroqAI.call('hi');
      expect(lastFetch.body.model).toBe('openai/gpt-oss-120b');
      expect(lastFetch.body.model).not.toBe('llama-3.3-70b-versatile');
    });

    it('Groq honors a user-configured model override', async () => {
      window.DB.settings.groqModel = 'openai/gpt-oss-20b';
      await GroqAI.call('hi');
      expect(lastFetch.body.model).toBe('openai/gpt-oss-20b');
    });
  });

  describe('Groq reasoning-model request shape', () => {
    // gpt-oss models spend output tokens on hidden reasoning BEFORE the answer.
    // The old max_tokens:2048 could be fully consumed by reasoning, returning
    // empty content — so the request must use the non-deprecated
    // max_completion_tokens with a larger budget and cap reasoning effort.
    it('sends max_completion_tokens (not the deprecated max_tokens)', async () => {
      await GroqAI.call('hi');
      expect(lastFetch.body.max_completion_tokens).toBe(8192);
      expect(lastFetch.body).not.toHaveProperty('max_tokens');
    });

    it('sets reasoning_effort=medium on the first gpt-oss attempt (NOT the empty-content-prone low)', async () => {
      await GroqAI.call('hi'); // default model is openai/gpt-oss-120b
      expect(lastFetch.body.reasoning_effort).toBe('medium');
      expect(lastFetch.body.reasoning_effort).not.toBe('low');
    });

    it('always sends a system message (even with no context) — mitigates the Harmony empty-final-channel bug', async () => {
      await GroqAI.call('hi'); // no systemInstructions passed
      const roles = lastFetch.body.messages.map((m) => m.role);
      expect(roles[0]).toBe('system');
      expect(lastFetch.body.messages[0].content).toMatch(/respond directly/i);
    });

    it('omits reasoning_effort for a non-gpt-oss model (avoids 400 on plain models)', async () => {
      window.DB.settings.groqModel = 'llama-3.1-8b-instant';
      await GroqAI.call('hi');
      expect(lastFetch.body).not.toHaveProperty('reasoning_effort');
    });

    it('does NOT send reasoning_format (unsupported for gpt-oss)', async () => {
      await GroqAI.call('hi');
      expect(lastFetch.body).not.toHaveProperty('reasoning_format');
    });

    it('throws a distinct truncation error on empty content + finish_reason=length', async () => {
      global.fetch = vi.fn(async () =>
        jsonResponse({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }));
      await expect(GroqAI.call('hi')).rejects.toThrow(/truncated \(finish_reason=length\)/i);
    });

    it('salvages message.reasoning when content is empty (truncated mid-answer)', async () => {
      global.fetch = vi.fn(async () =>
        jsonResponse({ choices: [{ message: { content: '', reasoning: 'partial insight text' }, finish_reason: 'length' }] }));
      await expect(GroqAI.call('hi')).resolves.toBe('partial insight text');
    });

    it('strips a leading <think>…</think> wrapper from the answer', async () => {
      global.fetch = vi.fn(async () =>
        jsonResponse({ choices: [{ message: { content: '<think>deliberating…</think>\n\nHere is the answer.' } }] }));
      await expect(GroqAI.call('hi')).resolves.toBe('Here is the answer.');
    });

    // The Harmony empty-final-channel bug is non-deterministic: a retry at higher
    // effort often lands the answer that the first attempt dropped. gpt-oss should
    // escalate medium → high before giving up (and falling through to Gemini).
    it('retries at reasoning_effort=high when the first gpt-oss attempt returns empty content', async () => {
      const efforts = [];
      global.fetch = vi.fn(async (url, options) => {
        const effort = JSON.parse(options.body).reasoning_effort;
        efforts.push(effort);
        // First attempt (medium): both content and reasoning empty → the bug.
        if (effort === 'medium') {
          return jsonResponse({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] });
        }
        // Retry at high: the answer lands.
        return jsonResponse({ choices: [{ message: { content: 'recovered answer' } }] });
      });
      await expect(GroqAI.call('hi')).resolves.toBe('recovered answer');
      expect(efforts).toEqual(['medium', 'high']);
    });

    it('gives up (throws empty) after the full effort ladder returns empty content', async () => {
      const efforts = [];
      global.fetch = vi.fn(async (url, options) => {
        efforts.push(JSON.parse(options.body).reasoning_effort);
        return jsonResponse({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] });
      });
      await expect(GroqAI.call('hi')).rejects.toThrow(/empty or malformed/i);
      expect(efforts).toEqual(['medium', 'high']); // tried both, then bailed
    });

    it('does NOT retry a non-empty error (e.g. truncation) at higher effort', async () => {
      const efforts = [];
      global.fetch = vi.fn(async (url, options) => {
        efforts.push(JSON.parse(options.body).reasoning_effort);
        return jsonResponse({ choices: [{ message: { content: '' }, finish_reason: 'length' }] });
      });
      await expect(GroqAI.call('hi')).rejects.toThrow(/truncated/i);
      expect(efforts).toEqual(['medium']); // truncation bubbles up immediately, no escalation
    });
  });

  describe('model IDs on the wire (Perplexity)', () => {
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
