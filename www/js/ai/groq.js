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
            
            const response = await window.AIProvider.fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 2048,
                    top_p: 0.9,
                    stream: false
                })
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
            
            const content = data?.choices?.[0]?.message?.content;
            if (typeof content !== 'string' || content.trim() === '') {
                throw new Error(`Groq (${model}): empty or malformed response`);
            }

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

