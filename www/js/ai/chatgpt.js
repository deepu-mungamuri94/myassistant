/**
 * OpenAI ChatGPT Integration
 * Handles communication with ChatGPT API
 */

const ChatGPT = {
    API_ENDPOINT: 'https://api.openai.com/v1/chat/completions',

    /**
     * Call ChatGPT API
     */
    async call(prompt, context = null, options = {}) {
        const apiKey = window.DB.settings.chatGptApiKey;
        const model = window.DB.settings.chatGptModel || 'gpt-4o-mini';

        if (!apiKey) {
            throw new Error('Please configure your ChatGPT API key in Settings');
        }

        // Get smart system instructions
        let systemMessage = window.AIProvider ? window.AIProvider.getSystemInstruction(context) : 'You are a helpful financial assistant.';
        let userMessage = prompt;

        if (context) {
            // Use compact text formatting (saves ~30% tokens vs pretty JSON)
            const ctxText = window.AIProvider && window.AIProvider.formatContextText
                ? window.AIProvider.formatContextText(context)
                : JSON.stringify(context);
            systemMessage += '\n\nContext Data:\n' + ctxText;
            userMessage = `User Query: ${prompt}\n\nProvide helpful insights based on the context data provided in the system message.`;
        }

        const requestBody = {
            model: model,
            messages: [
                {
                    role: 'system',
                    content: systemMessage
                },
                {
                    role: 'user',
                    content: userMessage
                }
            ]
        };

        // Schema-constrained JSON output. gpt-4o-mini (and later) supports strict
        // mode, which guarantees the response parses against the schema.
        if (options.jsonSchema && window.AIProvider && window.AIProvider.buildOpenAIResponseFormat) {
            const rf = window.AIProvider.buildOpenAIResponseFormat(options.jsonSchema, { strict: true });
            if (rf) requestBody.response_format = rf;
        }

        const response = await window.AIProvider.fetchWithTimeout(this.API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const errorMsg = error.error?.message || 'API request failed';
            throw new Error(`ChatGPT (${model}): ${errorMsg}`);
        }

        const data = await response.json();
        if (window.AIProvider && window.AIProvider.logCacheUsage) {
            window.AIProvider.logCacheUsage(`ChatGPT (${model})`, data);
        }
        // Guard against malformed responses instead of throwing a raw TypeError.
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.trim() === '') {
            throw new Error(`ChatGPT (${model}): empty or malformed response`);
        }
        return content;
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.ChatGPT = ChatGPT;
}

