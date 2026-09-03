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
 * gpt-oss is a REASONING model: it spends output tokens on a hidden chain-of-
 * thought before the visible answer. The request therefore uses
 * max_completion_tokens (not the deprecated max_tokens) with a generous budget
 * and reasoning_effort:'low', so reasoning can't starve the answer and leave
 * content empty (which previously surfaced as "empty or malformed response").
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
            
            // Build messages array
            const messages = [];
            
            // Add system message if provided
            if (systemMessage) {
                messages.push({
                    role: 'system',
                    content: systemMessage
                });
            }
            
            // Add conversation history
            if (conversationHistory && conversationHistory.length > 0) {
                messages.push(...conversationHistory);
            }
            
            // Add current user message
            messages.push({
                role: 'user',
                content: userMessage
            });
            
            console.log(`🚀 Calling Groq API (${model})...`);

            // Build the request body. gpt-oss models are REASONING models: they
            // spend output tokens on an internal chain-of-thought BEFORE the
            // visible answer, and both share the same completion-token budget.
            const requestBody = {
                model: model,
                messages: messages,
                temperature: 0.7,
                // max_tokens is deprecated on Groq in favor of max_completion_tokens.
                // The old 2048 cap could be entirely consumed by reasoning tokens on a
                // large prompt (like the dashboard's multi-section insights request),
                // leaving content empty with finish_reason="length". 8192 leaves ample
                // room for the ~600-word structured answer plus reasoning, and is well
                // under gpt-oss-120b's 65,536 output limit.
                max_completion_tokens: 8192,
                top_p: 0.9,
                stream: false
            };
            // Cap reasoning spend on gpt-oss so the budget goes to the answer, not the
            // (hidden) chain-of-thought. reasoning_effort is only valid for gpt-oss
            // models — guard on the id so a user-configured non-reasoning Groq model
            // isn't rejected with a 400. (Groq's default effort is "medium".)
            if (/gpt-oss/i.test(model)) {
                requestBody.reasoning_effort = 'low';
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
            console.log('✅ Groq API response received');

            const choice = data?.choices?.[0];
            let content = choice?.message?.content;

            // Reasoning models (gpt-oss) put the final answer in message.content, but if
            // the completion is truncated mid-thought the answer never lands there while
            // message.reasoning holds partial thinking. Salvage that rather than failing.
            if ((typeof content !== 'string' || content.trim() === '') &&
                typeof choice?.message?.reasoning === 'string' && choice.message.reasoning.trim() !== '') {
                content = choice.message.reasoning;
            }

            if (typeof content !== 'string' || content.trim() === '') {
                // finish_reason === 'length' means the output token budget was exhausted
                // (for reasoning models, usually consumed by the hidden chain-of-thought).
                // Surface that distinctly — and with a retriable marker so provider.js
                // falls through to the next provider instead of aborting the chain.
                if (choice?.finish_reason === 'length') {
                    throw new Error(`Groq (${model}): output truncated (finish_reason=length) — raise max_completion_tokens or lower reasoning_effort`);
                }
                throw new Error(`Groq (${model}): empty or malformed response`);
            }

            // gpt-oss with reasoning_format 'raw' can wrap thinking in a leading
            // <think>…</think> block; strip it defensively so the user sees only the answer.
            content = content.replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '').trim();

            return content;
            
        } catch (error) {
            console.error('❌ Groq API call failed:', error);
            throw error;
        }
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

