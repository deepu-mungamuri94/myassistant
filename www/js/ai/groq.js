/**
 * Groq AI Provider
 * Uses OpenAI GPT-OSS 120B (openai/gpt-oss-120b) model for fast, efficient AI responses
 * Groq offers high rate limits and low latency
 *
 * NOTE: the previous default, llama-3.3-70b-versatile, was deprecated by Groq
 * (removed from the free/developer tier; full shutdown 08/16/26) and now returns
 * "the model does not exist or you do not have access to it." openai/gpt-oss-120b
 * is Groq's recommended production replacement. Stale persisted values are healed
 * on load by Storage._migrateDeprecatedAIModels().
 *
 * gpt-oss is a REASONING model using OpenAI's Harmony multi-channel output
 * format. Two failure modes had to be handled:
 *   1. Reasoning starving the answer: the request uses max_completion_tokens
 *      (not the deprecated max_tokens) with a generous 8192 budget.
 *   2. The Harmony empty-final-channel serving bug — a known, non-deterministic
 *      quirk (seen on Groq and vLLM) where the model returns HTTP 200 /
 *      finish_reason="stop" with BOTH content and reasoning empty. It's most
 *      likely with reasoning_effort:'low', a large single-user-message prompt,
 *      and no system role. We mitigate by (a) ALWAYS sending a system message,
 *      (b) starting at reasoning_effort:'medium', and (c) retrying once at
 *      'high' when an answer comes back empty. If the whole ladder is blank we
 *      throw "empty or malformed response", which provider.js treats as
 *      retriable so the fallback chain (Gemini) takes over.
 */

