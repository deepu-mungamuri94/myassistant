/**
 * SMS Bills Module
 * Handles credit card bill extraction from SMS with security measures
 * 
 * Security Features:
 * - Data masking before AI processing
 * - Grounding validation after AI response
 * - No full card numbers sent to AI
 * - Amount validation against original SMS
 */

const SmsBills = {
    // Keywords to identify credit card statement/bill SMS
    // Bank-specific patterns in message body:
    // HDFC: "HDFC Bank Credit Card XX9205 Statement", "Total due:", "Pay by"
    // ICICI: "ICICI Bank Credit Card XX8008 Statement", "due by"
    // Axis: "Axis Bank Credit Card no.", "Statement", "Due on:", "Total amt:"
    // SBI: "SBI Credit Card ending", "E-statement", "Total Amt Due", "Payable by"
    // Must contain "Credit Card" AND a statement/bill keyword
    CREDIT_CARD_PATTERN: /credit\s*card/i,
    BILL_KEYWORDS: /(statement|e-statement|total due|total amt|amt due|payment due|due by|due on|payable by|amount due)/i,
    
    // Keywords to exclude (reminders, alerts, transactions)
    EXCLUDE_KEYWORDS: /(reminder|pay now to avoid|last date to pay|avoid late|payment received|thank you for|successfully paid|transaction alert|otp|one time password|spent|debited|credited|transaction of|withdrawn|transferred)/i,
    
    /**
     * Main entry point - Get bills for all cards or a specific card
     * @param {string|null} cardId - If provided, filter for this card only
     */
    async getBills(cardId = null) {
        try {
            // Step 1: Check and request SMS permission
            const hasPermission = await this.checkAndRequestPermission();
            if (!hasPermission) {
                throw new Error('SMS permission is required to get bills');
            }
            
            // Step 2: Read SMS from inbox
            Utils.showProgressModal('📱 Reading SMS...', true);
            const allSms = await this.readSmsInbox();
            
            if (!allSms || allSms.length === 0) {
                Utils.showProgressSuccess('No SMS messages found', true);
                return { success: true, billsAdded: 0 };
            }
            
            // Step 3: Filter bank SMS (statement/bill only)
            Utils.showProgressModal('🔍 Filtering bank messages...', true);
            let bankSms = this.filterBankStatementSms(allSms);
            console.log(`📱 Found ${bankSms.length} bank SMS out of ${allSms.length} total`);
            
            if (bankSms.length === 0) {
                Utils.showProgressSuccess('No bank bill SMS found in inbox', true);
                return { success: true, billsAdded: 0 };
            }
            
            // Step 4: If cardId provided, filter for that card's last 4 digits
            if (cardId) {
                const card = window.DB.cards.find(c => c.id === cardId);
                if (card && card.cardNumber) {
                    const last4 = card.cardNumber.slice(-4);
                    bankSms = bankSms.filter(sms => sms.body.includes(last4));
                    console.log(`🔍 Filtered to ${bankSms.length} SMS for card XX${last4}`);
                }
            }
            
            // Step 5: Remove already processed SMS
            const newSms = this.filterUnprocessedSms(bankSms);
            console.log(`📋 ${newSms.length} new SMS to process (${bankSms.length - newSms.length} already processed)`);
            
            if (newSms.length === 0) {
                Utils.showProgressSuccess('No new bill SMS found', true);
                return { success: true, billsAdded: 0 };
            }
            
            // Step 6: Sanitize SMS for AI (security)
            Utils.showProgressModal(`🤖 Processing ${newSms.length} bill(s)...`, true);
            const sanitizedSms = this.sanitizeForAI(newSms);
            
            // Step 7: Batch parse with AI
            const parsedBills = await this.batchParseWithAI(sanitizedSms);
            
            if (!parsedBills || parsedBills.length === 0) {
                Utils.showProgressSuccess('Could not parse any bills from SMS', true);
                return { success: true, billsAdded: 0 };
            }
            
            // Step 8: Ground/validate parsed bills against original SMS
            Utils.showProgressModal('✅ Validating bills...', true);
            const validatedBills = this.groundAndValidate(parsedBills, newSms);
            
            // Step 9: Link bills to cards or create placeholders
            const linkedBills = await this.linkBillsToCards(validatedBills, newSms);
            
            // Step 10: Save to database
            this.saveBills(linkedBills, newSms);
            
            Utils.showProgressSuccess(`✅ ${linkedBills.length} bill(s) synced!`, true);
            
            // Refresh cards UI
            if (window.Cards && window.Cards.render) {
                window.Cards.render();
            }
            
            return { success: true, billsAdded: linkedBills.length };
            
        } catch (error) {
            console.error('Error getting bills:', error);
            Utils.showProgressError(`❌ ${error.message || 'Failed to get bills'}`);
            return { success: false, error: error.message };
        }
    },
    
    /**
     * Check and request SMS permission
     */
    async checkAndRequestPermission() {
        try {
            // Check if running in Capacitor
            if (!window.Capacitor || !window.Capacitor.Plugins.SmsReader) {
                console.warn('SmsReader plugin not available (web environment)');
                // For web testing, return false
                return false;
            }
            
            const { SmsReader } = window.Capacitor.Plugins;
            
            // Check current permission status
            const checkResult = await SmsReader.checkPermission();
            if (checkResult.granted) {
                return true;
            }
            
            // Request permission
            const requestResult = await SmsReader.requestPermission();
            return requestResult.granted;
            
        } catch (error) {
            console.error('Permission check failed:', error);
            return false;
        }
    },
    
    /**
     * Read SMS from inbox via native plugin
     */
    async readSmsInbox() {
        try {
            if (!window.Capacitor || !window.Capacitor.Plugins.SmsReader) {
                throw new Error('SMS reading is only available on Android');
            }
            
            const { SmsReader } = window.Capacitor.Plugins;
            const result = await SmsReader.readInbox({ daysBack: 60 });
            
            return result.messages || [];
            
        } catch (error) {
            console.error('Failed to read SMS:', error);
            throw new Error('Failed to read SMS inbox');
        }
    },
    
    /**
     * Filter SMS to only bank statement/bill messages
     */
    filterBankStatementSms(smsList) {
        return smsList.filter(sms => {
            const body = sms.body || '';
            
            // Must contain "Credit Card" in message
            if (!this.CREDIT_CARD_PATTERN.test(body)) {
                return false;
            }
            
            // Must contain bill/statement keywords
            if (!this.BILL_KEYWORDS.test(body)) {
                return false;
            }
            
            // Must NOT be a reminder/alert/transaction
            if (this.EXCLUDE_KEYWORDS.test(body)) {
                return false;
            }
            
            return true;
        });
    },
    
    /**
     * Filter out already processed SMS
     */
    filterUnprocessedSms(smsList) {
        const processedIds = new Set(window.DB.processedSmsIds || []);
        return smsList.filter(sms => !processedIds.has(sms.id));
    },
    
    /**
     * Sanitize SMS data before sending to AI
     * Security: Remove any sensitive patterns, keep only what's needed
     */
    sanitizeForAI(smsList) {
        return smsList.map((sms, index) => {
            let body = sms.body || '';
            
            // Remove any 10+ digit numbers (could be phone/account numbers)
            body = body.replace(/\b\d{10,}\b/g, '[MASKED]');
            
            // Remove email addresses
            body = body.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL]');
            
            // Remove URLs
            body = body.replace(/https?:\/\/[^\s]+/g, '[URL]');
            
            // Keep: amounts (Rs./INR), dates, last 4 digits (XX1234 pattern)
            
            return {
                index: index,
                sender: sms.sender,
                body: body,
                originalId: sms.id
            };
        });
    },
    
    /**
     * Batch parse SMS with AI
     * Sends all SMS in single request for efficiency
     */
    async batchParseWithAI(sanitizedSms) {
        try {
            // Check if AI Provider is available
            if (!window.AIProvider) {
                throw new Error('AI Provider not loaded. Please refresh the app.');
            }
            
            // Check if AI is configured
            if (!window.AIProvider.isConfigured || !window.AIProvider.isConfigured()) {
                throw new Error('AI not configured. Please set up an API key in Settings.');
            }
            
            // Build prompt with all SMS
            const smsText = sanitizedSms.map((sms, i) => 
                `[${i + 1}] Sender: ${sms.sender}\nMessage: ${sms.body}`
            ).join('\n\n---\n\n');
            
            const prompt = `Parse these credit card bill/statement SMS messages and extract billing information.

For each SMS, extract:
- index: the SMS number (1, 2, 3...)
- cardLast4: last 2-4 digits of card (look for patterns like XX1234, XX85, ****1234, ending 85)
- amount: total due amount in INR (number only, no currency symbol)
- dueDate: payment due date in YYYY-MM-DD format
- minDue: minimum due amount if mentioned (number or null)

IMPORTANT:
- Return ONLY a valid JSON array
- Only include SMS that are clearly credit card bills/statements
- Skip SMS that are just alerts or reminders
- Extract exact amounts as shown in SMS
- If you can't find a value, use null

SMS Messages:
${smsText}

Return ONLY the JSON array, no explanations:`;

            console.log('📱 SMS to parse:', sanitizedSms.length);
            console.log('🤖 Sending to AI...');
            
            // Suppress info messages during progress
            window.AIProvider.suppressInfoMessages = true;
            
            const response = await window.AIProvider.call(prompt, { mode: 'general' });
            
            window.AIProvider.suppressInfoMessages = false;
            
            console.log('✅ AI Response received:', response ? response.substring(0, 200) + '...' : 'empty');
            
            // Parse JSON response
            const parsed = this.parseAIResponse(response);
            console.log('📋 Parsed bills:', parsed);
            
            return parsed;
            
        } catch (error) {
            if (window.AIProvider) {
                window.AIProvider.suppressInfoMessages = false;
            }
            console.error('AI parsing failed:', error);
            // Re-throw with more specific message
            throw new Error(error.message || 'Failed to parse bills with AI');
        }
    },
    
    /**
     * Parse AI response to extract JSON array
     */
    parseAIResponse(response) {
        try {
            // Try to find JSON array in response
            let jsonStr = response;
            
            // Remove markdown code blocks if present
            jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '');
            
            // Find array brackets
            const startIdx = jsonStr.indexOf('[');
            const endIdx = jsonStr.lastIndexOf(']');
            
            if (startIdx === -1 || endIdx === -1) {
                console.error('No JSON array found in AI response');
                return [];
            }
            
            jsonStr = jsonStr.substring(startIdx, endIdx + 1);
            
            const parsed = JSON.parse(jsonStr);
            
            if (!Array.isArray(parsed)) {
                return [];
            }
            
            return parsed;
            
        } catch (error) {
            console.error('Failed to parse AI response:', error);
            return [];
        }
    },
    
    /**
     * Ground and validate parsed bills against original SMS
     * Security: Ensures AI didn't hallucinate data
     */
    groundAndValidate(parsedBills, originalSms) {
        const validated = [];
        
        for (const bill of parsedBills) {
            // Get corresponding original SMS
            const smsIndex = (bill.index || 1) - 1;
            const originalSmsItem = originalSms[smsIndex];
            
            if (!originalSmsItem) {
                console.warn('No original SMS found for bill index:', bill.index);
                continue;
            }
            
            const body = originalSmsItem.body || '';
            
            // Validate cardLast4 exists in SMS
            if (bill.cardLast4) {
                const last4Pattern = new RegExp(bill.cardLast4, 'i');
                if (!last4Pattern.test(body)) {
                    console.warn('Card last digits not found in SMS:', bill.cardLast4);
                    continue;
                }
            } else {
                // Try to extract last 2-4 digits from SMS (SBI uses only 2 digits like XX85)
                const lastDigitsMatch = body.match(/(?:XX|xx|\*{2,4}|ending\s*|x{2,4})(\d{2,4})/i);
                if (lastDigitsMatch) {
                    bill.cardLast4 = lastDigitsMatch[1]; // Could be 2, 3, or 4 digits
                } else {
                    console.warn('Could not find card last digits in SMS');
                    continue;
                }
            }
            
            // Extract and validate amount from SMS
            // Look for amount patterns - handle "Rs.12,550" format carefully
            const amountPatterns = body.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/gi) || [];
            const foundAmounts = amountPatterns.map(p => {
                // Extract just the number: "Rs.12,550" -> "12,550" -> "12550" -> 12550
                // First remove "Rs." or "Rs" or "INR" or "₹" prefix
                let numStr = p.replace(/^(Rs\.?|INR|₹)\s*/i, '');
                // Remove commas
                numStr = numStr.replace(/,/g, '');
                const num = parseFloat(numStr);
                console.log(`Parsing "${p}" -> "${numStr}" -> ${num}`);
                return num;
            }).filter(n => !isNaN(n) && n > 0);
            
            console.log('Found amounts in SMS:', foundAmounts);
            
            // If AI parsed amount, validate it
            if (bill.amount) {
                const amountNum = parseFloat(String(bill.amount).replace(/,/g, ''));
                console.log('AI parsed amount:', amountNum);
                
                // Check if AI amount matches any found amount
                const isValidAmount = foundAmounts.some(a => 
                    Math.abs(a - amountNum) / Math.max(a, amountNum) < 0.1
                );
                
                if (!isValidAmount && foundAmounts.length > 0) {
                    // Use the highest amount found (likely total due)
                    bill.amount = Math.max(...foundAmounts);
                    console.log('Corrected amount to:', bill.amount);
                }
            } else if (foundAmounts.length > 0) {
                // AI didn't parse amount, use highest found
                bill.amount = Math.max(...foundAmounts);
                console.log('Set amount from SMS:', bill.amount);
            }
            
            // Validate date is reasonable (not too old, not too far in future)
            if (bill.dueDate) {
                const dueDate = new Date(bill.dueDate);
                const now = new Date();
                const daysDiff = (dueDate - now) / (1000 * 60 * 60 * 24);
                
                // Due date should be within -30 to +60 days
                if (daysDiff < -30 || daysDiff > 60) {
                    console.warn('Due date out of reasonable range:', bill.dueDate);
                    // Don't reject, just log
                }
            }
            
            // Mark as validated and add SMS reference
            bill.validated = true;
            bill.smsId = originalSmsItem.id;
            bill.smsBody = originalSmsItem.body;
            
            validated.push(bill);
        }
        
        return validated;
    },
    
    /**
     * Link bills to existing cards or create placeholder cards
     */
    async linkBillsToCards(validatedBills, originalSms) {
        const linkedBills = [];
        
        for (const bill of validatedBills) {
            const lastDigits = bill.cardLast4; // Could be 2, 3, or 4 digits
            
            // Try to find existing card with matching last digits
            // Handle both 4-digit and 2-digit (SBI) matching
            let card = window.DB.cards.find(c => {
                if (!c.cardNumber) return false;
                const cardLast4 = c.cardNumber.slice(-4);
                // Exact match for 4 digits, or ends with for 2-3 digits
                return cardLast4 === lastDigits || cardLast4.endsWith(lastDigits);
            });
            
            if (card) {
                // Link to existing card
                bill.cardId = card.id;
            } else {
                // Create placeholder card
                const placeholderId = Utils.generateId();
                const placeholderCard = {
                    id: placeholderId,
                    name: `Unknown Card XX${lastDigits}`,
                    cardNumber: `XXXXXXXXXXXX${lastDigits}`,
                    expiry: '',
                    cvv: '',
                    cardType: 'credit',
                    creditLimit: '',
                    outstanding: 0,
                    statementDate: null,
                    billDate: null,
                    isPlaceholder: true,
                    benefits: null,
                    benefitsFetchedAt: null,
                    emis: [],
                    additionalData: '',
                    createdAt: Utils.getCurrentTimestamp()
                };
                
                window.DB.cards.push(placeholderCard);
                bill.cardId = placeholderId;
            }
            
            // Create bill record - ensure amounts are parsed correctly
            const parseAmount = (val) => {
                if (!val) return 0;
                // Remove currency symbols, "Rs.", commas, and whitespace
                const cleaned = String(val)
                    .replace(/^(Rs\.?|INR|₹)\s*/i, '')
                    .replace(/,/g, '')
                    .trim();
                const num = parseFloat(cleaned);
                console.log(`parseAmount: "${val}" -> "${cleaned}" -> ${num}`);
                return isNaN(num) ? 0 : num;
            };
            
            const billRecord = {
                id: Utils.generateId(),
                cardId: bill.cardId,
                cardLast4: lastDigits,
                amount: parseAmount(bill.amount),
                originalAmount: parseAmount(bill.amount),
                dueDate: bill.dueDate || null,
                minDue: parseAmount(bill.minDue),
                isPaid: false,
                paidAmount: null,
                paidType: null,
                paidAt: null,
                smsId: bill.smsId,
                smsBody: bill.smsBody,
                parsedAt: Utils.getCurrentTimestamp()
            };
            
            linkedBills.push(billRecord);
        }
        
        return linkedBills;
    },
    
    /**
     * Save bills to database
     */
    saveBills(bills, originalSms) {
        // Add bills to database
        if (!window.DB.cardBills) {
            window.DB.cardBills = [];
        }
        
        // Track which SMS IDs resulted in actual bills
        const successfulSmsIds = new Set();
        
        bills.forEach(bill => {
            // Track successful SMS
            if (bill.smsId) {
                successfulSmsIds.add(bill.smsId);
            }
            
            // Check for existing bill (same card, same due date)
            const existingIndex = window.DB.cardBills.findIndex(b => 
                String(b.cardId) === String(bill.cardId) && b.dueDate === bill.dueDate
            );
            
            if (existingIndex >= 0) {
                // UPDATE existing bill with new data
                const existing = window.DB.cardBills[existingIndex];
                console.log(`Updating existing bill: ${existing.amount} -> ${bill.amount}, was paid: ${existing.isPaid}`);
                
                // If amount changed significantly (>10%), reset paid status (it's a new/updated bill)
                const amountChanged = Math.abs(existing.amount - bill.amount) / Math.max(existing.amount, 1) > 0.1;
                
                window.DB.cardBills[existingIndex] = {
                    ...existing,
                    amount: bill.amount,
                    originalAmount: bill.originalAmount,
                    minDue: bill.minDue,
                    smsId: bill.smsId,
                    smsBody: bill.smsBody,
                    parsedAt: bill.parsedAt,
                    // Reset paid status if amount changed significantly
                    isPaid: amountChanged ? false : existing.isPaid,
                    paidAmount: amountChanged ? null : existing.paidAmount,
                    paidType: amountChanged ? null : existing.paidType,
                    paidAt: amountChanged ? null : existing.paidAt
                };
                
                if (amountChanged) {
                    console.log('Bill amount changed significantly, resetting paid status');
                }
            } else {
                // Add new bill
                window.DB.cardBills.push(bill);
            }
            
            // Update card's outstanding if it's 0 or null and bill has value
            if (bill.amount > 0) {
                const card = window.DB.cards?.find(c => String(c.id) === String(bill.cardId));
                if (card && (!card.outstanding || card.outstanding === 0)) {
                    card.outstanding = bill.amount;
                    console.log(`Updated card ${card.name} outstanding to ${bill.amount}`);
                }
            }
        });
        
        // Only mark SMS as processed if they resulted in a bill
        // Failed SMS can be retried on next sync
        if (!window.DB.processedSmsIds) {
            window.DB.processedSmsIds = [];
        }
        
        successfulSmsIds.forEach(smsId => {
            if (!window.DB.processedSmsIds.includes(smsId)) {
                window.DB.processedSmsIds.push(smsId);
                console.log(`Marked SMS ${smsId} as processed`);
            }
        });
        
        // Log any SMS that weren't processed (can be retried)
        const failedCount = originalSms.length - successfulSmsIds.size;
        if (failedCount > 0) {
            console.log(`${failedCount} SMS failed to parse, will retry on next sync`);
        }
        
        // Save to storage
        window.Storage.save();
    },
    
    /**
     * Get bills for a specific card
     */
    getCardBills(cardId) {
        if (!window.DB.cardBills) return [];
        return window.DB.cardBills.filter(b => b.cardId === cardId);
    },
    
    /**
     * Get all unpaid bills
     */
    getUnpaidBills() {
        if (!window.DB.cardBills) return [];
        return window.DB.cardBills.filter(b => !b.isPaid);
    },
    
    /**
     * Mark bill as paid
     */
    markBillPaid(billId, paidType = 'bill', customAmount = null) {
        const billIdStr = String(billId);
        const bill = window.DB.cardBills.find(b => String(b.id) === billIdStr);
        if (!bill) {
            throw new Error('Bill not found');
        }
        
        // Find the card to update outstanding
        const card = window.DB.cards.find(c => String(c.id) === String(bill.cardId));
        const currentOutstanding = card ? (parseFloat(card.outstanding) || 0) : 0;
        const billAmount = parseFloat(bill.amount) || 0;
        
        // Determine paid amount based on type
        let paidAmount;
        switch (paidType) {
            case 'outstanding':
                // Paying full outstanding - set outstanding to 0
                paidAmount = currentOutstanding;
                break;
            case 'custom':
                paidAmount = parseFloat(customAmount) || billAmount;
                break;
            case 'bill':
            default:
                paidAmount = billAmount;
                break;
        }
        
        bill.isPaid = true;
        bill.paidAmount = paidAmount;
        bill.paidType = paidType;
        bill.paidAt = Utils.getCurrentTimestamp();
        
        // Update card's outstanding amount
        if (card) {
            if (paidType === 'outstanding') {
                // Paid full outstanding - set to 0
                card.outstanding = 0;
            } else {
                // Reduce outstanding by paid amount (minimum 0)
                card.outstanding = Math.max(0, currentOutstanding - paidAmount);
            }
            console.log(`Updated outstanding: ${currentOutstanding} - ${paidAmount} = ${card.outstanding}`);
        }
        
        window.Storage.save();
        
        return bill;
    },
    
    /**
     * Mark bill as unpaid
     */
    markBillUnpaid(billId) {
        const bill = window.DB.cardBills.find(b => b.id === billId);
        if (!bill) {
            throw new Error('Bill not found');
        }
        
        bill.isPaid = false;
        bill.paidAmount = null;
        bill.paidType = null;
        bill.paidAt = null;
        
        window.Storage.save();
        
        return bill;
    },
    
    /**
     * Update bill amount (manual override)
     */
    updateBillAmount(billId, newAmount) {
        const bill = window.DB.cardBills.find(b => b.id === billId);
        if (!bill) {
            throw new Error('Bill not found');
        }
        
        // Remove commas before parsing
        const cleaned = String(newAmount).replace(/,/g, '');
        bill.amount = parseFloat(cleaned) || 0;
        window.Storage.save();
        
        return bill;
    },
    
    /**
     * Delete a bill
     */
    deleteBill(billId) {
        const index = window.DB.cardBills.findIndex(b => b.id === billId);
        if (index === -1) {
            throw new Error('Bill not found');
        }
        
        window.DB.cardBills.splice(index, 1);
        window.Storage.save();
    },
    
    /**
     * Get summary statistics for all cards
     */
    getSummary() {
        const cards = window.DB.cards.filter(c => c.cardType === 'credit' && !c.isPlaceholder);
        const placeholderCards = window.DB.cards.filter(c => c.cardType === 'credit' && c.isPlaceholder);
        const allCardIds = window.DB.cards.map(c => String(c.id));
        const bills = window.DB.cardBills || [];
        const groups = window.DB.cardGroups || [];
        
        // Only count bills from cards that still exist (not deleted)
        const activeBills = bills.filter(b => allCardIds.includes(String(b.cardId)));
        
        // Calculate credit limit considering groups
        // Cards in groups use the group's shared limit (counted once per group)
        let totalCreditLimit = 0;
        const processedGroupIds = new Set();
        
        cards.forEach(card => {
            const cardIdStr = String(card.id);
            const group = groups.find(g => g.cardIds?.map(String).includes(cardIdStr));
            
            if (group) {
                // Card is in a group - use group's shared limit (only once per group)
                if (!processedGroupIds.has(group.id)) {
                    totalCreditLimit += parseFloat(group.sharedLimit) || 0;
                    processedGroupIds.add(group.id);
                }
            } else {
                // Card is not in a group - use individual limit
                totalCreditLimit += parseFloat(card.creditLimit) || 0;
            }
        });
        
        // Total outstanding (sum all individual cards' outstanding)
        const totalOutstanding = cards.reduce((sum, c) => {
            return sum + (parseFloat(c.outstanding) || 0);
        }, 0);
        
        // Total bills due - only count the LATEST unpaid bill per card/group
        let totalBillsDue = 0;
        let unpaidBillsCount = 0;
        const processedBillGroups = new Set(); // Track groups we've already counted bills for
        
        // Group bills by card and get only the latest unpaid bill per card
        const cardIds = [...new Set(activeBills.map(b => String(b.cardId)))];
        cardIds.forEach(cardId => {
            const card = window.DB.cards.find(c => String(c.id) === cardId);
            if (!card) return;
            
            // Check if this card is in a group with shared billing
            const group = groups.find(g => g.cardIds?.map(String).includes(cardId) && g.shareBill);
            
            if (group) {
                // Only count bills from the primary card in a group (avoid duplicates)
                if (String(group.primaryCardId) !== cardId) return;
                if (processedBillGroups.has(group.id)) return;
                processedBillGroups.add(group.id);
            }
            
            const cardBills = activeBills.filter(b => String(b.cardId) === cardId);
            // Sort by due date (newest first)
            cardBills.sort((a, b) => new Date(b.dueDate || b.parsedAt || 0) - new Date(a.dueDate || a.parsedAt || 0));
            // Get the most recent unpaid bill (same logic as card display)
            const unpaidBill = cardBills.find(b => !b.isPaid);
            if (unpaidBill) {
                totalBillsDue += parseFloat(unpaidBill.amount) || 0;
                unpaidBillsCount++;
            }
        });
        
        // Total EMIs (from cards with EMIs)
        let totalEmis = 0;
        cards.forEach(card => {
            if (card.emis && card.emis.length > 0) {
                card.emis.forEach(emi => {
                    if (!emi.completed && emi.emiAmount) {
                        totalEmis += parseFloat(emi.emiAmount) || 0;
                    }
                });
            }
        });
        
        // Count active EMIs
        let activeEmiCount = 0;
        cards.forEach(card => {
            if (card.emis && card.emis.length > 0) {
                activeEmiCount += card.emis.filter(e => !e.completed).length;
            }
        });
        
        return {
            totalCreditLimit,
            totalOutstanding,
            totalBillsDue,
            unpaidBillsCount,
            totalEmis,
            activeEmiCount,
            cardCount: cards.length,
            placeholderCount: placeholderCards.length
        };
    },
    
    /**
     * Relink bills when a new card is added
     * Called from Cards.add() after a new card is added
     */
    relinkBillsOnCardAdd(newCard) {
        if (!newCard.cardNumber || !window.DB.cardBills) return;
        
        const newLast4 = newCard.cardNumber.slice(-4);
        
        // Find placeholder card with matching last 4 digits
        const placeholder = window.DB.cards.find(c => 
            c.isPlaceholder && c.cardNumber.slice(-4) === newLast4
        );
        
        if (!placeholder) return;
        
        // Move bills from placeholder to new card
        window.DB.cardBills.forEach(bill => {
            if (bill.cardId === placeholder.id) {
                bill.cardId = newCard.id;
            }
        });
        
        // Remove placeholder card
        const placeholderIndex = window.DB.cards.findIndex(c => c.id === placeholder.id);
        if (placeholderIndex !== -1) {
            window.DB.cards.splice(placeholderIndex, 1);
        }
        
        window.Storage.save();
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.SmsBills = SmsBills;
}

