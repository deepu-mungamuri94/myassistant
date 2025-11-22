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
        const sendButton = document.querySelector('#chat-view button[onclick="Chat.send()"]');
        const message = input ? input.value.trim() : '';
        
        if (!message) return;
        
        // Disable input and button while processing
        if (input) {
            input.disabled = true;
            input.classList.add('opacity-50', 'cursor-not-allowed');
        }
        if (sendButton) {
            sendButton.disabled = true;
            sendButton.classList.add('opacity-50', 'cursor-not-allowed');
        }
        
        const mode = this.getCurrentMode();
        
        // Validation based on mode
        if (mode === 'cards') {
            const creditCards = window.DB.cards.filter(c => !c.cardType || c.cardType === 'credit');
            if (!creditCards || creditCards.length === 0) {
                this.addMessage('assistant', `⚠️ **No Credit Cards Found**\n\nPlease add at least one credit card first to get personalized recommendations.\n\n📍 Go to Menu → Credit/Debit Cards → Add New`);
                if (input) {
                    input.value = '';
                    input.disabled = false;
                    input.classList.remove('opacity-50', 'cursor-not-allowed');
                }
                if (sendButton) {
                    sendButton.disabled = false;
                    sendButton.classList.remove('opacity-50', 'cursor-not-allowed');
                }
                return;
            }
        }
        
        if (mode === 'expenses' && (!window.DB.expenses || window.DB.expenses.length === 0)) {
            this.addMessage('assistant', `⚠️ **No Expenses Found**\n\nPlease add some expenses first to analyze your spending.\n\n📍 Go to Menu → Expenses → Add New`);
            if (input) {
                input.value = '';
                input.disabled = false;
                input.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            if (sendButton) {
                sendButton.disabled = false;
                sendButton.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            return;
        }
        
        if (mode === 'investments' && (!window.DB.portfolioInvestments || window.DB.portfolioInvestments.length === 0)) {
            this.addMessage('assistant', `⚠️ **No Investments Found**\n\nPlease add some investments first to analyze your portfolio.\n\n📍 Go to Menu → Investments → Add New`);
            if (input) {
                input.value = '';
                input.disabled = false;
                input.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            if (sendButton) {
                sendButton.disabled = false;
                sendButton.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            return;
        }
        
        // Add user message
        this.addMessage('user', message);
        if (input) input.value = '';
        
        // Add loading indicator
        const loadingId = 'loading-' + Date.now();
        this.addMessage('assistant', '<span class="loading-dots">Thinking</span>', loadingId);
        
        try {
            // Suppress AI provider info messages during chat (reduces UI clutter)
            const previousSuppressState = window.AIProvider.suppressInfoMessages;
            window.AIProvider.suppressInfoMessages = true;
            
            let response;
            
            try {
                // Use two-phase query for expenses and investments (large data)
                if (mode === 'expenses' || mode === 'investments') {
                    response = await this.executeTwoPhaseQuery(message, mode, loadingId);
                } else {
                    // Use traditional flow for cards and general (small data or web search needed)
                    const context = window.AIProvider.prepareContext(mode, false);
                    response = await window.AIProvider.call(message, context);
                }
            } finally {
                // Restore previous suppress state
                window.AIProvider.suppressInfoMessages = previousSuppressState;
            }
            
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
        } finally {
            // Re-enable input and button
            if (input) {
                input.disabled = false;
                input.classList.remove('opacity-50', 'cursor-not-allowed');
                input.focus();
            }
            if (sendButton) {
                sendButton.disabled = false;
                sendButton.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }
    },

    /**
     * Execute two-phase query for large datasets (expenses/investments)
     * Phase 1: Send metadata + query → AI returns filter code
     * Phase 2: Execute filter, send filtered data → AI returns analysis
     */
    async executeTwoPhaseQuery(userQuery, mode, loadingId) {
        // For chat, always send metadata with each query since they're independent questions
        // (unlike a conversation where context is maintained)
        const metadataContext = window.AIProvider.prepareContext(mode, true);
        
        // Update loading message
        const loading = document.getElementById(loadingId);
        if (loading) {
            loading.querySelector('.loading-dots').textContent = 'Analyzing query structure';
        }
        
        // Build phase 1 prompt (always includes metadata for chat)
        const phase1Prompt = this.buildPhase1Prompt(userQuery, mode, metadataContext);
        
        try {
            // Call AI to get query
            const aiQueryResponse = await window.AIProvider.call(phase1Prompt, null);
            
            // Parse query from AI response
            const queryObj = window.QueryEngine.parseAIQuery(aiQueryResponse);
            
            if (!queryObj) {
                throw new Error('Could not understand the query. Please try rephrasing your question.');
            }
            
            console.log('📊 Parsed Query:', queryObj);
            
            // Update loading message
            const loading = document.getElementById(loadingId);
            if (loading) {
                loading.querySelector('.loading-dots').textContent = 'Executing query on local data';
            }
            
            // PHASE 2: Execute query locally
            const queryResult = window.QueryEngine.executeQuery(queryObj, mode);
            
            if (!queryResult.success) {
                throw new Error(`Query execution failed: ${queryResult.error}`);
            }
            
            console.log('✅ Query Result:', queryResult);
            
            // Update loading message
            if (loading) {
                loading.querySelector('.loading-dots').textContent = 'Analyzing results';
            }
            
            // PHASE 3: Send results to AI for analysis
            const phase2Prompt = this.buildPhase2Prompt(userQuery, queryResult, mode);
            const finalResponse = await window.AIProvider.call(phase2Prompt, null);
            
            return finalResponse;
            
        } catch (error) {
            console.error('Two-phase query error:', error);
            
            // Fallback: If query fails, try with full data (legacy mode)
            console.warn('⚠️ Falling back to legacy mode with full data');
            const fullContext = window.AIProvider.prepareContext(mode, false);
            return await window.AIProvider.call(userQuery, fullContext);
        }
    },
    
    /**
     * Build Phase 1 prompt (metadata → query code)
     */
    buildPhase1Prompt(userQuery, mode, metadataContext) {
        // Always include full metadata for each query (chat queries are independent)
        const datasetName = mode === 'expenses' ? 'expenses' : 'investments';
        return `I have a ${datasetName} dataset with the following structure:

${JSON.stringify(metadataContext, null, 2)}

User Query: "${userQuery}"

Your task: Generate a JavaScript query to answer this question. ${metadataContext.queryInstructions}

Return ONLY a JSON object, no extra text or explanation outside the JSON.`;
    },
    
    /**
     * Build Phase 2 prompt (filtered data → analysis)
     */
    buildPhase2Prompt(userQuery, queryResult, mode) {
        const datasetName = mode === 'expenses' ? 'expenses' : 'investments';
        let resultSummary;
        
        if (queryResult.result.type === 'sum') {
            resultSummary = `Query returned ${queryResult.result.count} ${datasetName}.\nTotal ${queryResult.result.field}: ₹${Utils.formatIndianNumber(Math.round(queryResult.result.value))}`;
        } else if (queryResult.result.type === 'count') {
            resultSummary = `Query returned ${queryResult.result.value} ${datasetName}.`;
        } else if (queryResult.result.type === 'average') {
            resultSummary = `Query returned ${queryResult.result.count} ${datasetName}.\nAverage ${queryResult.result.field}: ₹${Utils.formatIndianNumber(Math.round(queryResult.result.value))}`;
        } else if (queryResult.result.type === 'group') {
            const groupSummary = Object.keys(queryResult.result.groups).map(key => {
                const group = queryResult.result.groups[key];
                return `  ${key}: ${group.count} items, Total: ₹${Utils.formatIndianNumber(Math.round(group.sum))}`;
            }).join('\n');
            resultSummary = `Query grouped by ${queryResult.result.groupBy}:\n${groupSummary}`;
        } else {
            // Return sample data (limit to 20 items)
            const sampleData = queryResult.result.data.slice(0, 20);
            resultSummary = `Query returned ${queryResult.result.count} ${datasetName}.\n\nSample data (first ${sampleData.length} items):\n${JSON.stringify(sampleData, null, 2)}`;
        }
        
        const isInvestments = mode === 'investments';
        const analysisGuidance = isInvestments 
            ? `

For portfolio analysis questions, provide:
- Asset allocation percentages and diversification analysis
- Specific gaps or over-concentration issues
- Concrete recommendations with amounts/percentages
- Risk-reward considerations
- Action steps for rebalancing if needed`
            : '';

        return `User asked: "${userQuery}"

I executed a query on my ${datasetName} database and got these results:

${resultSummary}

Please provide a clear, helpful analysis of these results that directly answers the user's question. Format your response with:
- Key insights and numbers (with percentages for ${isInvestments ? 'asset allocation' : 'spending patterns'})
- Breakdowns or comparisons if relevant
- Actionable recommendations if applicable${analysisGuidance}

Keep it concise and mobile-friendly. Use bullet points and clear sections.`;
    },

    /**
     * Add a message to the chat
     */
    addMessage(role, content, id = null) {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message p-2.5 rounded-lg mb-2 ${role === 'user' ? 'bg-blue-50 border border-blue-200 ml-8' : 'bg-gray-50 border border-gray-300 mr-8'}`;
        if (id) messageDiv.id = id;
        
        // Format assistant messages for better readability
        const formattedContent = role === 'assistant' ? this.formatAIResponse(content) : Utils.escapeHtml(content);
        
        messageDiv.innerHTML = `
            <div class="font-semibold text-xs mb-1.5 ${role === 'user' ? 'text-blue-700' : 'text-indigo-700'}">
                ${role === 'user' ? '👤 You' : '🤖 AI Assistant'}
            </div>
            <div class="text-xs text-gray-800 leading-relaxed">${formattedContent}</div>
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
                html += `<div class="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-300 rounded-lg p-2 mb-2">
                    <div class="flex items-center gap-1.5 mb-1">
                        <span class="text-lg">💳</span>
                        <span class="font-bold text-green-800 text-xs">${Utils.escapeHtml(cardName)}</span>
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
                html += `<div class="mt-2 mb-1.5">
                    <div class="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 px-2 py-1.5 rounded-lg">
                        <h3 class="font-bold text-indigo-800 text-xs uppercase tracking-wide">${Utils.escapeHtml(headerText)}</h3>
                    </div>
                </div>`;
                continue;
            }
            
            // List items with various formats
            if (line.match(/^[-*•►▪]\s/) || line.match(/^\d+[\.)]\s/)) {
                if (!inList) {
                    html += '<div class="ml-1"><ul class="space-y-1.5">';
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
                    html += `<li class="flex items-start gap-1.5 text-xs bg-white border border-gray-200 p-1.5 rounded">
                        <span class="text-indigo-600 flex-shrink-0 mt-0.5 text-xs">✓</span>
                        <div class="flex-1">
                            <span class="font-semibold text-gray-800">${Utils.escapeHtml(key)}:</span>
                            <span class="text-gray-700 ml-1">${value}</span>
                        </div>
                    </li>`;
                } else {
                    html += `<li class="flex items-start gap-1.5 text-xs bg-white border border-gray-200 p-1.5 rounded">
                        <span class="text-indigo-600 flex-shrink-0 mt-0.5 text-xs">✓</span>
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
                html += `<div class="mt-1.5 mb-1">
                    <h4 class="font-semibold text-indigo-700 text-xs">${Utils.escapeHtml(line)}</h4>
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
            
            html += `<p class="text-xs text-gray-700 mb-1.5 leading-relaxed">${line}</p>`;
        }
        
        if (inList) {
            html += '</ul></div>';
        }
        if (inRecommendation) {
            html += '</div>';
        }
        
        return html || `<p class="text-xs text-gray-700 leading-relaxed">${Utils.escapeHtml(text)}</p>`;
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
            const investmentCount = (window.DB.portfolioInvestments || []).length;
            welcomeHTML = `
                <div class="text-center text-gray-500 text-sm px-4">
                    <p class="text-lg mb-3">💰 <strong>Investment Portfolio Advisor</strong></p>
                    <p class="mb-2">Get insights, diversification analysis, and recommendations!</p>
                    
                    <div class="bg-yellow-50 p-3 rounded-lg text-left mb-3">
                        <p class="text-xs font-semibold text-yellow-800 mb-2">💡 Try asking:</p>
                        <ul class="text-xs space-y-1 text-yellow-700">
                            <li>• "How is my portfolio diversified?"</li>
                            <li>• "What percentage is in stocks vs fixed deposits?"</li>
                            <li>• "Show my short-term vs long-term allocation"</li>
                            <li>• "What am I missing in my portfolio?"</li>
                            <li>• "Give me diversification recommendations"</li>
                            <li>• "Is my portfolio too risky?"</li>
                        </ul>
                    </div>
                    
                    <p class="text-xs text-gray-400 mt-2">
                        💼 Analyzing ${investmentCount} investments
                    </p>
                </div>`;
        } else if (mode === 'general') {
            welcomeHTML = `
                <div class="text-center text-gray-500 text-sm px-4">
                    <p class="text-lg mb-3">💬 <strong>General Assistant</strong></p>
                    <p class="mb-2">I can help with general questions and tasks!</p>
                    <p class="text-xs mb-3 text-gray-400">Ask me anything - from calculations to general information.</p>
                    
                    <div class="bg-green-50 p-3 rounded-lg text-left mb-3">
                        <p class="text-xs font-semibold text-green-800 mb-2">💡 Try asking:</p>
                        <ul class="text-xs space-y-1 text-green-700">
                            <li>• "What's the compound interest on ₹10L at 8%?"</li>
                            <li>• "Convert 50 USD to INR"</li>
                            <li>• "Best tax saving strategies in India"</li>
                            <li>• "Explain SIP vs lump sum investing"</li>
                        </ul>
                    </div>
                    
                    <p class="text-xs text-gray-400 mt-2">
                        🤖 Powered by AI - Ask me anything!
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