const GroqAI = {
    name: 'Groq',

    // Groq's recommended production replacement for the retired llama-3.3-70b-versatile.
    DEFAULT_MODEL: 'openai/gpt-oss-120b',

    /**
     * Call Groq API
     * @param {string} userMessage - The user's question/prompt
     * @param {string} systemInstructions - System instructions for the AI
     * @param {Array} conversationHistory - Previous messages for context
     * @returns {Promise<string>} - AI response text
     */
    async call(userMessage, systemInstructions = '', conversationHistory = []) {
        const apiKey = window.DB.groqApiKey;
        const model = window.DB.settings.groqModel || this.DEFAULT_MODEL;
        
        if (!apiKey) {
            throw new Error('Groq API key not configured. Please add it in Settings.');
        }
        
        try {
            // Get smart system instructions based on context
            let systemMessage = '';
            if (typeof systemInstructions === 'object' && systemInstructions !== null) {
                // Use common system instruction for this mode
                systemMessage = window.AIProvider.getSystemInstruction(systemInstructions);
                // Build a compact text representation. Pretty-printed JSON balloons token
                // count by ~30% (quotes, indentation, escaping) which can blow past Groq's
                // per-minute token limits for users with many cards.
                systemMessage += '\n\nContext Data:\n' + window.AIProvider.formatContextText(systemInstructions);
            } else if (typeof systemInstructions === 'string') {
                systemMessage = systemInstructions;
            }
            
            // Build messages array.
            const messages = [];

            // ALWAYS include a system message. gpt-oss (a Harmony-format reasoning
            // model) intermittently drops its final-channel answer — returning empty
            // content AND empty reasoning on finish_reason="stop" — when the request
            // is a single large user message with NO system role. A minimal system
            // message declaring "respond directly" markedly reduces that failure mode.
            // (The dashboard insights call passes context=null, so without this the
            // request had no system role at all.)
            messages.push({
                role: 'system',
                content: systemMessage || 'You are a helpful assistant. Respond directly and completely to the user\'s request.'
            });

            // Add conversation history
            if (conversationHistory && conversationHistory.length > 0) {
                messages.push(...conversationHistory);
            }

            // Add current user message
            messages.push({
                role: 'user',
                content: userMessage
            });

            const isGptOss = /gpt-oss/i.test(model);

            // gpt-oss's empty-final-channel bug is NON-DETERMINISTIC and effort-
            // sensitive: 'low' is the most-implicated setting in the wild, and even
            // 'medium'/'high' only "sometimes" surface content. So for gpt-oss we try
            // escalating reasoning_effort until we get a non-empty answer, then let the
            // provider fallback chain (Gemini) take over if all attempts come back
            // blank. Non-gpt-oss Groq models make a single plain attempt.
            const effortLadder = isGptOss ? ['medium', 'high'] : [null];

            let lastEmptyErr = null;
            for (let i = 0; i < effortLadder.length; i++) {
                const effort = effortLadder[i];
                console.log(`🚀 Calling Groq API (${model})${effort ? ` [reasoning_effort=${effort}, attempt ${i + 1}/${effortLadder.length}]` : ''}...`);
                try {
                    return await this._request(apiKey, model, messages, effort);
                } catch (error) {
                    // Only an empty/blank answer is worth retrying with more effort;
                    // rate limits, HTTP errors, and truncation bubble up immediately
                    // (truncation is already retriable via the provider fallback chain).
                    const msg = (error && error.message) || '';
                    const isEmpty = /empty or malformed response/i.test(msg);
                    if (isEmpty && i < effortLadder.length - 1) {
                        console.warn(`⚠️ Groq returned empty content at effort=${effort}; retrying with higher effort.`);
                        lastEmptyErr = error;
                        continue;
                    }
                    throw error;
                }
            }
            // Exhausted the ladder with only empty responses.
            throw lastEmptyErr || new Error(`Groq (${model}): empty or malformed response`);

        } catch (error) {
            console.error('❌ Groq API call failed:', error);
            throw error;
        }
    },

    /**
     * Make one Groq chat-completion request and parse the answer out of it.
     * @param {string} apiKey
     * @param {string} model
     * @param {Array} messages
     * @param {string|null} reasoningEffort - 'medium'/'high' for gpt-oss, null to omit
     * @returns {Promise<string>} the answer text (throws on empty/error)
     */
    async _request(apiKey, model, messages, reasoningEffort) {
        const requestBody = {
            model: model,
            messages: messages,
            temperature: 0.7,
            // max_tokens is deprecated on Groq in favor of max_completion_tokens.
            // 8192 leaves ample room for a ~600-word structured answer plus the
            // model's hidden reasoning, well under gpt-oss-120b's 65,536 output limit.
            max_completion_tokens: 8192,
            top_p: 0.9,
            stream: false
        };
        // reasoning_effort is only valid for gpt-oss models — guard so a user-
        // configured non-reasoning Groq model isn't rejected with a 400.
        if (reasoningEffort) {
            requestBody.reasoning_effort = reasoningEffort;
        }

        const response = await window.AIProvider.fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('❌ Groq API Error:', response.status, errorData);

            // Check for rate limit errors
            if (response.status === 429) {
                throw new Error(`RATE_LIMIT: Groq (${model}) rate limit exceeded`);
            }

            const errorMsg = errorData.error?.message || `API error: ${response.status}`;
            throw new Error(`Groq (${model}): ${errorMsg}`);
        }

        const data = await response.json();
        const choice = data?.choices?.[0];
        let content = choice?.message?.content;

        // gpt-oss puts the final answer in message.content, but a truncated or
        // dropped final channel can leave content empty while message.reasoning
        // holds (partial) thinking. Salvage that rather than failing outright.
        if ((typeof content !== 'string' || content.trim() === '') &&
            typeof choice?.message?.reasoning === 'string' && choice.message.reasoning.trim() !== '') {
            content = choice.message.reasoning;
        }

        if (typeof content !== 'string' || content.trim() === '') {
            // Log the raw shape so an empty answer can be diagnosed from device logs
            // (this is a known non-deterministic gpt-oss serving quirk).
            console.warn('⚠️ Groq empty answer — finish_reason:', choice?.finish_reason,
                '| usage:', data?.usage, '| message keys:', choice?.message ? Object.keys(choice.message) : null);
            if (choice?.finish_reason === 'length') {
                throw new Error(`Groq (${model}): output truncated (finish_reason=length) — raise max_completion_tokens or lower reasoning_effort`);
            }
            throw new Error(`Groq (${model}): empty or malformed response`);
        }

        console.log('✅ Groq API response received');

        // Defensively strip a leading <think>…</think> wrapper so the user sees only the answer.
        content = content.replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '').trim();

        return content;
    },

    /**
     * Check if Groq is configured
     * @returns {boolean}
     */
    isConfigured() {
        return !!(window.DB && window.DB.groqApiKey);
    }
};

// Make it globally accessible
window.GroqAI = GroqAI;

