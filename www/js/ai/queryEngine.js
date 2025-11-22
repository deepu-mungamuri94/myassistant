/**
 * AI Query Engine
 * Handles two-phase AI queries with metadata and safe query execution
 */

const QueryEngine = {
    // Session tracking for metadata caching
    currentSession: {
        mode: null,
        metadataSent: false,
        conversationId: null
    },

    /**
     * Generate metadata for expenses
     */
    generateExpensesMetadata() {
        const expenses = window.DB.expenses || [];
        
        if (expenses.length === 0) {
            return {
                mode: 'expenses',
                totalRecords: 0,
                message: 'No expenses data available'
            };
        }

        // Get unique categories
        const categories = [...new Set(expenses.map(e => e.category).filter(Boolean))];
        
        // Get date range
        const dates = expenses.map(e => new Date(e.date)).filter(d => !isNaN(d));
        const minDate = dates.length > 0 ? new Date(Math.min(...dates)) : null;
        const maxDate = dates.length > 0 ? new Date(Math.max(...dates)) : null;
        
        // Get amount range
        const amounts = expenses.map(e => parseFloat(e.amount)).filter(a => !isNaN(a));
        const minAmount = amounts.length > 0 ? Math.min(...amounts) : 0;
        const maxAmount = amounts.length > 0 ? Math.max(...amounts) : 0;
        
        // Sample expense for structure reference
        const sampleExpense = expenses[0];
        
        return {
            mode: 'expenses',
            schema: {
                fields: [
                    { name: 'id', type: 'number', description: 'Unique expense ID' },
                    { name: 'title', type: 'string', description: 'Expense title/name' },
                    { name: 'description', type: 'string', description: 'Additional details (optional)' },
                    { name: 'amount', type: 'number', description: 'Expense amount in INR' },
                    { name: 'category', type: 'string', description: 'Expense category', values: categories },
                    { name: 'date', type: 'string', description: 'Expense date (YYYY-MM-DD format)' },
                    { name: 'createdAt', type: 'number', description: 'Timestamp when expense was added' },
                    { name: 'suggestedCard', type: 'string', description: 'Suggested card for this expense (optional)' },
                    { name: 'recurringId', type: 'number', description: 'Link to recurring expense (optional)' }
                ],
                availableCategories: categories,
                sampleStructure: {
                    id: sampleExpense.id,
                    title: 'string (e.g., "Grocery Shopping")',
                    amount: 'number (e.g., 5000)',
                    category: `string (one of: ${categories.join(', ')})`,
                    date: 'string (e.g., "2024-11-22")'
                }
            },
            statistics: {
                totalRecords: expenses.length,
                dateRange: {
                    min: minDate ? minDate.toISOString().split('T')[0] : null,
                    max: maxDate ? maxDate.toISOString().split('T')[0] : null
                },
                amountRange: {
                    min: Math.round(minAmount),
                    max: Math.round(maxAmount)
                },
                totalAmount: expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
            },
            queryInstructions: `
To query expenses data, return a JSON object with this structure:
{
  "operation": "filter",
  "filterCode": "e => e.category === 'Groceries' && new Date(e.date).getMonth() === 10",
  "aggregation": "sum" | "count" | "average" | "group" | "none",
  "aggregationField": "amount" | "id" | null,
  "groupBy": "category" | "month" | "year" | null,
  "explanation": "Human-readable explanation of what the query does"
}

Examples:
1. Total groceries in November 2024:
   { "operation": "filter", "filterCode": "e => e.category === 'Groceries' && new Date(e.date).getMonth() === 10 && new Date(e.date).getFullYear() === 2024", "aggregation": "sum", "aggregationField": "amount" }

2. Count expenses by category:
   { "operation": "filter", "filterCode": "e => true", "aggregation": "group", "groupBy": "category", "aggregationField": "amount" }

3. Expenses above ₹5000:
   { "operation": "filter", "filterCode": "e => e.amount > 5000", "aggregation": "none" }

Important:
- Use JavaScript arrow function syntax
- Access fields as e.fieldName (e.g., e.amount, e.category)
- For dates, use new Date(e.date)
- Month is 0-indexed (Jan=0, Dec=11)
- Return ONLY valid JavaScript that works with Array.filter()
`
        };
    },

    /**
     * Generate metadata for investments
     */
    generateInvestmentsMetadata() {
        const investments = window.DB.portfolioInvestments || [];
        
        if (investments.length === 0) {
            return {
                mode: 'investments',
                totalRecords: 0,
                message: 'No investments data available'
            };
        }

        // Get unique types, goals, and currencies
        const types = [...new Set(investments.map(i => i.type).filter(Boolean))];
        const goals = [...new Set(investments.map(i => i.goal).filter(Boolean))];
        const currencies = [...new Set(investments.map(i => i.currency).filter(Boolean))];
        
        // Get amount range
        const amounts = investments.map(i => parseFloat(i.amount)).filter(a => !isNaN(a));
        const minAmount = amounts.length > 0 ? Math.min(...amounts) : 0;
        const maxAmount = amounts.length > 0 ? Math.max(...amounts) : 0;
        
        // Sample investment
        const sampleInvestment = investments[0];
        
        return {
            mode: 'investments',
            schema: {
                fields: [
                    { name: 'id', type: 'number', description: 'Unique investment ID' },
                    { name: 'name', type: 'string', description: 'Investment name (e.g., "Apple", "ICICI FD")' },
                    { name: 'type', type: 'string', description: 'Investment type (SHARES, GOLD, FD, EPF)', values: types },
                    { name: 'goal', type: 'string', description: 'Investment goal/term (SHORT_TERM or LONG_TERM)', values: goals },
                    { name: 'amount', type: 'number', description: 'Total investment amount in INR' },
                    { name: 'quantity', type: 'number', description: 'Quantity (for SHARES/GOLD)' },
                    { name: 'price', type: 'number', description: 'Unit price (for SHARES/GOLD)' },
                    { name: 'currency', type: 'string', description: 'Currency (INR or USD)', values: currencies },
                    { name: 'description', type: 'string', description: 'Additional notes (optional)' },
                    { name: 'createdAt', type: 'number', description: 'Timestamp when added' },
                    { name: 'lastUpdated', type: 'number', description: 'Last update timestamp' }
                ],
                availableTypes: types,
                availableGoals: goals,
                availableCurrencies: currencies,
                sampleStructure: {
                    id: sampleInvestment.id,
                    name: 'string (e.g., "Apple", "ICICI FD")',
                    type: `string (one of: ${types.join(', ')})`,
                    goal: `string (one of: ${goals.join(', ')})`,
                    amount: 'number (e.g., 50000)',
                    currency: `string (one of: ${currencies.join(', ')})`
                }
            },
            statistics: {
                totalRecords: investments.length,
                amountRange: {
                    min: Math.round(minAmount),
                    max: Math.round(maxAmount)
                },
                totalPortfolioValue: investments.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0),
                exchangeRate: window.DB.exchangeRate?.rate || window.DB.exchangeRate || 83
            },
            queryInstructions: `
To query investments data, return a JSON object with this structure:
{
  "operation": "filter",
  "filterCode": "i => i.type === 'SHARES' && i.goal === 'LONG_TERM'",
  "aggregation": "sum" | "count" | "average" | "group" | "none",
  "aggregationField": "amount" | "quantity" | null,
  "groupBy": "type" | "goal" | "currency" | null,
  "explanation": "Human-readable explanation of what the query does"
}

IMPORTANT - Field Clarifications:
- "type" field contains: SHARES, GOLD, FD (Fixed Deposit), EPF (Employee Provident Fund)
- "goal" field contains: SHORT_TERM, LONG_TERM (NOT in type field!)
- Always use i.goal for SHORT_TERM/LONG_TERM, NOT i.type

Examples:
1. Total long-term investments:
   { "operation": "filter", "filterCode": "i => i.goal === 'LONG_TERM'", "aggregation": "sum", "aggregationField": "amount" }

2. All stock investments (shares):
   { "operation": "filter", "filterCode": "i => i.type === 'SHARES'", "aggregation": "none" }

3. Short-term fixed deposits:
   { "operation": "filter", "filterCode": "i => i.type === 'FD' && i.goal === 'SHORT_TERM'", "aggregation": "sum", "aggregationField": "amount" }

4. Count investments by type:
   { "operation": "filter", "filterCode": "i => true", "aggregation": "group", "groupBy": "type", "aggregationField": "amount" }

5. USD investments:
   { "operation": "filter", "filterCode": "i => i.currency === 'USD'", "aggregation": "none" }

Important:
- Use JavaScript arrow function syntax
- Access fields as i.fieldName (e.g., i.amount, i.type, i.goal)
- Use i.goal for SHORT_TERM/LONG_TERM (not i.term or i.type!)
- Use i.type for SHARES/GOLD/FD/EPF
- Return ONLY valid JavaScript that works with Array.filter()
- For USD to INR conversion, use exchangeRate: ${window.DB.exchangeRate?.rate || window.DB.exchangeRate || 83}
`
        };
    },

    /**
     * Start a new session for a mode
     */
    startSession(mode) {
        if (this.currentSession.mode !== mode) {
            this.currentSession = {
                mode: mode,
                metadataSent: false,
                conversationId: Date.now()
            };
        }
    },

    /**
     * Check if metadata needs to be sent
     */
    needsMetadata(mode) {
        return this.currentSession.mode !== mode || !this.currentSession.metadataSent;
    },

    /**
     * Mark metadata as sent for current session
     */
    markMetadataSent() {
        this.currentSession.metadataSent = true;
    },

    /**
     * Validate and sanitize query code
     */
    validateQueryCode(code) {
        // Dangerous patterns to block
        const dangerousPatterns = [
            /eval\s*\(/gi,
            /Function\s*\(/gi,
            /window\./gi,
            /document\./gi,
            /localStorage/gi,
            /sessionStorage/gi,
            /fetch\s*\(/gi,
            /XMLHttpRequest/gi,
            /import\s+/gi,
            /require\s*\(/gi,
            /process\./gi,
            /__proto__/gi
            // Removed 'constructor' and 'prototype' as they might appear in legitimate code
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(code)) {
                throw new Error(`Query contains forbidden pattern: ${pattern.source}`);
            }
        }

        // Allow arrow functions, simple conditions, or booleans
        // Arrow functions include '=>', or it could be a simple expression
        return true;
    },

    /**
     * Execute a filter query safely
     */
    executeQuery(queryObj, mode) {
        try {
            // Get data based on mode
            let data;
            let itemName;
            
            if (mode === 'expenses') {
                data = window.DB.expenses || [];
                itemName = 'e';
            } else if (mode === 'investments') {
                data = window.DB.portfolioInvestments || [];
                itemName = 'i';
            } else {
                throw new Error(`Unsupported mode: ${mode}`);
            }

            // Validate filter code
            this.validateQueryCode(queryObj.filterCode);

            // Create filter function safely
            let filterFn;
            const code = queryObj.filterCode.trim();
            
            // Check if code already has arrow function
            if (code.includes('=>')) {
                // Code is already a complete arrow function like "e => e.amount > 1000"
                console.log(`📝 Using complete arrow function: ${code}`);
                try {
                    // Create a function that returns the arrow function, then call it
                    filterFn = new Function(`return (${code})`)();
                } catch (syntaxError) {
                    console.error('❌ Syntax error with arrow function:', syntaxError);
                    console.error('   Code:', code);
                    throw new Error(`Invalid filter code syntax: ${syntaxError.message}`);
                }
            } else {
                // Code is just the condition like "amount > 1000", wrap it
                console.log(`📝 Creating filter function: ${itemName} => ${code}`);
                try {
                    filterFn = new Function(itemName, `return ${code}`);
                } catch (syntaxError) {
                    console.error('❌ Syntax error creating filter function:', syntaxError);
                    console.error('   Attempted code:', `${itemName} => ${code}`);
                    
                    // Try one more time with parentheses around the code
                    try {
                        filterFn = new Function(itemName, `return (${code})`);
                        console.log('✅ Fixed by adding parentheses');
                    } catch (secondError) {
                        throw new Error(`Invalid filter code syntax: ${syntaxError.message}`);
                    }
                }
            }
            
            // Execute filter
            const filtered = data.filter(item => {
                try {
                    return filterFn(item);
                } catch (e) {
                    console.error('Filter execution error:', e);
                    return false;
                }
            });

            // Apply aggregation
            let result;
            
            if (queryObj.aggregation === 'sum' && queryObj.aggregationField) {
                result = {
                    type: 'sum',
                    field: queryObj.aggregationField,
                    value: filtered.reduce((sum, item) => sum + (parseFloat(item[queryObj.aggregationField]) || 0), 0),
                    count: filtered.length
                };
            } else if (queryObj.aggregation === 'count') {
                result = {
                    type: 'count',
                    value: filtered.length
                };
            } else if (queryObj.aggregation === 'average' && queryObj.aggregationField) {
                const sum = filtered.reduce((s, item) => s + (parseFloat(item[queryObj.aggregationField]) || 0), 0);
                result = {
                    type: 'average',
                    field: queryObj.aggregationField,
                    value: filtered.length > 0 ? sum / filtered.length : 0,
                    count: filtered.length
                };
            } else if (queryObj.aggregation === 'group' && queryObj.groupBy) {
                const grouped = {};
                filtered.forEach(item => {
                    let key = item[queryObj.groupBy];
                    
                    // Handle date grouping
                    if (queryObj.groupBy === 'month' || queryObj.groupBy === 'year') {
                        const date = new Date(item.date || item.createdAt);
                        if (queryObj.groupBy === 'month') {
                            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                        } else {
                            key = date.getFullYear().toString();
                        }
                    }
                    
                    if (!grouped[key]) {
                        grouped[key] = { items: [], sum: 0, count: 0 };
                    }
                    
                    grouped[key].items.push(item);
                    grouped[key].count++;
                    
                    if (queryObj.aggregationField) {
                        grouped[key].sum += parseFloat(item[queryObj.aggregationField]) || 0;
                    }
                });
                
                result = {
                    type: 'group',
                    groupBy: queryObj.groupBy,
                    groups: grouped
                };
            } else {
                // No aggregation - return filtered data
                result = {
                    type: 'data',
                    data: filtered,
                    count: filtered.length
                };
            }

            return {
                success: true,
                result: result,
                explanation: queryObj.explanation || 'Query executed successfully'
            };
            
        } catch (error) {
            console.error('Query execution error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * Try to auto-correct common query errors
     */
    autoCorrectQuery(queryCode) {
        let corrected = queryCode.trim();
        
        // Remove code block markers if present
        corrected = corrected.replace(/^```javascript\s*/gi, '');
        corrected = corrected.replace(/^```js\s*/gi, '');
        corrected = corrected.replace(/\s*```$/g, '');
        
        // Remove 'return' keyword if present (not needed in arrow functions)
        if (corrected.startsWith('return ')) {
            corrected = corrected.replace(/^return\s+/, '');
        }
        
        // Ensure it's an arrow function (only if it doesn't already have one)
        if (!corrected.includes('=>')) {
            // If it's just a condition like "e.amount > 1000", wrap it
            if (!corrected.includes('function')) {
                const varName = corrected.startsWith('e.') || corrected.includes(' e.') ? 'e' : 'i';
                corrected = `${varName} => ${corrected}`;
            }
        }
        
        // Common corrections (IMPORTANT: Do these BEFORE adding arrow functions to avoid double-wrapping)
        // Fix equality operators - but only if not already strict
        corrected = corrected.replace(/([^=!])={2}([^=])/g, '$1===$2'); // == -> === (but not === or !==)
        corrected = corrected.replace(/([^!])!={1}([^=])/g, '$1!==$2'); // != -> !== (but not !==)
        
        // Fix date field access
        corrected = corrected.replace(/e\.month/gi, 'new Date(e.date).getMonth()'); // Month access
        corrected = corrected.replace(/e\.year/gi, 'new Date(e.date).getFullYear()'); // Year access
        corrected = corrected.replace(/i\.month/gi, 'new Date(i.createdAt).getMonth()'); // Month access for investments
        corrected = corrected.replace(/i\.year/gi, 'new Date(i.createdAt).getFullYear()'); // Year access for investments
        
        // Fix investment field names (common mistakes)
        corrected = corrected.replace(/i\.term/gi, 'i.goal'); // "term" should be "goal"
        
        // Fix const/let declarations inside arrow functions
        // e.g., "e => const date = new Date(e.date)" -> "e => { const date = new Date(e.date); ... }"
        if (corrected.includes('=>') && (corrected.includes('const ') || corrected.includes('let ') || corrected.includes('var '))) {
            // Already has variable declarations, might need curly braces
            const arrowIndex = corrected.indexOf('=>');
            const afterArrow = corrected.substring(arrowIndex + 2).trim();
            
            // If it doesn't start with {, wrap it
            if (!afterArrow.startsWith('{')) {
                const beforeArrow = corrected.substring(0, arrowIndex + 2);
                corrected = `${beforeArrow} { ${afterArrow} }`;
            }
        }
        
        return corrected;
    },

    /**
     * Parse AI response to extract query
     */
    parseAIQuery(aiResponse) {
        try {
            // Try to find JSON in response
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const queryObj = JSON.parse(jsonMatch[0]);
                
                console.log('🔍 Raw query from AI:', queryObj);
                
                // Auto-correct if needed
                if (queryObj.filterCode) {
                    const original = queryObj.filterCode;
                    queryObj.filterCode = this.autoCorrectQuery(queryObj.filterCode);
                    if (original !== queryObj.filterCode) {
                        console.log('✏️ Auto-corrected query:', { original, corrected: queryObj.filterCode });
                    }
                }
                
                return queryObj;
            }
            
            throw new Error('No valid query JSON found in AI response');
        } catch (error) {
            console.error('Failed to parse AI query:', error);
            console.error('AI Response was:', aiResponse);
            return null;
        }
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.QueryEngine = QueryEngine;
}

