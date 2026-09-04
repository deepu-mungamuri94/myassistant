/**
 * Google Gemini AI Integration
 * Handles communication with Gemini API
 */

const GeminiAI = {
    /**
     * Call Gemini AI API
     */
    async call(prompt, context = null, options = {}) {
        const apiKey = window.DB.settings.geminiApiKey;
        const model = window.DB.settings.geminiModel || 'gemini-2.5-flash-lite';

        if (!apiKey) {
            throw new Error('Please configure your Gemini API key in Settings');
        }

        const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        let fullPrompt = prompt;
        let systemInstruction = window.AIProvider.getSystemInstruction(context);

        // Check if context has system_instruction (for CardAdvisor-style prompts)
        if (context && context.system_instruction) {
            systemInstruction = context.system_instruction;
            context = null; // Don't include in prompt
        } else if (context) {
            fullPrompt = this.formatPromptWithContext(prompt, context);
        }

        const payload = {
            contents: [{
                parts: [{ text: fullPrompt }]
            }],
            systemInstruction: {
                parts: [{
                    text: systemInstruction
                }]
            }
        };

        // Schema-constrained JSON output. Gemini uses its own generationConfig
        // (responseMimeType + responseSchema, OpenAPI-subset dialect) rather than
        // the OpenAI-style response_format. IMPORTANT: on 2.5 models structured
        // output and the google_search tool are mutually exclusive, so when a
        // schema is requested we do NOT attach the search tool below.
        const wantsSchema = !!(options.jsonSchema && options.jsonSchema.schema);
        if (wantsSchema) {
            payload.generationConfig = {
                responseMimeType: 'application/json',
                responseSchema: options.jsonSchema.schema
            };
        }

        // Add Google Search tool for comprehensive data fetching — but never
        // together with a response schema (unsupported on 2.5-series models).
        if (!wantsSchema && (systemInstruction.includes('Search') || systemInstruction.includes('official'))) {
            payload.tools = [{ "google_search": {} }];
        }
        
        // Key is passed as a query param (not an x-goog-api-key header): the app
        // calls Gemini via the WebView's fetch (CapacitorHttp is not enabled), so
        // a custom header triggers a CORS preflight that fails ("Failed to fetch").
        // In a native app the URL isn't shared with browser history/referrers, so
        // the query-param approach is safe here.
        const response = await window.AIProvider.fetchWithTimeout(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const errorMsg = error.error?.message || 'AI request failed';
            throw new Error(`Gemini (${model}): ${errorMsg}`);
        }

        const data = await response.json();
        if (window.AIProvider && window.AIProvider.logCacheUsage) {
            window.AIProvider.logCacheUsage(`Gemini (${model})`, data);
        }
        // Guard against malformed / safety-blocked responses (no candidates,
        // or a candidate with no text part) instead of throwing a raw TypeError.
        // Join across ALL parts: with google_search grounding the answer can be
        // split over multiple parts (or parts[0] can be a non-text grounding
        // part), so reading only parts[0].text would wrongly look empty.
        const parts = data?.candidates?.[0]?.content?.parts;
        const text = Array.isArray(parts)
            ? parts.map(p => (typeof p?.text === 'string' ? p.text : '')).join('')
            : undefined;
        if (typeof text !== 'string' || text.trim() === '') {
            const blockReason = data?.promptFeedback?.blockReason
                || data?.candidates?.[0]?.finishReason
                || 'no content returned';
            throw new Error(`Gemini (${model}): empty or blocked response (${blockReason})`);
        }
        return text;
    },
    
    /**
     * Format prompt with context based on mode
     */
    formatPromptWithContext(prompt, context) {
        const mode = context.mode;
        delete context.mode; // Remove mode from data
        
        let formattedContext = '';
        
        if (mode === 'credit_cards') {
            const cards = (context.available_cards || []).map((c, i) => {
                const benefits = (c.benefits && c.benefits !== 'Benefits not yet fetched')
                    ? c.benefits
                    : '(benefits not yet fetched)';
                return `${i + 1}. ${c.name}\n${benefits}`;
            }).join('\n\n');
            formattedContext = `MY CREDIT CARDS (${(context.available_cards || []).length}):\n${cards}`;
        } else if (mode === 'expenses') {
            formattedContext = `EXPENSE DATA (${context.expenses.length} transactions, Total: ₹${context.total.toFixed(2)}):\n${JSON.stringify(context.expenses, null, 2)}`;
        } else if (mode === 'investments') {
            formattedContext = `INVESTMENT PORTFOLIO (${context.investments.length} items, Total: ₹${context.total.toFixed(2)}, Exchange Rate: ₹${context.exchangeRate}):\n${JSON.stringify(context.investments, null, 2)}`;
        }
        
        return `${formattedContext}\n\nUSER QUERY: ${prompt}`;
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.GeminiAI = GeminiAI;
}

