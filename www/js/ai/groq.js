/**
 * Groq AI Provider
 * Uses Llama 3.3 70B Versatile model for fast, efficient AI responses
 * Groq offers high rate limits and low latency
 */

const GroqAI = {
    name: 'Groq',
    
    /**
     * Call Groq API with Llama 3.3 70B model
     * @param {string} userMessage - The user's question/prompt
     * @param {string} systemInstructions - System instructions for the AI
     * @param {Array} conversationHistory - Previous messages for context
     * @returns {Promise<string>} - AI response text
     */
    async call(userMessage, systemInstructions = '', conversationHistory = []) {
        const apiKey = window.DB.groqApiKey;
        const model = window.DB.settings.groqModel || 'llama-3.3-70b-versatile';
        
        if (!apiKey) {
            throw new Error('Groq API key not configured. Please add it in Settings.');
        }
        
        try {
            // Get smart system instructions based on context
            let systemMessage = '';
            if (typeof systemInstructions === 'object' && systemInstructions !== null) {
                // Use common system instruction for this mode
                systemMessage = window.AIProvider.getSystemInstruction(systemInstructions);
                // Append context data
                systemMessage += '\n\nContext Data:\n' + JSON.stringify(systemInstructions, null, 2);
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
            
            console.log('🚀 Calling Groq API with Llama 3.3 70B...');
            
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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

