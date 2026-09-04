/**
 * Perplexity AI Integration
 * Handles communication with Perplexity API
 */

const Perplexity = {
    API_ENDPOINT: 'https://api.perplexity.ai/chat/completions',

    /**
     * Call Perplexity API
     */
    async call(prompt, context = null, options = {}) {
        const apiKey = window.DB.settings.perplexityApiKey;
        const model = window.DB.settings.perplexityModel || 'sonar-pro';

        if (!apiKey) {
            throw new Error('Please configure your Perplexity API key in Settings');
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
            ],
            search_domain_filter: ['hdfc.com', 'icicibank.com', 'sbi.co.in', 'axisbank.com', 'americanexpress.com'],
            return_citations: true,
            return_images: false
        };

        // Schema-constrained JSON output. Perplexity has no `strict` flag (optional
        // fields are expressed by omission from `required`), so build without it.
        // NOTE: the FIRST request with a brand-new schema can take 10–30s while
        // Perplexity compiles it, which may exceed the default 30s fetch timeout
        // and fall through to the next provider — subsequent calls with the same
        // schema are fast. To give that cold-start compile room to land, a schema
        // request uses a longer timeout (60s) instead of the default 30s.
        let timeoutMs;
        if (options.jsonSchema && window.AIProvider && window.AIProvider.buildOpenAIResponseFormat) {
            const rf = window.AIProvider.buildOpenAIResponseFormat(options.jsonSchema, { strict: false });
            if (rf) {
                requestBody.response_format = rf;
                timeoutMs = 60000; // schema-compile cold start can take 10–30s
            }
        }

        const response = await window.AIProvider.fetchWithTimeout(this.API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        }, timeoutMs); // undefined → fetchWithTimeout uses its REQUEST_TIMEOUT_MS default

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const errorMsg = error.error?.message || 'API request failed';
            throw new Error(`Perplexity (${model}): ${errorMsg}`);
        }

        const data = await response.json();
        // Guard against malformed responses instead of throwing a raw TypeError.
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.trim() === '') {
            throw new Error(`Perplexity (${model}): empty or malformed response`);
        }
        return content;
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Perplexity = Perplexity;
}

