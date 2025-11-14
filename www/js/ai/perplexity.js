/**
 * Perplexity AI Integration
 * Handles communication with Perplexity API
 */

const Perplexity = {
    API_ENDPOINT: 'https://api.perplexity.ai/chat/completions',

    /**
     * Call Perplexity API
     */
    async call(prompt, context = null) {
        const apiKey = window.DB.settings.perplexityApiKey;
        
        if (!apiKey) {
            throw new Error('Please configure your Perplexity API key in Settings');
        }
        
        let fullPrompt = prompt;
        if (context) {
            fullPrompt = `Context:\n${JSON.stringify(context, null, 2)}\n\nUser Query: ${prompt}\n\nProvide helpful insights based on the context.`;
        }
        
        const response = await fetch(this.API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.1-sonar-large-128k-online',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a financial advisor specializing in credit card recommendations in India. Use your online search capability to find current, accurate information about credit card benefits, rewards, cashback rates, and promotional offers from official bank websites (HDFC, ICICI, SBI, Axis, AMEX, etc.). Provide specific recommendations with sources and links. NEVER ask for or reference sensitive card information like card numbers, CVV, or expiry dates - only work with card names.'
                    },
                    {
                        role: 'user',
                        content: fullPrompt
                    }
                ],
                search_domain_filter: ['hdfc.com', 'icicibank.com', 'sbi.co.in', 'axisbank.com', 'americanexpress.com'],
                return_citations: true,
                return_images: false
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Perplexity request failed');
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Perplexity = Perplexity;
}

