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
        // Pass rawHtml=true so the <span class="loading-dots"> survives the
        // formatAIResponse pipeline (which now escapes HTML for XSS safety).
        // Without this flag, the span gets escaped to literal text and the
        // two-phase query path can't find .loading-dots to update.
        const loadingId = 'loading-' + Date.now();
        this.addMessage('assistant', '<span class="loading-dots">Thinking</span>', loadingId, true);
        
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
        const dots1 = loading?.querySelector('.loading-dots');
        if (dots1) dots1.textContent = 'Analyzing query structure';
        
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
            const dots2 = loading?.querySelector('.loading-dots');
            if (dots2) dots2.textContent = 'Executing query on local data';
            
            // PHASE 2: Execute query locally
            const queryResult = window.QueryEngine.executeQuery(queryObj, mode);
            
            if (!queryResult.success) {
                throw new Error(`Query execution failed: ${queryResult.error}`);
            }
            
            console.log('✅ Query Result:', queryResult);
            
            // Update loading message
            const dots3 = loading?.querySelector('.loading-dots');
            if (dots3) dots3.textContent = 'Analyzing results';
            
            // PHASE 3: Send results to AI for analysis
            const phase2Prompt = this.buildPhase2Prompt(userQuery, queryResult, mode, metadataContext);
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
        const todayIso = new Date().toISOString().split('T')[0];
        return `Today's date: ${todayIso}. Use it to interpret relative phrases ("last month", "this quarter", "this year").

I have a ${datasetName} dataset with the following structure:

${JSON.stringify(metadataContext, null, 2)}

User Query: "${userQuery}"

Your task: Generate a JavaScript query to answer this question. ${metadataContext.queryInstructions}

Return ONLY a JSON object, no extra text or explanation outside the JSON.`;
    },

    /**
     * Build Phase 2 prompt (filtered data → analysis)
     */
    buildPhase2Prompt(userQuery, queryResult, mode, metadataContext) {
        const datasetName = mode === 'expenses' ? 'expenses' : 'investments';
        const isInvestments = mode === 'investments';
        const todayIso = new Date().toISOString().split('T')[0];
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

        // User profile snapshot (income / SIPs / plans) — helps AI ground % insights
        const snap = metadataContext && metadataContext.snapshot;
        let profileBlock = '';
        if (snap) {
            const profileLines = [];
            if (snap.avgMonthlyIncome > 0) {
                profileLines.push(`Avg monthly income (last 6 months): ₹${Utils.formatIndianNumber(snap.avgMonthlyIncome)}`);
            }
            if (snap.sipsMonthlyTotal > 0) {
                profileLines.push(`Active SIPs: ${snap.activeSips.length} totaling ₹${Utils.formatIndianNumber(snap.sipsMonthlyTotal)}/month`);
            }
            if (snap.pendingPlansTotal > 0) {
                profileLines.push(`Pending planned expenses: ${snap.pendingPlans.length} totaling ₹${Utils.formatIndianNumber(snap.pendingPlansTotal)}`);
            }
            if (profileLines.length > 0) {
                profileBlock = `\n\nUSER PROFILE:\n${profileLines.map(l => '  ' + l).join('\n')}`;
            }
        }

        // Feature-specific content the analysis must cover (investments vs expenses).
        const analysisGuidance = isInvestments
            ? `Cover, as relevant:
- **Asset allocation** — % split across types and any over-concentration.
- **Diversification gaps** — missing/under-weight asset classes.
- **Risk-reward** — equity vs. fixed-income balance for the goal.
- If income is in USER PROFILE, frame suggestions as "₹X/month = Y% of income".`
            : `Cover, as relevant:
- **Where the money went** — top categories/items with their share.
- **Trends/comparisons** — change vs. earlier periods if visible in the data.
- If income is in USER PROFILE, frame totals as a % of income (e.g. "₹6,000 = 12% of income").`;

        // Add explanation of what was queried if available
        const queryExplanation = queryResult.explanation ? `\n\nQuery executed: ${queryResult.explanation}` : '';
        const zeroResults = queryResult.result.count === 0 || queryResult.result.value === 0;

        // Shared house style (see also provider.js / dashboard.js). Keeps every
        // markdown AI surface consistent: emoji section headers, scannable
        // bullets, no tables, grounded numbers, a short action block. ₹ amounts
        // are auto-highlighted by AIRenderer, so we DON'T bold them (avoids
        // double-emphasis) — but we DO bold percentages and labels.
        return `Today's date: ${todayIso}.${profileBlock}

User asked: "${userQuery}"

I executed a query on my ${datasetName} database and got these results:

${resultSummary}${queryExplanation}

Write a clear analysis that directly answers the question, formatted for a mobile screen.

FORMAT:
- Group with \`###\` headers, each led by a relevant emoji. Put a blank line before every header.
- Bullet points only — NO tables, NO code blocks, NO LaTeX.
- Each bullet: one line, lead with a **bold label**, then the value/insight.
- **Bold all percentages.** Do NOT bold ₹ amounts (the app highlights them automatically). Use ₹ and Indian numbering (lakh/crore) as a gloss only — never replace an exact figure.
- ${analysisGuidance}
- End with a \`### 🎯 Next steps\` block: 1–3 concrete actions, each with a ₹ amount and a one-line why. Omit only if there's genuinely nothing actionable.

Use only figures present in the results above — never invent, round, or recompute totals. A value of ₹0 means zero, not missing.
${zeroResults ? `\nIMPORTANT: Zero results were found. Do NOT invent numbers. Tell the user honestly "No matching ${datasetName} found." Then suggest 2-3 alternative search terms, broader date ranges, or related categories they could try.` : ''}`;
    },

    /**
     * Add a message to the chat
     */
    addMessage(role, content, id = null, rawHtml = false) {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message p-2.5 rounded-lg mb-2 ${role === 'user' ? 'bg-blue-50 border border-blue-200 ml-8' : 'bg-gray-50 border border-gray-300 mr-8'}`;
        if (id) messageDiv.id = id;
        
        // Format assistant messages for better readability.
        // rawHtml=true bypasses formatting for trusted internal HTML
        // (e.g. the loading-dots bubble); never use it for AI output.
        let formattedContent;
        if (rawHtml) {
            formattedContent = content;
        } else if (role === 'assistant') {
            // Route AI markdown through the unified renderer; fall back to the
            // legacy formatter only if AIRenderer isn't loaded for some reason.
            formattedContent = window.AIRenderer
                ? window.AIRenderer.toHtml(content, { compact: true })
                : this.formatAIResponse(content);
        } else {
            formattedContent = Utils.escapeHtml(content);
        }
        
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
        
        const lines = text.split('\n');
        let html = '';
        let inList = false;
        let inRecommendation = false;
        let inCardComparison = false;
        let inCardSection = false; // Track if we're inside a card section
        let currentCardName = '';
        let cardNumber = 0;
        
        for (let line of lines) {
            const originalLine = line;
            line = line.trim();
            if (!line) {
                if (inList && !inCardComparison) {
                    html += '</ul></div>';
                    inList = false;
                }
                if (inRecommendation) {
                    html += '</div>';
                    inRecommendation = false;
                }
                continue;
            }
            
            // TOP 3 CARDS COMPARISON header
            if (line.match(/^📊\s*\*\*TOP\s*3\s*CARDS\s*COMPARISON\*\*/i) || line.match(/^TOP\s*3\s*CARDS\s*COMPARISON/i)) {
                if (inList) html += '</ul></div>';
                if (inRecommendation) html += '</div>';
                html += `<div class="mt-3 mb-2">
                    <div class="bg-gradient-to-r from-indigo-100 to-purple-100 border-2 border-indigo-300 px-3 py-2 rounded-lg">
                        <h3 class="font-bold text-indigo-900 text-sm flex items-center gap-2">
                            <span>📊</span>
                            <span>TOP 3 CARDS COMPARISON</span>
                        </h3>
                    </div>
                </div>`;
                inCardComparison = true;
                cardNumber = 0;
                continue;
            }
            
            // FINAL RECOMMENDATION header
            if (line.match(/^✅\s*\*\*FINAL\s*RECOMMENDATION\*\*/i) || line.match(/^FINAL\s*RECOMMENDATION/i)) {
                if (inList) html += '</ul></div>';
                if (inCardComparison) {
                    html += '</div>';
                    inCardComparison = false;
                }
                if (inRecommendation) html += '</div>';
                html += `<div class="mt-4 mb-2">
                    <div class="bg-gradient-to-r from-green-100 to-emerald-100 border-2 border-green-400 px-3 py-2 rounded-lg">
                        <h3 class="font-bold text-green-900 text-sm flex items-center gap-2">
                            <span>✅</span>
                            <span>FINAL RECOMMENDATION</span>
                        </h3>
                    </div>
                </div>`;
                inRecommendation = true;
                continue;
            }
            
            // Card name detection (lines starting with number + card name pattern, or bold card names)
            if (inCardComparison && (line.match(/^\d+\.\s*\*\*[^*]+\*\*/) || line.match(/^\*\*[^*]+\*\*$/))) {
                // Close previous card section if open
                if (inCardSection) {
                    if (inList) {
                        html += '</ul></div>';
                        inList = false;
                    }
                    html += '</div></div>'; // Close card content div and card div
                    inCardSection = false;
                }
                
                if (inList) {
                    html += '</ul></div>';
                    inList = false;
                }
                
                // Extract card name
                currentCardName = line.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').trim();
                cardNumber++;
                html += `<div class="mb-3 mt-3 bg-white border-2 border-indigo-200 rounded-lg p-3 shadow-sm">
                    <div class="flex items-center gap-2 mb-2 pb-2 border-b-2 border-indigo-100">
                        <span class="text-lg">💳</span>
                        <h4 class="font-bold text-indigo-900 text-sm">${Utils.escapeHtml(currentCardName)}</h4>
                    </div>
                    <div class="ml-7">`;
                inCardSection = true;
                continue;
            }
            
            // Close card comparison section if we hit final recommendation
            if (inCardComparison && (line.match(/^✅|FINAL/i))) {
                // Close current card section if open
                if (inCardSection) {
                    if (inList) {
                        html += '</ul></div>';
                        inList = false;
                    }
                    html += '</div></div>'; // Close card content div and card div
                    inCardSection = false;
                }
                if (inList) html += '</ul></div>';
                html += '</div>'; // Close card comparison container
                inCardComparison = false;
            }
            
            // Recommendation cards (RECOMMENDED: or USE:)
            if (line.match(/^(RECOMMENDED:|USE:|BEST CARD:|SUGGESTION:)/i)) {
                if (inList) {
                    html += '</ul></div>';
                    inList = false;
                }
                if (inCardComparison) {
                    html += '</div>';
                    inCardComparison = false;
                }
                if (inRecommendation) {
                    html += '</div>';
                }
                const cardName = line.replace(/^(RECOMMENDED:|USE:|BEST CARD:|SUGGESTION:)\s*/i, '');
                html += `<div class="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-300 rounded-lg p-3 mb-2">
                    <div class="flex items-center gap-2 mb-2 pb-2 border-b border-green-200">
                        <span class="text-lg">💳</span>
                        <span class="font-bold text-green-800 text-sm">${Utils.escapeHtml(cardName)}</span>
                    </div>
                    <div class="ml-7">`;
                inRecommendation = true;
                continue;
            }
            
            // Markdown headings (# ## ### ####)
            const markdownHeadingMatch = line.match(/^(#{1,4})\s+(.+)$/);
            if (markdownHeadingMatch) {
                if (inList) {
                    html += '</ul></div>';
                    inList = false;
                }
                const level = markdownHeadingMatch[1].length;
                let headingText = markdownHeadingMatch[2].replace(/\*\*/g, '').trim();
                headingText = Utils.escapeHtml(headingText);
                
                if (level === 1) {
                    // # Main heading - large prominent style
                    html += `<div class="mt-3 mb-2">
                        <div class="bg-gradient-to-r from-indigo-100 to-purple-100 border-2 border-indigo-300 px-3 py-2 rounded-lg">
                            <h2 class="font-bold text-indigo-900 text-sm">${headingText}</h2>
                        </div>
                    </div>`;
                } else if (level === 2) {
                    // ## Sub heading - medium style
                    html += `<div class="mt-2.5 mb-1.5">
                        <div class="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 px-2.5 py-1.5 rounded-lg">
                            <h3 class="font-bold text-indigo-800 text-xs">${headingText}</h3>
                        </div>
                    </div>`;
                } else if (level === 3) {
                    // ### Smaller sub heading
                    html += `<div class="mt-2 mb-1">
                        <h4 class="font-semibold text-indigo-700 text-xs border-b border-indigo-100 pb-1">${headingText}</h4>
                    </div>`;
                } else {
                    // #### Smallest heading
                    html += `<div class="mt-1.5 mb-1">
                        <h5 class="font-medium text-indigo-600 text-xs">${headingText}</h5>
                    </div>`;
                }
                continue;
            }
            
            // Section headers (ALL CAPS or ending with : and short)
            if (!inCardComparison && !inRecommendation && (line.match(/^[A-Z\s&]{8,}:?$/) || (line.endsWith(':') && line.length < 60 && line.length > 5 && line.split(' ').length <= 6))) {
                if (inList) {
                    html += '</ul></div>';
                    inList = false;
                }
                let headerText = line.replace(/:$/, '').replace(/\*\*/g, '');
                headerText = Utils.escapeHtml(headerText);
                html += `<div class="mt-2 mb-1.5">
                    <div class="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 px-2 py-1.5 rounded-lg">
                        <h3 class="font-bold text-indigo-800 text-xs uppercase tracking-wide">${headerText}</h3>
                    </div>
                </div>`;
                continue;
            }
            
            // List items with various formats
            if (line.match(/^[-*•►▪→]\s/) || line.match(/^\d+[\.)]\s/)) {
                if (!inList) {
                    html += '<div class="ml-1"><ul class="space-y-1.5">';
                    inList = true;
                }
                let content = line.replace(/^[-*•►▪→]\s/, '').replace(/^\d+[\.)]\s/, '').replace(/\*\*/g, '');
                
                // Check if it's a benefit line (has : in middle)
                if (content.includes(':') && content.indexOf(':') > 5 && content.indexOf(':') < content.length - 5) {
                    const parts = content.split(':');
                    let key = parts[0].trim();
                    let value = parts.slice(1).join(':').trim();
                    // Escape first, then highlight amounts
                    key = Utils.escapeHtml(key);
                    value = Utils.escapeHtml(value);
                    value = value.replace(/(₹[\d,]+)/g, '<span class="font-bold text-green-700">$1</span>');
                    html += `<li class="flex items-start gap-1.5 text-xs bg-gray-50 border border-gray-200 p-2 rounded">
                        <span class="text-indigo-600 flex-shrink-0 mt-0.5 text-xs">→</span>
                        <div class="flex-1">
                            <span class="font-semibold text-gray-800">${key}:</span>
                            <span class="text-gray-700 ml-1">${value}</span>
                        </div>
                    </li>`;
                } else {
                    // Escape first, then highlight amounts
                    content = Utils.escapeHtml(content);
                    content = content.replace(/(₹[\d,]+)/g, '<span class="font-bold text-green-700">$1</span>');
                    html += `<li class="flex items-start gap-1.5 text-xs bg-gray-50 border border-gray-200 p-2 rounded">
                        <span class="text-indigo-600 flex-shrink-0 mt-0.5 text-xs">→</span>
                        <span class="text-gray-700">${content}</span>
                    </li>`;
                }
                continue;
            }
            
            // Sub-headers
            if (line.endsWith(':') && !inCardComparison && !inRecommendation) {
                if (inList) {
                    html += '</ul></div>';
                    inList = false;
                }
                let subHeader = line.replace(/:$/, '').replace(/\*\*/g, '');
                subHeader = Utils.escapeHtml(subHeader);
                html += `<div class="mt-1.5 mb-1">
                    <h4 class="font-semibold text-indigo-700 text-xs">${subHeader}</h4>
                </div>`;
                continue;
            }
            
            // Regular paragraphs
            if (inList && !inCardComparison && !inRecommendation) {
                html += '</ul></div>';
                inList = false;
            }
            
            // Escape first, then highlight amounts in paragraphs
            let formattedLine = line.replace(/\*\*/g, '');
            formattedLine = Utils.escapeHtml(formattedLine);
            formattedLine = formattedLine.replace(/(₹[\d,]+)/g, '<span class="font-bold text-green-700">$1</span>');
            
            html += `<p class="text-xs text-gray-700 mb-1.5 leading-relaxed">${formattedLine}</p>`;
        }
        
        // Close any open card section
        if (inCardSection) {
            if (inList) {
                html += '</ul></div>';
                inList = false;
            }
            html += '</div></div>'; // Close card content div and card div
            inCardSection = false;
        }
        
        if (inList) {
            html += '</ul></div>';
        }
        if (inCardComparison) {
            html += '</div>'; // Close card comparison container
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
                            <li>• "₹5,000 on groceries at BigBasket"</li>
                            <li>• "₹10,000 for flight tickets"</li>
                            <li>• "₹2,000 dining at restaurants"</li>
                            <li>• "Best card for fuel?"</li>
                            <li>• "Best card for international travel?"</li>
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
                            <li>• "Last month's expense summary"</li>
                            <li>• "Category breakdown for this quarter"</li>
                            <li>• "Top 5 spending categories this year"</li>
                            <li>• "How much on pharmacy this month?"</li>
                            <li>• "Compare last 3 months spending"</li>
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
                            <li>• "Stocks vs FD vs Gold percentage"</li>
                            <li>• "Short-term vs long-term allocation"</li>
                            <li>• "What's missing in my portfolio?"</li>
                            <li>• "Are my SIPs enough for my income?"</li>
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
                    <p class="mb-2">Ask anything about Indian personal finance!</p>
                    <p class="text-xs mb-3 text-gray-400">Tax planning, investment math, calculations, and concepts.</p>

                    <div class="bg-green-50 p-3 rounded-lg text-left mb-3">
                        <p class="text-xs font-semibold text-green-800 mb-2">💡 Try asking:</p>
                        <ul class="text-xs space-y-1 text-green-700">
                            <li>• "Compound interest on ₹10L at 8% for 10 years"</li>
                            <li>• "Old vs New tax regime — which is better for me?"</li>
                            <li>• "ELSS vs PPF — pros and cons"</li>
                            <li>• "EMI for ₹50L home loan @ 9% for 20 years"</li>
                            <li>• "How much should I invest for ₹2Cr in 15 years?"</li>
                        </ul>
                    </div>

                    <p class="text-xs text-gray-400 mt-2">
                        🤖 General guidance — not professional tax/legal advice
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

