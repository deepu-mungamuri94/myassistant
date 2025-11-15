/**
 * Groq AI Provider
 * Uses Mixtral-8x7b model for fast, efficient AI responses
 * Groq offers high rate limits and low latency
 */

const GroqAI = {
    name: 'Groq',
    
    /**
     * Call Groq API with Mixtral model
     * @param {string} userMessage - The user's question/prompt
     * @param {string} systemInstructions - System instructions for the AI
     * @param {Array} conversationHistory - Previous messages for context
     * @returns {Promise<string>} - AI response text
     */
    async call(userMessage, systemInstructions = '', conversationHistory = []) {
        const apiKey = window.DB.groqApiKey;
        
        if (!apiKey) {
            throw new Error('Groq API key not configured. Please add it in Settings.');
        }
        
        try {
            // Build messages array
            const messages = [];
            
            // Add system message if provided
            if (systemInstructions) {
                messages.push({
                    role: 'system',
                    content: systemInstructions
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
            
            console.log('🚀 Calling Groq API with Mixtral...');
            
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'mixtral-8x7b-32768', // Mixtral with 32K context window
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
                    throw new Error('RATE_LIMIT: Groq API rate limit exceeded');
                }
                
                throw new Error(errorData.error?.message || `Groq API error: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('✅ Groq API response received');
            
            if (!data.choices || data.choices.length === 0) {
                throw new Error('No response from Groq API');
            }
            
            return data.choices[0].message.content;
            
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

