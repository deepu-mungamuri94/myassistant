/**
 * AI Advisor Module
 * Handles AI-powered credit card recommendations
 */

const Chat = {
    /**
     * Get current mode from dropdown
     */
    getCurrentMode() {
        const modeSelect = document.getElementById('chat-mode');
        return modeSelect ? modeSelect.value : 'cards';
    },
    
    /**
     * Send a chat message
     */
    async send() {
        const input = document.getElementById('chat-input');
        const message = input ? input.value.trim() : '';
        
        if (!message) return;
        
        const mode = this.getCurrentMode();
        
        // Validation based on mode
        if (mode === 'cards') {
            const creditCards = window.DB.cards.filter(c => !c.cardType || c.cardType === 'credit');
            if (!creditCards || creditCards.length === 0) {
                this.addMessage('assistant', `⚠️ **No Credit Cards Found**\n\nPlease add at least one credit card first to get personalized recommendations.\n\n📍 Go to Menu → Credit/Debit Cards → Add New`);
                if (input) input.value = '';
                return;
            }
        }
        
        if (mode === 'expenses' && (!window.DB.expenses || window.DB.expenses.length === 0)) {
            this.addMessage('assistant', `⚠️ **No Expenses Found**\n\nPlease add some expenses first to analyze your spending.\n\n📍 Go to Menu → Expenses → Add New`);
            if (input) input.value = '';
            return;
        }
        
        if (mode === 'investments' && (!window.DB.investments || window.DB.investments.length === 0)) {
            this.addMessage('assistant', `⚠️ **No Investments Found**\n\nPlease add some investments first to analyze your portfolio.\n\n📍 Go to Menu → Investments → Add New`);
            if (input) input.value = '';
            return;
        }
        
        // Add user message
        this.addMessage('user', message);
        if (input) input.value = '';
        
        // Add loading indicator
        const loadingId = 'loading-' + Date.now();
        this.addMessage('assistant', '<span class="loading-dots">Thinking</span>', loadingId);
        
        try {
            // Prepare context based on mode
            const context = window.AIProvider.prepareContext(mode);
            
            // Call AI
            const response = await window.AIProvider.call(message, context);
            
            // Remove loading, add response
            const loadingElement = document.getElementById(loadingId);
            if (loadingElement) loadingElement.remove();
            this.addMessage('assistant', response);
            
            // Save chat history
            window.DB.chatHistory.push(
                { role: 'user', content: message, timestamp: Date.now(), mode: mode },
                { role: 'assistant', content: response, timestamp: Date.now(), mode: mode }
            );
            window.Storage.save();
            
        } catch (error) {
            const loadingElement = document.getElementById(loadingId);
            if (loadingElement) loadingElement.remove();
            this.addMessage('assistant', `❌ Error: ${error.message}`);
            console.error('Chat error:', error);
        }
    },

    /**
     * Add a message to the chat
     */
    addMessage(role, content, id = null) {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message p-3 rounded-lg mb-2 ${role === 'user' ? 'bg-purple-100 ml-8' : 'bg-white border border-gray-200 mr-8 shadow-sm'}`;
        if (id) messageDiv.id = id;
        
        // Format assistant messages for better readability
        const formattedContent = role === 'assistant' ? this.formatAIResponse(content) : Utils.escapeHtml(content);
        
        messageDiv.innerHTML = `
            <div class="font-semibold text-sm mb-2 ${role === 'user' ? 'text-purple-700' : 'text-indigo-700'}">
                ${role === 'user' ? '👤 You' : '🤖 AI Assistant'}
            </div>
            <div class="text-gray-800">${formattedContent}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    },
    
    /**
     * Format AI response into beautiful, organized HTML
     */
    formatAIResponse(text) {
        if (!text) return '';
        
        // Remove markdown formatting
        text = text.replace(/\*\*/g, ''); // Remove bold **
        text = text.replace(/\*/g, ''); // Remove italic *
        text = text.replace(/#{1,6}\s/g, ''); // Remove headers #
        text = text.replace(/`/g, ''); // Remove code blocks
        
        const lines = text.split('\n');
        let html = '';
        let inList = false;
        let inRecommendation = false;
        
        for (let line of lines) {
            line = line.trim();
            if (!line) {
                if (inList) {
                    html += '</ul></div>';
                    inList = false;
                }
                if (inRecommendation) {
                    html += '</div>';
                    inRecommendation = false;
                }
                continue;
            }
            
            // Recommendation cards (RECOMMENDED: or USE:)
            if (line.match(/^(RECOMMENDED:|USE:|BEST CARD:|SUGGESTION:)/i)) {
                if (inList) {
                    html += '</ul></div>';
                    inList = false;
                }
                if (inRecommendation) {
                    html += '</div>';
                }
                const cardName = line.replace(/^(RECOMMENDED:|USE:|BEST CARD:|SUGGESTION:)\s*/i, '');
                html += `<div class="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-400 rounded-lg p-3 mb-3">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="text-2xl">💳</span>
                        <span class="font-bold text-green-800 text-base">${Utils.escapeHtml(cardName)}</span>
                    </div>`;
                inRecommendation = true;
                continue;
            }
            
            // Section headers (ALL CAPS or ending with : and short)
            if (line.match(/^[A-Z\s&]{8,}:?$/) || (line.endsWith(':') && line.length < 60 && line.length > 5 && line.split(' ').length <= 6)) {
                if (inList) {
                    html += '</ul></div>';
                    inList = false;
                }
                if (inRecommendation) {
                    html += '</div>';
                    inRecommendation = false;
                }
                const headerText = line.replace(/:$/, '');
                html += `<div class="mt-3 mb-2">
                    <div class="bg-gradient-to-r from-indigo-100 to-purple-100 px-3 py-2 rounded-lg">
                        <h3 class="font-bold text-indigo-800 text-sm uppercase tracking-wide">${Utils.escapeHtml(headerText)}</h3>
                    </div>
                </div>`;
                continue;
            }
            
            // List items with various formats
            if (line.match(/^[-*•►▪]\s/) || line.match(/^\d+[\.)]\s/)) {
                if (!inList) {
                    html += '<div class="ml-2"><ul class="space-y-2">';
                    inList = true;
                }
                let content = line.replace(/^[-*•►▪]\s/, '').replace(/^\d+[\.)]\s/, '');
                
                // Highlight card names or amounts
                content = content.replace(/(₹[\d,]+)/g, '<span class="font-bold text-green-700">$1</span>');
                
                // Check if it's a benefit line (has : in middle)
                if (content.includes(':') && content.indexOf(':') > 5 && content.indexOf(':') < content.length - 5) {
                    const parts = content.split(':');
                    const key = parts[0].trim();
                    const value = parts.slice(1).join(':').trim();
                    html += `<li class="flex items-start gap-2 text-sm bg-gray-50 p-2 rounded-lg">
                        <span class="text-indigo-600 flex-shrink-0 mt-0.5">✓</span>
                        <div class="flex-1">
                            <span class="font-semibold text-gray-800">${Utils.escapeHtml(key)}:</span>
                            <span class="text-gray-700 ml-1">${value}</span>
                        </div>
                    </li>`;
                } else {
                    html += `<li class="flex items-start gap-2 text-sm bg-gray-50 p-2 rounded-lg">
                        <span class="text-indigo-600 flex-shrink-0 mt-0.5">✓</span>
                        <span class="text-gray-700">${content}</span>
                    </li>`;
                }
                continue;
            }
            
            // Sub-headers
            if (line.endsWith(':')) {
                if (inList) {
                    html += '</ul></div>';
                    inList = false;
                }
                html += `<div class="mt-2 mb-1">
                    <h4 class="font-semibold text-indigo-700 text-sm">${Utils.escapeHtml(line)}</h4>
                </div>`;
                continue;
            }
            
            // Regular paragraphs
            if (inList) {
                html += '</ul></div>';
                inList = false;
            }
            
            // Highlight amounts and card names in paragraphs
            line = line.replace(/(₹[\d,]+)/g, '<span class="font-bold text-green-700">$1</span>');
            
            html += `<p class="text-sm text-gray-700 mb-2 leading-relaxed">${line}</p>`;
        }
        
        if (inList) {
            html += '</ul></div>';
        }
        if (inRecommendation) {
            html += '</div>';
        }
        
        return html || `<p class="text-sm text-gray-700">${Utils.escapeHtml(text)}</p>`;
    },

    /**
     * Update welcome message based on mode
     */
    updateWelcomeMessage() {
        const mode = this.getCurrentMode();
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;
        
        let welcomeHTML = '';
        
        if (mode === 'cards') {
            welcomeHTML = `
                <div class="text-center text-gray-500 text-sm px-4">
                    <p class="text-lg mb-3">💳 <strong>AI Credit Card Advisor</strong></p>
                    <p class="mb-2">I'll help you choose the best credit card for your spending!</p>
                    <p class="text-xs mb-3">Using stored card benefits for fast, accurate recommendations.</p>
                    
                    <div class="bg-blue-50 p-3 rounded-lg text-left mb-3">
                        <p class="text-xs font-semibold text-blue-800 mb-2">💡 Try asking:</p>
                        <ul class="text-xs space-y-1 text-blue-700">
                            <li>• "₹5000 on groceries at BigBasket"</li>
                            <li>• "₹10,000 for flight tickets"</li>
                            <li>• "₹2000 for dining at restaurants"</li>
                            <li>• "Best card for fuel purchases?"</li>
                        </ul>
                    </div>
                    
                    <p class="text-xs text-gray-400 mt-2">
                        🔒 Secure: Only card names are shared, never numbers or CVV
                    </p>
                </div>`;
        } else if (mode === 'expenses') {
            welcomeHTML = `
                <div class="text-center text-gray-500 text-sm px-4">
                    <p class="text-lg mb-3">📊 <strong>Expense Analyzer</strong></p>
                    <p class="mb-2">Ask me anything about your spending patterns!</p>
                    
                    <div class="bg-purple-50 p-3 rounded-lg text-left mb-3">
                        <p class="text-xs font-semibold text-purple-800 mb-2">💡 Try asking:</p>
                        <ul class="text-xs space-y-1 text-purple-700">
                            <li>• "November 2024 expense summary"</li>
                            <li>• "Category-wise breakdown for December"</li>
                            <li>• "Compare Q3 and Q4 spending"</li>
                            <li>• "Top 5 expense categories this year"</li>
                        </ul>
                    </div>
                    
                    <p class="text-xs text-gray-400 mt-2">
                        📈 Analyzing ${window.DB.expenses.length} transactions
                    </p>
                </div>`;
        } else if (mode === 'investments') {
            welcomeHTML = `
                <div class="text-center text-gray-500 text-sm px-4">
                    <p class="text-lg mb-3">💰 <strong>Investment Analyzer</strong></p>
                    <p class="mb-2">Get insights on your investment portfolio!</p>
                    
                    <div class="bg-yellow-50 p-3 rounded-lg text-left mb-3">
                        <p class="text-xs font-semibold text-yellow-800 mb-2">💡 Try asking:</p>
                        <ul class="text-xs space-y-1 text-yellow-700">
                            <li>• "Portfolio summary and allocation"</li>
                            <li>• "Stock vs long-term breakdown"</li>
                            <li>• "USD investments total value"</li>
                            <li>• "Diversification recommendations"</li>
                        </ul>
                    </div>
                    
                    <p class="text-xs text-gray-400 mt-2">
                        💼 Analyzing ${window.DB.investments.length} investments
                    </p>
                </div>`;
        }
        
        chatMessages.innerHTML = welcomeHTML;
    },
    
    /**
     * Clear chat history
     */
    clear() {
        this.updateWelcomeMessage();
        window.DB.chatHistory = [];
        window.Storage.save();
    },

    /**
     * Load chat history
     */
    loadHistory() {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;
        
        if (window.DB.chatHistory && window.DB.chatHistory.length > 0) {
            chatMessages.innerHTML = '';
            window.DB.chatHistory.forEach(msg => {
                this.addMessage(msg.role, msg.content);
            });
        }
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Chat = Chat;
}

