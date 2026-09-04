const { loadModule } = require('../helpers/loadModule.js');

describe('AIProvider', () => {
  let AIProvider;

  beforeEach(() => {
    // Mock global objects
    window.DB = {
      settings: {
        geminiApiKey: 'gem-key',
        chatGptApiKey: 'gpt-key',
        perplexityApiKey: 'pplx-key',
        priorityOrder: ['gemini', 'groq', 'chatgpt', 'perplexity']
      },
      groqApiKey: 'groq-key',  // NOTE: groq key is at DB.groqApiKey, not DB.settings!
      expenses: [],
      cards: [],
      salaries: [],
      additionalIncome: [],
      sips: [],
      plans: [],
      portfolioInvestments: []
    };

    window.GeminiAI = { call: vi.fn(async () => 'gemini response') };
    window.ChatGPT = { call: vi.fn(async () => 'chatgpt response') };
    window.Perplexity = { call: vi.fn(async () => 'perplexity response') };
    window.GroqAI = { call: vi.fn(async () => 'groq response') };
    window.Utils = { showInfo: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() };
    window.Toast = { show: vi.fn() };
    window.QueryEngine = {
      generateExpensesMetadata: vi.fn(() => ({})),
      generateInvestmentsMetadata: vi.fn(() => ({}))
    };
    window.Investments = {
      getExchangeRate: vi.fn(() => 83.5),
      getGoldRate: vi.fn(() => 7500)
    };

    // Load module
    AIProvider = loadModule('ai/provider.js', 'AIProvider');
  });

  describe('isConfigured', () => {
    it('should return true when at least one provider has an API key', () => {
      expect(AIProvider.isConfigured()).toBe(true);
    });

    it('should return false when no providers have API keys', () => {
      window.DB.settings.geminiApiKey = '';
      window.DB.settings.chatGptApiKey = '';
      window.DB.settings.perplexityApiKey = '';
      window.DB.groqApiKey = '';
      expect(AIProvider.isConfigured()).toBe(false);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return all providers with keys set', () => {
      const providers = AIProvider.getAvailableProviders();
      expect(providers).toEqual(['gemini', 'groq', 'chatgpt', 'perplexity']);
    });

    it('should return only gemini when only gemini key is set', () => {
      window.DB.settings.chatGptApiKey = '';
      window.DB.settings.perplexityApiKey = '';
      window.DB.groqApiKey = '';
      const providers = AIProvider.getAvailableProviders();
      expect(providers).toEqual(['gemini']);
    });

    it('should return only groq when only groq key is set', () => {
      window.DB.settings.geminiApiKey = '';
      window.DB.settings.chatGptApiKey = '';
      window.DB.settings.perplexityApiKey = '';
      const providers = AIProvider.getAvailableProviders();
      expect(providers).toEqual(['groq']);
    });

    it('should return empty array when no keys are set', () => {
      window.DB.settings.geminiApiKey = '';
      window.DB.settings.chatGptApiKey = '';
      window.DB.settings.perplexityApiKey = '';
      window.DB.groqApiKey = '';
      const providers = AIProvider.getAvailableProviders();
      expect(providers).toEqual([]);
    });
  });

  describe('getWebSearchProviders', () => {
    it('should return only gemini and perplexity', () => {
      const providers = AIProvider.getWebSearchProviders();
      expect(providers).toEqual(['gemini', 'perplexity']);
    });

    it('should return only gemini when only gemini key is set', () => {
      window.DB.settings.perplexityApiKey = '';
      const providers = AIProvider.getWebSearchProviders();
      expect(providers).toEqual(['gemini']);
    });

    it('should return only perplexity when only perplexity key is set', () => {
      window.DB.settings.geminiApiKey = '';
      const providers = AIProvider.getWebSearchProviders();
      expect(providers).toEqual(['perplexity']);
    });

    it('should return empty array when no web search providers have keys', () => {
      window.DB.settings.geminiApiKey = '';
      window.DB.settings.perplexityApiKey = '';
      const providers = AIProvider.getWebSearchProviders();
      expect(providers).toEqual([]);
    });
  });

  describe('call', () => {
    it('should call primary provider (first in priorityOrder)', async () => {
      const result = await AIProvider.call('test prompt');
      expect(result).toBe('gemini response');
      // options ({}) threads through as the 3rd arg for gemini/chatgpt/perplexity.
      expect(window.GeminiAI.call).toHaveBeenCalledWith('test prompt', null, {});
    });

    it('should fall back to next provider on rate limit error', async () => {
      window.GeminiAI.call.mockRejectedValueOnce(new Error('429 rate limit exceeded'));
      const result = await AIProvider.call('test prompt');
      expect(result).toBe('groq response');
      expect(window.GeminiAI.call).toHaveBeenCalledTimes(1);
      expect(window.GroqAI.call).toHaveBeenCalledTimes(1);
    });

    it('should throw on non-rate-limit error without fallback', async () => {
      window.GeminiAI.call.mockRejectedValueOnce(new Error('Invalid API key'));
      await expect(AIProvider.call('test prompt')).rejects.toThrow('Invalid API key');
      expect(window.GeminiAI.call).toHaveBeenCalledTimes(1);
      expect(window.GroqAI.call).not.toHaveBeenCalled();
    });

    it('reaches the 4th provider when the first three fail retriably (no 3-attempt cap)', async () => {
      // Regression guard: maxAttempts was Math.min(3, …), which silently made
      // the 4th provider (Perplexity, last in the default order) unreachable.
      window.GeminiAI.call.mockRejectedValueOnce(new Error('rate limit'));
      window.GroqAI.call.mockRejectedValueOnce(new Error('quota exceeded'));
      window.ChatGPT.call.mockRejectedValueOnce(new Error('429 too many requests'));
      const result = await AIProvider.call('test prompt');
      expect(result).toBe('perplexity response');
      expect(window.GeminiAI.call).toHaveBeenCalledTimes(1);
      expect(window.GroqAI.call).toHaveBeenCalledTimes(1);
      expect(window.ChatGPT.call).toHaveBeenCalledTimes(1);
      expect(window.Perplexity.call).toHaveBeenCalledTimes(1);
    });

    it('should throw when ALL FOUR providers are exhausted', async () => {
      window.GeminiAI.call.mockRejectedValueOnce(new Error('rate limit'));
      window.GroqAI.call.mockRejectedValueOnce(new Error('quota exceeded'));
      window.ChatGPT.call.mockRejectedValueOnce(new Error('429 too many requests'));
      window.Perplexity.call.mockRejectedValueOnce(new Error('rate limit exceeded'));
      await expect(AIProvider.call('test prompt')).rejects.toThrow('All AI providers failed');
      expect(window.GeminiAI.call).toHaveBeenCalledTimes(1);
      expect(window.GroqAI.call).toHaveBeenCalledTimes(1);
      expect(window.ChatGPT.call).toHaveBeenCalledTimes(1);
      expect(window.Perplexity.call).toHaveBeenCalledTimes(1);
    });

    it('should throw when no providers configured', async () => {
      window.DB.settings.geminiApiKey = '';
      window.DB.settings.chatGptApiKey = '';
      window.DB.settings.perplexityApiKey = '';
      window.DB.groqApiKey = '';
      await expect(AIProvider.call('test prompt')).rejects.toThrow('No AI provider configured');
    });

    it('should use the groq-first default order when priorityOrder is not persisted', async () => {
      // Fallback in provider.js must match the DB.settings default in database.js
      // (groq first). Otherwise a fresh install with no saved priorityOrder would
      // silently prefer a different provider than the schema advertises.
      delete window.DB.settings.priorityOrder;
      const result = await AIProvider.call('test prompt');
      expect(result).toBe('groq response');
      expect(window.GroqAI.call).toHaveBeenCalledTimes(1);
      expect(window.GeminiAI.call).not.toHaveBeenCalled();
    });

    it('should pass context to provider', async () => {
      const context = { mode: 'general' };
      await AIProvider.call('test prompt', context);
      expect(window.GeminiAI.call).toHaveBeenCalledWith('test prompt', context, {});
    });

    it('should thread a jsonSchema option through to the provider', async () => {
      const jsonSchema = { name: 'q', schema: { type: 'object' } };
      await AIProvider.call('test prompt', null, { jsonSchema });
      expect(window.GeminiAI.call).toHaveBeenCalledWith('test prompt', null, { jsonSchema });
    });

    it('should thread options through the fallback loop to the next provider', async () => {
      // Gemini (primary) fails retriably; options must reach the Groq fallback too.
      window.GeminiAI.call.mockRejectedValueOnce(new Error('429 rate limit exceeded'));
      const jsonSchema = { name: 'q', schema: { type: 'object' } };
      await AIProvider.call('test prompt', null, { jsonSchema });
      // Groq gets options as the 4th arg (3rd is conversationHistory).
      expect(window.GroqAI.call).toHaveBeenCalledWith('test prompt', null, [], { jsonSchema });
    });

    it('should respect custom priorityOrder', async () => {
      window.DB.settings.priorityOrder = ['chatgpt', 'gemini', 'groq', 'perplexity'];
      const result = await AIProvider.call('test prompt');
      expect(result).toBe('chatgpt response');
      expect(window.ChatGPT.call).toHaveBeenCalledTimes(1);
      expect(window.GeminiAI.call).not.toHaveBeenCalled();
    });

    it('should suppress info messages when suppressInfoMessages is true', async () => {
      AIProvider.suppressInfoMessages = true;
      await AIProvider.call('test prompt');
      expect(window.Utils.showInfo).not.toHaveBeenCalled();
      AIProvider.suppressInfoMessages = false;
    });

    it('should show success message on fallback', async () => {
      window.GeminiAI.call.mockRejectedValueOnce(new Error('rate limit'));
      await AIProvider.call('test prompt');
      expect(window.Utils.showSuccess).toHaveBeenCalledWith(expect.stringContaining('GROQ'));
    });

    it('should fall back to next provider on timeout error', async () => {
      window.GeminiAI.call.mockRejectedValueOnce(new Error('Request timed out after 30s'));
      const result = await AIProvider.call('test prompt');
      expect(result).toBe('groq response');
      expect(window.GeminiAI.call).toHaveBeenCalledTimes(1);
      expect(window.GroqAI.call).toHaveBeenCalledTimes(1);
    });

    it('should fall back to next provider on a network error (Failed to fetch)', async () => {
      window.GeminiAI.call.mockRejectedValueOnce(new Error('Failed to fetch'));
      const result = await AIProvider.call('test prompt');
      expect(result).toBe('groq response');
      expect(window.GeminiAI.call).toHaveBeenCalledTimes(1);
      expect(window.GroqAI.call).toHaveBeenCalledTimes(1);
    });
  });

  describe('isRateLimitError', () => {
    it('should detect 429 error', () => {
      expect(AIProvider.isRateLimitError(new Error('429 Too Many Requests'))).toBe(true);
    });

    it('should detect rate limit error', () => {
      expect(AIProvider.isRateLimitError(new Error('Rate limit exceeded'))).toBe(true);
    });

    it('should detect rate_limit error', () => {
      expect(AIProvider.isRateLimitError(new Error('rate_limit_exceeded'))).toBe(true);
    });

    it('should detect quota error', () => {
      expect(AIProvider.isRateLimitError(new Error('Quota exceeded'))).toBe(true);
    });

    it('should detect resource_exhausted error', () => {
      expect(AIProvider.isRateLimitError(new Error('resource_exhausted'))).toBe(true);
    });

    it('should detect resources exhausted error', () => {
      expect(AIProvider.isRateLimitError(new Error('Resources exhausted'))).toBe(true);
    });

    it('should detect request too large error', () => {
      expect(AIProvider.isRateLimitError(new Error('Request too large'))).toBe(true);
    });

    it('should detect tokens per minute error', () => {
      expect(AIProvider.isRateLimitError(new Error('Exceeded tokens per minute'))).toBe(true);
    });

    it('should detect tpm error', () => {
      expect(AIProvider.isRateLimitError(new Error('TPM limit exceeded'))).toBe(true);
    });

    it('should detect context window error', () => {
      expect(AIProvider.isRateLimitError(new Error('Context window exceeded'))).toBe(true);
    });

    it('should detect context_length_exceeded error', () => {
      expect(AIProvider.isRateLimitError(new Error('context_length_exceeded'))).toBe(true);
    });

    it('should detect too many tokens error', () => {
      expect(AIProvider.isRateLimitError(new Error('Too many tokens'))).toBe(true);
    });

    it('should return false for normal errors', () => {
      expect(AIProvider.isRateLimitError(new Error('Invalid API key'))).toBe(false);
      expect(AIProvider.isRateLimitError(new Error('Network error'))).toBe(false);
      expect(AIProvider.isRateLimitError(new Error('Internal server error'))).toBe(false);
    });

    it('should handle case insensitivity', () => {
      expect(AIProvider.isRateLimitError(new Error('RATE LIMIT EXCEEDED'))).toBe(true);
      expect(AIProvider.isRateLimitError(new Error('Quota EXCEEDED'))).toBe(true);
    });
  });

  describe('isTimeoutError', () => {
    it('should detect "timed out" messages', () => {
      expect(AIProvider.isTimeoutError(new Error('Request timed out after 30s'))).toBe(true);
    });

    it('should detect "timeout" messages', () => {
      expect(AIProvider.isTimeoutError(new Error('Network timeout'))).toBe(true);
    });

    it('should detect "aborted" messages', () => {
      expect(AIProvider.isTimeoutError(new Error('The operation was aborted'))).toBe(true);
    });

    it('should return false for non-timeout errors', () => {
      expect(AIProvider.isTimeoutError(new Error('Invalid API key'))).toBe(false);
      expect(AIProvider.isTimeoutError(new Error('429 rate limit'))).toBe(false);
    });

    it('should NOT flag an unrelated message that merely contains "abort"', () => {
      // Guard against the over-broad bare 'abort' substring: a provider message
      // like "aborting transaction" must not be misread as a network timeout.
      expect(AIProvider.isTimeoutError(new Error('server aborting transaction: rollback'))).toBe(false);
    });
  });

  describe('isNetworkError', () => {
    it('should detect "Failed to fetch" (WebView dropped connection)', () => {
      expect(AIProvider.isNetworkError(new Error('Failed to fetch'))).toBe(true);
    });

    it('should detect "Network request failed"', () => {
      expect(AIProvider.isNetworkError(new Error('Network request failed'))).toBe(true);
    });

    it('should detect DOMException NetworkError', () => {
      expect(AIProvider.isNetworkError(new Error('NetworkError when attempting to fetch resource'))).toBe(true);
    });

    it('should return false for non-network errors', () => {
      expect(AIProvider.isNetworkError(new Error('Invalid API key'))).toBe(false);
    });
  });

  describe('isEmptyResponseError', () => {
    it('should be true for an empty/malformed completion', () => {
      expect(AIProvider.isEmptyResponseError(new Error('Groq (openai/gpt-oss-120b): empty or malformed response'))).toBe(true);
    });

    it('should be true for a finish_reason=length truncation', () => {
      expect(AIProvider.isEmptyResponseError(new Error('Groq (openai/gpt-oss-120b): output truncated (finish_reason=length) — raise max_completion_tokens'))).toBe(true);
    });

    it('should be false for unrelated errors', () => {
      expect(AIProvider.isEmptyResponseError(new Error('Invalid API key'))).toBe(false);
    });
  });

  describe('isRetriableError', () => {
    it('should be true for rate limit errors', () => {
      expect(AIProvider.isRetriableError(new Error('429 Too Many Requests'))).toBe(true);
    });

    it('should be true for timeout errors', () => {
      expect(AIProvider.isRetriableError(new Error('Request timed out after 30s'))).toBe(true);
    });

    it('should be true for network errors', () => {
      expect(AIProvider.isRetriableError(new Error('Failed to fetch'))).toBe(true);
    });

    // A reasoning model returning an empty/truncated answer (e.g. Groq gpt-oss
    // burning its budget on hidden reasoning) must fall through to the next
    // provider, not abort the chain — Groq is #1 in the default priority order.
    it('should be true for empty/truncated completions', () => {
      expect(AIProvider.isRetriableError(new Error('Groq (openai/gpt-oss-120b): empty or malformed response'))).toBe(true);
      expect(AIProvider.isRetriableError(new Error('Groq (openai/gpt-oss-120b): output truncated (finish_reason=length)'))).toBe(true);
    });

    it('should be false for auth/other errors', () => {
      expect(AIProvider.isRetriableError(new Error('Invalid API key'))).toBe(false);
    });
  });

  describe('retriableReason', () => {
    it('labels rate limits, timeouts, network, and empty-response failures distinctly', () => {
      expect(AIProvider.retriableReason(new Error('429 Too Many Requests'))).toBe('rate limit');
      expect(AIProvider.retriableReason(new Error('Request timed out after 30s'))).toBe('timeout');
      expect(AIProvider.retriableReason(new Error('Failed to fetch'))).toBe('network error');
      expect(AIProvider.retriableReason(new Error('Groq (m): empty or malformed response'))).toBe('empty response');
    });
  });

  describe('fetchWithTimeout', () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
      vi.useRealTimers();
    });

    it('resolves with the response when fetch succeeds in time', async () => {
      const fakeResponse = { ok: true };
      global.fetch = vi.fn(async () => fakeResponse);
      const res = await AIProvider.fetchWithTimeout('https://example.com', {}, 1000);
      expect(res).toBe(fakeResponse);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('passes an AbortSignal to fetch', async () => {
      global.fetch = vi.fn(async (url, opts) => {
        expect(opts.signal).toBeDefined();
        return { ok: true };
      });
      await AIProvider.fetchWithTimeout('https://example.com', { method: 'POST' }, 1000);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('throws a readable "timed out" error when the request aborts', async () => {
      // Simulate fetch rejecting with an AbortError when the signal fires.
      global.fetch = vi.fn((url, opts) => new Promise((resolve, reject) => {
        opts.signal.addEventListener('abort', () => {
          const err = new Error('The user aborted a request.');
          err.name = 'AbortError';
          reject(err);
        });
      }));
      await expect(
        AIProvider.fetchWithTimeout('https://example.com', {}, 10)
      ).rejects.toThrow(/timed out/i);
    });
  });

  describe('callWithWebSearch', () => {
    it('should use gemini first for web search', async () => {
      const result = await AIProvider.callWithWebSearch('search query');
      expect(result).toBe('gemini response');
      expect(window.GeminiAI.call).toHaveBeenCalledWith('search query', null, {});
    });

    it('should fall back to perplexity on rate limit', async () => {
      window.GeminiAI.call.mockRejectedValueOnce(new Error('rate limit'));
      const result = await AIProvider.callWithWebSearch('search query');
      expect(result).toBe('perplexity response');
      expect(window.GeminiAI.call).toHaveBeenCalledTimes(1);
      expect(window.Perplexity.call).toHaveBeenCalledTimes(1);
    });

    it('should throw when no web search providers configured', async () => {
      window.DB.settings.geminiApiKey = '';
      window.DB.settings.perplexityApiKey = '';
      await expect(AIProvider.callWithWebSearch('search query')).rejects.toThrow('No web search capable AI provider configured');
    });

    it('should pass context to provider', async () => {
      const context = { mode: 'general' };
      await AIProvider.callWithWebSearch('search query', context);
      expect(window.GeminiAI.call).toHaveBeenCalledWith('search query', context, {});
    });

    it('should throw non-rate-limit errors immediately', async () => {
      window.GeminiAI.call.mockRejectedValueOnce(new Error('Invalid API key'));
      await expect(AIProvider.callWithWebSearch('search query')).rejects.toThrow('Invalid API key');
      expect(window.GeminiAI.call).toHaveBeenCalledTimes(1);
      expect(window.Perplexity.call).not.toHaveBeenCalled();
    });
  });

  describe('callProvider', () => {
    it('should dispatch to GeminiAI', async () => {
      const result = await AIProvider.callProvider('gemini', 'test', null);
      expect(result).toBe('gemini response');
      expect(window.GeminiAI.call).toHaveBeenCalledWith('test', null, {});
    });

    it('should dispatch to GroqAI (options is the 4th arg; history stays 3rd)', async () => {
      const result = await AIProvider.callProvider('groq', 'test', null);
      expect(result).toBe('groq response');
      expect(window.GroqAI.call).toHaveBeenCalledWith('test', null, [], {});
    });

    it('should dispatch to ChatGPT', async () => {
      const result = await AIProvider.callProvider('chatgpt', 'test', null);
      expect(result).toBe('chatgpt response');
      expect(window.ChatGPT.call).toHaveBeenCalledWith('test', null, {});
    });

    it('should dispatch to Perplexity', async () => {
      const result = await AIProvider.callProvider('perplexity', 'test', null);
      expect(result).toBe('perplexity response');
      expect(window.Perplexity.call).toHaveBeenCalledWith('test', null, {});
    });

    it('should forward options to the dispatched provider', async () => {
      const jsonSchema = { name: 'q', schema: { type: 'object' } };
      await AIProvider.callProvider('chatgpt', 'test', null, { jsonSchema });
      expect(window.ChatGPT.call).toHaveBeenCalledWith('test', null, { jsonSchema });
    });

    it('should throw on unknown provider', async () => {
      await expect(AIProvider.callProvider('unknown', 'test', null)).rejects.toThrow('Unknown AI provider: unknown');
    });
  });

  describe('getAvgMonthlyIncome', () => {
    it('should return 0 with no salaries', () => {
      expect(AIProvider.getAvgMonthlyIncome()).toBe(0);
    });

    it('should return 0 with empty salaries array', () => {
      window.DB.salaries = [];
      expect(AIProvider.getAvgMonthlyIncome()).toBe(0);
    });

    it('should calculate average from recent salaries', () => {
      const today = new Date();
      window.DB.salaries = [
        { year: today.getFullYear(), month: today.getMonth() + 1, amount: 100000 },
        { year: today.getFullYear(), month: today.getMonth(), amount: 100000 },
        { year: today.getFullYear(), month: today.getMonth() - 1, amount: 100000 }
      ];
      expect(AIProvider.getAvgMonthlyIncome()).toBe(100000);
    });

    it('should include additional income in calculation', () => {
      const today = new Date();
      window.DB.salaries = [
        { year: today.getFullYear(), month: today.getMonth() + 1, amount: 100000 }
      ];
      window.DB.additionalIncome = [
        { year: today.getFullYear(), month: today.getMonth() + 1, amount: 20000 }
      ];
      expect(AIProvider.getAvgMonthlyIncome()).toBe(120000);
    });

    it('should filter salaries older than 6 months', () => {
      const today = new Date();
      window.DB.salaries = [
        { year: today.getFullYear(), month: today.getMonth() + 1, amount: 100000 },
        { year: today.getFullYear() - 1, month: today.getMonth() + 1, amount: 50000 }
      ];
      expect(AIProvider.getAvgMonthlyIncome()).toBe(100000);
    });

    it('should return 0 when all salaries are older than 6 months', () => {
      window.DB.salaries = [
        { year: 2020, month: 1, amount: 100000 }
      ];
      expect(AIProvider.getAvgMonthlyIncome()).toBe(0);
    });

    it('should round the average to nearest integer', () => {
      const today = new Date();
      window.DB.salaries = [
        { year: today.getFullYear(), month: today.getMonth() + 1, amount: 100000 },
        { year: today.getFullYear(), month: today.getMonth(), amount: 100001 }
      ];
      const result = AIProvider.getAvgMonthlyIncome();
      expect(Number.isInteger(result)).toBe(true);
    });
  });

  describe('getFinancialSnapshot', () => {
    it('should include avgMonthlyIncome', () => {
      const today = new Date();
      window.DB.salaries = [
        { year: today.getFullYear(), month: today.getMonth() + 1, amount: 100000 }
      ];
      const snapshot = AIProvider.getFinancialSnapshot();
      expect(snapshot.avgMonthlyIncome).toBe(100000);
    });

    it('should include active SIPs', () => {
      window.DB.sips = [
        { name: 'SIP 1', amount: 5000, active: true },
        { name: 'SIP 2', amount: 3000, active: true },
        { name: 'SIP 3', amount: 2000, active: false }
      ];
      const snapshot = AIProvider.getFinancialSnapshot();
      expect(snapshot.activeSips).toHaveLength(2);
      expect(snapshot.sipsMonthlyTotal).toBe(8000);
    });

    it('should include pending plans', () => {
      window.DB.plans = [
        { name: 'Plan 1', amount: 50000, status: 'pending' },
        { name: 'Plan 2', amount: 30000, status: 'pending' },
        { name: 'Plan 3', amount: 20000, status: 'completed' }
      ];
      const snapshot = AIProvider.getFinancialSnapshot();
      expect(snapshot.pendingPlans).toHaveLength(2);
      expect(snapshot.pendingPlansTotal).toBe(80000);
    });

    it('should handle empty arrays', () => {
      const snapshot = AIProvider.getFinancialSnapshot();
      expect(snapshot.avgMonthlyIncome).toBe(0);
      expect(snapshot.activeSips).toEqual([]);
      expect(snapshot.sipsMonthlyTotal).toBe(0);
      expect(snapshot.pendingPlans).toEqual([]);
      expect(snapshot.pendingPlansTotal).toBe(0);
    });
  });

  describe('prepareContext', () => {
    it('should return general context for general mode', () => {
      const context = AIProvider.prepareContext('general');
      expect(context.mode).toBe('general');
      expect(context.message).toBeDefined();
      expect(context.snapshot).toBeDefined();
    });

    it('should return cards context for cards mode', () => {
      window.DB.cards = [
        { name: 'Card 1', cardType: 'credit', benefits: 'Benefits text' },
        { name: 'Card 2', cardType: 'debit' }
      ];
      const context = AIProvider.prepareContext('cards');
      expect(context.mode).toBe('credit_cards');
      expect(context.available_cards).toHaveLength(1);
      expect(context.available_cards[0].name).toBe('Card 1');
    });

    it('should return expenses context for expenses mode', () => {
      window.DB.expenses = [
        { title: 'Expense 1', amount: 100, category: 'Food', date: '2026-07-01' }
      ];
      const context = AIProvider.prepareContext('expenses', false);
      expect(context.mode).toBe('expenses');
      expect(context.expenses).toHaveLength(1);
      expect(context.total).toBe(100);
      expect(context.snapshot).toBeDefined();
    });

    it('should return metadata for expenses mode with useMetadata', () => {
      window.QueryEngine.generateExpensesMetadata.mockReturnValue({ totalExpenses: 1000 });
      const context = AIProvider.prepareContext('expenses', true);
      expect(context.totalExpenses).toBe(1000);
      expect(context.snapshot).toBeDefined();
    });

    it('should return investments context for investments mode', () => {
      window.DB.portfolioInvestments = [
        { name: 'Investment 1', type: 'FD', amount: 100000 }
      ];
      const context = AIProvider.prepareContext('investments', false);
      expect(context.mode).toBe('investments');
      expect(context.investments).toHaveLength(1);
      expect(context.exchangeRate).toBe(83.5);
      expect(context.goldRate).toBe(7500);
      expect(context.snapshot).toBeDefined();
    });

    it('should return metadata for investments mode with useMetadata', () => {
      window.QueryEngine.generateInvestmentsMetadata.mockReturnValue({ totalValue: 500000 });
      const context = AIProvider.prepareContext('investments', true);
      expect(context.totalValue).toBe(500000);
      expect(context.snapshot).toBeDefined();
    });

    it('should return unknown mode for invalid mode', () => {
      const context = AIProvider.prepareContext('invalid');
      expect(context.mode).toBe('unknown');
    });
  });

  describe('formatContextText', () => {
    it('should format expenses context compactly', () => {
      const ctx = {
        mode: 'expenses',
        expenses: [
          { date: '2026-07-01', category: 'Food', title: 'Lunch', amount: 500 }
        ],
        total: 500
      };
      const text = AIProvider.formatContextText(ctx);
      expect(text).toContain('EXPENSES');
      expect(text).toContain('1 items');
      expect(text).toContain('₹500.00');
      expect(text).toContain('2026-07-01');
      expect(text).toContain('Food');
      expect(text).toContain('Lunch');
    });

    it('should format investments context compactly', () => {
      const ctx = {
        mode: 'investments',
        investments: [
          { type: 'FD', name: 'Bank FD', goal: 'SHORT_TERM', amount: 100000 }
        ],
        total: 100000,
        exchangeRate: 83.5
      };
      const text = AIProvider.formatContextText(ctx);
      expect(text).toContain('INVESTMENTS');
      expect(text).toContain('1 items');
      expect(text).toContain('₹100000.00');
      expect(text).toContain('83.5');
      expect(text).toContain('FD');
      expect(text).toContain('Bank FD');
      expect(text).toContain('SHORT_TERM');
    });

    it('should format credit cards context', () => {
      const ctx = {
        mode: 'credit_cards',
        available_cards: [
          { name: 'Card 1', benefits: '5% cashback on groceries' }
        ]
      };
      const text = AIProvider.formatContextText(ctx);
      expect(text).toContain('MY CREDIT CARDS');
      expect(text).toContain('Card 1');
      expect(text).toContain('5% cashback on groceries');
    });

    it('should include snapshot in formatted text', () => {
      const ctx = {
        mode: 'general',
        message: 'Test message',
        snapshot: {
          avgMonthlyIncome: 100000,
          activeSips: [{ name: 'SIP 1', amount: 5000 }],
          sipsMonthlyTotal: 5000,
          pendingPlans: [{ name: 'Plan 1', amount: 50000 }],
          pendingPlansTotal: 50000
        }
      };
      const text = AIProvider.formatContextText(ctx);
      expect(text).toContain('USER PROFILE');
      expect(text).toContain('100,000');
      expect(text).toContain('5,000');
      expect(text).toContain('50,000');
    });

    it('should fallback to JSON.stringify for unknown context', () => {
      const ctx = { unknown: 'data' };
      const text = AIProvider.formatContextText(ctx);
      expect(text).toContain('unknown');
      expect(text).toContain('data');
    });

    it('should handle cards with user notes', () => {
      const ctx = {
        mode: 'credit_cards',
        available_cards: [
          { name: 'Card 1', benefits: '5% cashback', userNotes: 'Limited to ₹5000/month' }
        ]
      };
      const text = AIProvider.formatContextText(ctx);
      expect(text).toContain('USER NOTES');
      expect(text).toContain('Limited to ₹5000/month');
    });

    it('should handle cards with benefits not yet fetched', () => {
      const ctx = {
        mode: 'credit_cards',
        available_cards: [
          { name: 'Card 1', benefits: 'Benefits not yet fetched' }
        ]
      };
      const text = AIProvider.formatContextText(ctx);
      expect(text).toContain('benefits not yet fetched');
    });
  });

  describe('getSystemInstruction', () => {
    it('should return general instruction for no context', () => {
      const instruction = AIProvider.getSystemInstruction();
      expect(instruction).toContain('helpful financial assistant');
      expect(instruction).toContain("Today's date:");
      expect(instruction).toContain('Indian Rupee (₹)');
    });

    it('should return credit cards instruction for credit_cards mode', () => {
      const instruction = AIProvider.getSystemInstruction({ mode: 'credit_cards' });
      expect(instruction).toContain('credit card advisor');
      expect(instruction).toContain('TOP 3 CARDS COMPARISON');
      expect(instruction).toContain('FINAL RECOMMENDATION');
    });

    it('should return expenses instruction for expenses mode', () => {
      const instruction = AIProvider.getSystemInstruction({ mode: 'expenses' });
      expect(instruction).toContain('expense analysis expert');
      expect(instruction).toContain('.toLowerCase().includes()');
    });

    it('should return investments instruction for investments mode', () => {
      const instruction = AIProvider.getSystemInstruction({ mode: 'investments' });
      expect(instruction).toContain('investment portfolio analyst');
      expect(instruction).toContain('SHARES, MF, GOLD, FD, EPF');
    });

    it('should return general instruction for general mode', () => {
      const instruction = AIProvider.getSystemInstruction({ mode: 'general' });
      expect(instruction).toContain('personal finance assistant');
      expect(instruction).toContain('Indian context');
    });
  });

  describe('getTodayPreamble', () => {
    it('should include ISO date', () => {
      const preamble = AIProvider.getTodayPreamble();
      expect(preamble).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should include month name and year', () => {
      const preamble = AIProvider.getTodayPreamble();
      expect(preamble).toContain('2026');
    });

    it('should include quarter', () => {
      const preamble = AIProvider.getTodayPreamble();
      expect(preamble).toMatch(/Q[1-4]/);
    });

    it('should mention relative phrases', () => {
      const preamble = AIProvider.getTodayPreamble();
      expect(preamble).toContain('last month');
      expect(preamble).toContain('this quarter');
    });
  });

  // Prompt-cache verification: logCacheUsage reads the per-provider usage block
  // and logs how many prompt tokens were served from cache. It must be a safe,
  // diagnostic-only helper — never throw, and stay silent for providers that
  // don't report cache-capable usage (Perplexity).
  describe('logCacheUsage', () => {
    let logSpy;
    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => {
      logSpy.mockRestore();
    });

    const lastCacheLine = () => {
      const call = logSpy.mock.calls.reverse().find(c => String(c[0]).includes('prompt-cache'));
      return call ? String(call[0]) : null;
    };

    it('logs OpenAI/Groq cached_tokens from usage.prompt_tokens_details', () => {
      AIProvider.logCacheUsage('Groq (gpt-oss-120b)', {
        usage: { prompt_tokens: 4641, prompt_tokens_details: { cached_tokens: 4608 } },
      });
      const line = lastCacheLine();
      expect(line).toContain('Groq (gpt-oss-120b)');
      expect(line).toContain('4608/4641');
      expect(line).toContain('99%'); // 4608/4641 ≈ 99%
    });

    it('logs Gemini cachedContentTokenCount from usageMetadata', () => {
      AIProvider.logCacheUsage('Gemini (gemini-2.5-flash-lite)', {
        usageMetadata: { promptTokenCount: 2000, cachedContentTokenCount: 1500 },
      });
      const line = lastCacheLine();
      expect(line).toContain('Gemini');
      expect(line).toContain('1500/2000');
      expect(line).toContain('75%');
    });

    it('reports 0% (not a crash) when a caching-capable provider served nothing from cache', () => {
      AIProvider.logCacheUsage('ChatGPT (gpt-4o-mini)', {
        usage: { prompt_tokens: 1200, prompt_tokens_details: { cached_tokens: 0 } },
      });
      const line = lastCacheLine();
      expect(line).toContain('0/1200');
      expect(line).toContain('0%');
    });

    it('stays SILENT for Perplexity (usage.prompt_tokens but no prompt_tokens_details)', () => {
      AIProvider.logCacheUsage('Perplexity (sonar-pro)', {
        usage: { prompt_tokens: 900, completion_tokens: 300, total_tokens: 1200 },
      });
      expect(lastCacheLine()).toBeNull();
    });

    it('stays silent (and never throws) on a missing/empty usage block', () => {
      expect(() => AIProvider.logCacheUsage('X', {})).not.toThrow();
      expect(() => AIProvider.logCacheUsage('X', null)).not.toThrow();
      expect(() => AIProvider.logCacheUsage('X', undefined)).not.toThrow();
      expect(lastCacheLine()).toBeNull();
    });
  });
});
