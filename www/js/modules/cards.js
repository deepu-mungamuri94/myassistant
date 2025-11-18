/**
 * Cards Module
 * Handles credit card information management
 */

const Cards = {
    currentTab: 'credit', // Track current tab: 'credit' or 'debit'
    
    /**
     * Add a new card (fetches benefits automatically for credit cards)
     */
    async add(name, cardNumber, expiry, cvv, additionalData = '', creditLimit = '', cardType = 'credit') {
        if (!name || !cardNumber || !expiry || !cvv) {
            throw new Error('Please fill in all required fields');
        }
        
        // Basic card number validation (remove spaces)
        const cleanCardNumber = cardNumber.replace(/\s/g, '');
        if (!/^\d{13,19}$/.test(cleanCardNumber)) {
            throw new Error('Invalid card number (13-19 digits required)');
        }
        
        // Expiry validation (MM/YY or MM/YYYY)
        if (!/^\d{2}\/\d{2,4}$/.test(expiry)) {
            throw new Error('Invalid expiry format (use MM/YY or MM/YYYY)');
        }
        
        // CVV validation (3-4 digits)
        if (!/^\d{3,4}$/.test(cvv)) {
            throw new Error('Invalid CVV (3-4 digits required)');
        }
        
        const card = {
            id: Utils.generateId(),
            name,
            cardNumber: cleanCardNumber,
            expiry,
            cvv,
            cardType: cardType || 'credit', // 'credit' or 'debit'
            creditLimit: (cardType === 'credit' && creditLimit) ? creditLimit : '', // Only for credit cards
            additionalData: additionalData || '',
            benefits: null, // Will be fetched (credit cards only)
            benefitsFetchedAt: null,
            emis: [], // Only relevant for credit cards
            createdAt: Utils.getCurrentTimestamp()
        };
        
        // Add card to DB immediately
        window.DB.cards.push(card);
        window.Storage.save();
        
        // Fetch benefits in background (credit cards only)
        if (cardType === 'credit') {
            this.fetchAndStoreBenefits(card.id, name).catch(err => {
                console.error('Failed to fetch card benefits:', err);
            });
        }
        
        return card;
    },

    /**
     * Show loading overlay on a specific card
     */
    showCardLoading(cardId) {
        const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
        if (!cardElement) return;
        
        // Create or show loading overlay
        let overlay = cardElement.querySelector('.card-loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'card-loading-overlay absolute inset-0 bg-white bg-opacity-90 flex flex-col items-center justify-center rounded-2xl z-10';
            overlay.innerHTML = `
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-3"></div>
                <p class="text-sm font-semibold text-gray-700">Fetching Card Benefits...</p>
                <p class="text-xs text-gray-500 mt-1">This may take a few seconds</p>
            `;
            cardElement.style.position = 'relative';
            cardElement.appendChild(overlay);
        } else {
            overlay.classList.remove('hidden');
        }
    },

    /**
     * Hide loading overlay on a specific card
     */
    hideCardLoading(cardId) {
        const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
        if (!cardElement) return;
        
        const overlay = cardElement.querySelector('.card-loading-overlay');
        if (overlay) {
            overlay.remove();
        }
    },

    /**
     * Fetch card benefits from AI and store in database
     */
    async fetchAndStoreBenefits(cardId, cardName, showLoading = true) {
        try {
            // Show loading overlay on the card
            if (showLoading) {
                this.showCardLoading(cardId);
            }
            
            // Check if AI is configured
            if (!window.AIProvider || !window.AIProvider.isConfigured()) {
                console.warn('AI not configured, skipping benefits fetch');
                if (showLoading) {
                    this.hideCardLoading(cardId);
                }
                return;
            }

            // Use comprehensive CardAdvisor-style prompt
            const systemPrompt = `You are a financial information specialist with access to real-time web search via Google Search. Your task is to:
1. Search the OFFICIAL BANK WEBSITE for the "${cardName}" credit card (e.g., HDFC Bank, SBI Card, ICICI, Axis Bank official sites).
2. Verify information from the bank's official reward program terms and conditions.
3. Provide a COMPREHENSIVE, COMPLETE, MOBILE-FRIENDLY summary using BULLET POINTS (no tables!) of ALL verified benefits:

**MUST INCLUDE ALL OF THE FOLLOWING CATEGORIES (if available):**

**BASE REWARDS:**
- Base Reward Point (RP) earning rate per ₹100 or ₹150 spent (or Cashback %)
- Milestone benefits and annual spend bonuses

**HEALTHCARE & MEDICAL:**
- Pharmacy purchases (MedPlus, Apollo Pharmacy, Netmeds, 1mg)
- Hospital and clinic payments
- Health insurance premium payments
- Medical equipment and supplies
- Diagnostic tests and health checkups

**GROCERIES & SUPERMARKETS:**
- Supermarket purchases (Big Bazaar, D-Mart, Reliance Fresh, More, Spencer's)
- Online grocery (BigBasket, Grofers, Amazon Pantry, Swiggy Instamart, Blinkit)
- Kirana stores and local shops

**FUEL & TRANSPORTATION:**
- Petrol/Diesel fuel stations (BPCL, HPCL, Indian Oil, Shell, etc.)
- EV charging stations
- Fuel surcharge waiver
- Toll payments
- Metro/Local train recharge

**DINING & FOOD:**
- Restaurant dining (fine dining, casual, QSR)
- Food delivery apps (Swiggy, Zomato, Dunzo)
- Cafes and bakeries (Starbucks, CCD, etc.)
- Cloud kitchens and food courts
- Dining memberships (Zomato Gold, Dineout Passport)

**ENTERTAINMENT:**
- **Movie Tickets:** BookMyShow offers (1+1, discounts), PVR, INOX, Cinepolis
- OTT Subscriptions (Netflix, Amazon Prime, Disney+, Hotstar, Zee5, SonyLiv)
- Concert and event tickets
- Amusement parks and gaming zones
- Theater and live shows

**TRAVEL:**
- **Flight Tickets:** Domestic and international bookings, airline miles
- **Hotel Bookings:** MakeMyTrip, Goibibo, Booking.com, OYO, etc.
- Travel packages and holiday bookings
- Airport lounge access (domestic and international)
- Travel insurance (complimentary coverage)
- Cab bookings (Uber, Ola, Meru)
- Railway ticket bookings (IRCTC)
- Bus bookings (RedBus, etc.)
- Forex and foreign currency markup

**ONLINE SHOPPING:**
- E-commerce platforms (Amazon, Flipkart, Myntra, Ajio)
- Fashion and apparel websites
- Electronics online (Croma, Vijay Sales online)
- Specialized online stores (Nykaa, FirstCry, etc.)

**OFFLINE SHOPPING:**
- Department stores and malls
- Electronics and appliances stores
- Fashion and apparel outlets
- Jewelry stores
- Furniture and home decor
- Branded showrooms

**UTILITIES & BILLS:**
- Electricity bills
- Water bills
- Gas bills (piped and cylinder)
- Broadband and internet bills
- Mobile recharge and postpaid bills
- DTH and cable TV recharge

**INSURANCE:**
- Life insurance premium
- Health insurance premium
- Vehicle insurance
- Home insurance

**EDUCATION:**
- School and college fees
- Coaching and tuition fees
- Online courses and certifications

**LIFESTYLE & WELLNESS:**
- Gym and fitness memberships
- Spa and salon services
- Golf course access
- Yoga and wellness centers

**OTHERS:**
- Concierge services
- Priority customer care
- Redemption value (e.g., 1 RP = ₹0.25)
- Key Exclusions (categories with 0 rewards or restrictions)
- Annual fee and fee waiver conditions
- Welcome/Joining bonus and offers

4. COMPLETENESS RULES (CRITICAL):
- DO NOT TRUNCATE or summarize - include ALL offers found on the official website
- Check EVERY category listed above - don't skip categories
- If there are 20 benefits, list all 20 - don't leave anything out
- Be especially thorough with:
  * Movie ticket offers (BookMyShow 1+1) - present in most premium cards
  * Grocery rewards - often have special accelerated rates
  * Fuel surcharge waivers - common benefit
  * Healthcare/Pharmacy - increasingly popular benefit
- Include monthly/quarterly/annual caps for each category
- Mention if a category is EXCLUDED (0 rewards) - this is important info too

5. FORMATTING RULES:
- Use simple bullet points (- or *), NOT tables or complex formatting
- Use bold (**text**) for emphasis on offer names
- Keep lines short for mobile readability
- Use clear section headings (### Heading)
- ABSOLUTELY NO LaTeX: no $...$ math mode, no \\text{}, no \\times, no \\$
- For multiplication use "×" or "x", NOT \\times or $\\times$
- Write as plain text/Markdown only

6. CURRENCY RULES (CRITICAL):
- ALL amounts must be in Indian Rupees (₹) ONLY
- Never use $ or dollars - this is for INDIAN credit cards
- Example: ₹100, ₹1,000, ₹50 cashback

7. SOURCE VERIFICATION:
- Use ONLY official bank sources as the source of truth
- If specific benefit not found on official site, don't make it up
- But be thorough - check rewards page, terms & conditions, feature highlights`;
            
            const userQuery = `Search the official "${cardName}" bank website and fetch COMPLETE, COMPREHENSIVE reward rules for ALL spending categories:

MUST COVER (if available):
- Healthcare/Medical/Pharmacy
- Groceries/Supermarkets
- Fuel/Petrol stations
- Dining/Restaurants/Food delivery
- Entertainment (Movie tickets - BookMyShow 1+1 offers, OTT subscriptions)
- Travel (Flights, Hotels, Lounge access, Cabs)
- Online Shopping (Amazon, Flipkart, etc.)
- Offline Shopping (Malls, Electronics, Fashion)
- Utilities (Bills, Recharge)
- Insurance premiums
- Education fees
- Lifestyle/Wellness

DO NOT TRUNCATE or skip any category - list ALL offers, cashback rates, and reward points for EVERY category found on official website. Use bullet points, NO TABLES. Format in RUPEES (₹) for INDIAN market.`;

            // Use callWithWebSearch to ensure we use Gemini/Perplexity (providers with web search)
            const benefits = await window.AIProvider.callWithWebSearch(userQuery, { system_instruction: systemPrompt });
            
            // Update card with fetched benefits
            const card = this.getById(cardId);
            if (card) {
                card.benefits = benefits;
                card.benefitsFetchedAt = Utils.getCurrentTimestamp();
                window.Storage.save();
                
                // Refresh UI if on cards view
                if (document.getElementById('cards-view') && 
                    !document.getElementById('cards-view').classList.contains('hidden')) {
                    this.render();
                }
                
                console.log(`✅ Benefits fetched for ${cardName}`);
                if (window.Toast) {
                    window.Toast.success(`Card benefits loaded for ${cardName}`);
                }
            }
            
            // Hide loading overlay
            if (showLoading) {
                this.hideCardLoading(cardId);
            }
        } catch (error) {
            console.error(`Failed to fetch benefits for ${cardName}:`, error);
            
            // Hide loading overlay
            if (showLoading) {
                this.hideCardLoading(cardId);
            }
            
            // Show error toast for user awareness
            if (window.Toast) {
                window.Toast.error(`Failed to fetch benefits for ${cardName}`);
            }
        }
    },

    /**
     * Manually refresh benefits for a card
     */
    async refreshBenefits(cardId) {
        const card = this.getById(cardId);
        if (!card) {
            throw new Error('Card not found');
        }
        
        // Show loading on button
        const btn = document.getElementById(`refresh-btn-${cardId}`);
        const btnText = document.getElementById(`refresh-text-${cardId}`);
        if (btn && btnText) {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-wait');
            btnText.textContent = 'Fetching...';
        }
        
        try {
            if (window.Toast) {
                window.Toast.info(`Fetching latest benefits for ${card.name}...`);
            }
            
            // Don't show card loading for manual refresh (button loading is enough)
            await this.fetchAndStoreBenefits(cardId, card.name, false);
            
            // Re-render to show View button now enabled
            this.render();
        } finally {
            // Restore button state
            if (btn && btnText) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-wait');
                btnText.textContent = 'Update Rules';
            }
        }
    },

    /**
     * Update a card
     */
    async update(id, name, cardNumber, expiry, cvv, additionalData = '', creditLimit = '', cardType = 'credit') {
        if (!name || !cardNumber || !expiry || !cvv) {
            throw new Error('Please fill in all required fields');
        }
        
        // Basic card number validation (remove spaces)
        const cleanCardNumber = cardNumber.replace(/\s/g, '');
        if (!/^\d{13,19}$/.test(cleanCardNumber)) {
            throw new Error('Invalid card number (13-19 digits required)');
        }
        
        // Expiry validation (MM/YY or MM/YYYY)
        if (!/^\d{2}\/\d{2,4}$/.test(expiry)) {
            throw new Error('Invalid expiry format (use MM/YY or MM/YYYY)');
        }
        
        // CVV validation (3-4 digits)
        if (!/^\d{3,4}$/.test(cvv)) {
            throw new Error('Invalid CVV (3-4 digits required)');
        }
        
        const card = this.getById(id);
        if (!card) {
            throw new Error('Card not found');
        }
        
        // Check if card name changed (only fetch benefits if name changed for credit cards)
        const nameChanged = card.name !== name;
        
        // Update card fields
        card.name = name;
        card.cardNumber = cleanCardNumber;
        card.expiry = expiry;
        card.cvv = cvv;
        card.cardType = cardType || card.cardType || 'credit'; // Preserve or set type
        card.creditLimit = (cardType === 'credit' && creditLimit) ? creditLimit : ''; // Only for credit cards
        card.additionalData = additionalData || '';
        card.lastUpdated = Utils.getCurrentTimestamp();
        
        // Save to storage
        window.Storage.save();
        
        // Only re-fetch benefits if card name changed AND it's a credit card
        if (nameChanged && card.cardType === 'credit') {
            this.fetchAndStoreBenefits(card.id, name).catch(err => {
                console.error('Failed to fetch benefits for updated card:', err);
            });
        }
        
        return card;
    },

    /**
     * Delete a card
     */
    delete(id) {
        window.DB.cards = window.DB.cards.filter(c => c.id !== id);
        window.Storage.save();
    },

    /**
     * Get all cards
     */
    getAll() {
        return window.DB.cards;
    },

    /**
     * Get card by ID
     */
    getById(id) {
        // Convert to string to handle both string and number IDs
        const searchId = String(id);
        return window.DB.cards.find(c => String(c.id) === searchId);
    },

    /**
     * Mask card number for display
     */
    maskCardNumber(cardNumber) {
        const last4 = cardNumber.slice(-4);
        return `•••• •••• •••• ${last4}`;
    },

    /**
     * Get card type from number
     */
    getCardType(cardNumber) {
        const firstDigit = cardNumber[0];
        if (firstDigit === '4') return 'Visa';
        if (firstDigit === '5') return 'Mastercard';
        if (firstDigit === '3') return 'Amex';
        if (firstDigit === '6') return 'Discover';
        return 'Unknown';
    },

    /**
     * Calculate used limit (total remaining EMI amount)
     */
    calculateUsedLimit(card) {
        if (!card.emis || card.emis.length === 0) return 0;
        
        const activeEMIs = card.emis.filter(e => !e.completed);
        let totalUsed = 0;
        
        activeEMIs.forEach(emi => {
            if (emi.emiAmount) {
                const remainingEMIs = emi.totalCount - emi.paidCount;
                totalUsed += parseFloat(emi.emiAmount) * remainingEMIs;
            }
        });
        
        return Math.round(totalUsed);
    },

    /**
     * Get EMI summary for display
     */
    getEMISummary(card) {
        if (!card.emis || card.emis.length === 0) return null;
        
        const activeEMIs = card.emis.filter(e => !e.completed);
        if (activeEMIs.length === 0) return null;
        
        let totalEMIAmount = 0;
        let totalPending = 0;
        let totalPaid = 0;
        let totalCount = 0;
        let nextEMIDate = null;
        
        activeEMIs.forEach(emi => {
            if (emi.emiAmount) {
                const total = parseFloat(emi.emiAmount) * emi.totalCount;
                const pending = parseFloat(emi.emiAmount) * (emi.totalCount - emi.paidCount);
                const paid = parseFloat(emi.emiAmount) * emi.paidCount;
                
                totalEMIAmount += total;
                totalPending += pending;
                totalPaid += paid;
                totalCount += emi.totalCount;
                
                // Find next EMI date (earliest upcoming EMI)
                if (emi.firstEmiDate) {
                    const firstDate = new Date(emi.firstEmiDate);
                    const nextDate = new Date(firstDate);
                    nextDate.setMonth(nextDate.getMonth() + emi.paidCount);
                    
                    if (!nextEMIDate || nextDate < nextEMIDate) {
                        nextEMIDate = nextDate;
                    }
                }
            }
        });
        
        const progress = totalEMIAmount > 0 ? (totalPaid / totalEMIAmount) * 100 : 0;
        
        return {
            totalEMIAmount: Math.round(totalEMIAmount),
            totalPending: Math.round(totalPending),
            totalPaid: Math.round(totalPaid),
            progress: Math.round(progress),
            nextEMIDate: nextEMIDate ? nextEMIDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null,
            activeCount: activeEMIs.length
        };
    },

    /**
     * Render cards list
     */
    /**
     * Switch card tab
     */
    switchTab(tab) {
        this.currentTab = tab;
        
        // Update tab button styles
        const creditTab = document.getElementById('credit-tab');
        const debitTab = document.getElementById('debit-tab');
        
        if (tab === 'credit') {
            creditTab.className = 'flex-1 py-2 px-4 rounded-lg transition-all font-semibold bg-gradient-to-r from-green-700 to-green-500 text-white shadow-md';
            debitTab.className = 'flex-1 py-2 px-4 rounded-lg transition-all font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300';
        } else {
            creditTab.className = 'flex-1 py-2 px-4 rounded-lg transition-all font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300';
            debitTab.className = 'flex-1 py-2 px-4 rounded-lg transition-all font-semibold bg-gradient-to-r from-green-700 to-green-500 text-white shadow-md';
        }
        
        this.render();
    },
    
    /**
     * Show card details in a view-only modal
     */
    showDetailsModal(cardId) {
        const card = window.DB.cards.find(c => c.id === cardId || String(c.id) === String(cardId));
        if (!card) {
            window.Toast.error('Card not found');
            return;
        }
        
        const isCredit = card.cardType === 'credit' || !card.cardType;
        const cardHtml = this.renderCardForModal(card, isCredit);
        
        // Create and show modal
        const modalHtml = `
            <div id="card-details-modal" class="fixed inset-0 bg-gray-900 bg-opacity-75 z-[1001] flex items-center justify-center p-4" onclick="if(event.target===this) Cards.closeDetailsModal()">
                <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <div class="sticky top-0 bg-gradient-to-r from-green-700 to-green-500 px-6 py-4 flex justify-between items-center rounded-t-2xl">
                        <h2 class="text-xl font-bold text-white">Card Details</h2>
                        <button onclick="Cards.closeDetailsModal()" class="text-white hover:text-gray-200 p-1">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <div class="p-6">
                        ${cardHtml}
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existing = document.getElementById('card-details-modal');
        if (existing) existing.remove();
        
        // Add to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },
    
    /**
     * Close card details modal
     */
    closeDetailsModal() {
        const modal = document.getElementById('card-details-modal');
        if (modal) modal.remove();
    },

    /**
     * Show specific EMI details in a modal (called from expenses page)
     */
    showEMIDetailsModal(cardName, emiReason) {
        // Find the card
        const card = window.DB.cards.find(c => c.name === cardName || cardName.includes(c.name) || c.name.includes(cardName));
        if (!card) {
            window.Toast.error('Card not found');
            return;
        }

        // Find the specific EMI
        const emi = card.emis?.find(e => e.reason === emiReason);
        if (!emi) {
            window.Toast.error('EMI not found');
            return;
        }

        // Calculate EMI details
        const totalAmount = emi.emiAmount ? (parseFloat(emi.emiAmount) * emi.totalCount).toFixed(0) : 0;
        const paidAmount = emi.emiAmount ? (parseFloat(emi.emiAmount) * emi.paidCount).toFixed(0) : 0;
        const pendingAmount = totalAmount - paidAmount;
        const progress = emi.totalCount > 0 ? Math.round((emi.paidCount / emi.totalCount) * 100) : 0;

        // Calculate dates
        let startDateStr = 'N/A';
        let endDateStr = 'N/A';
        let nextEMIDateStr = 'N/A';
        
        if (emi.firstEmiDate) {
            const firstDate = new Date(emi.firstEmiDate);
            startDateStr = firstDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            
            const endDate = new Date(firstDate);
            endDate.setMonth(endDate.getMonth() + emi.totalCount - 1);
            endDateStr = endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            
            // Next EMI date
            if (emi.paidCount < emi.totalCount) {
                const nextDate = new Date(firstDate);
                nextDate.setMonth(nextDate.getMonth() + emi.paidCount);
                nextEMIDateStr = nextDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            } else {
                nextEMIDateStr = 'Completed';
            }
        }

        // Create modal HTML
        const modalHtml = `
            <div id="emi-details-modal" class="fixed inset-0 bg-gray-900 bg-opacity-75 z-[1001] flex items-center justify-center p-4" onclick="if(event.target===this) Cards.closeEMIDetailsModal()">
                <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full">
                    <div class="sticky top-0 bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-4 flex justify-between items-center rounded-t-2xl">
                        <h2 class="text-xl font-bold text-white">💳 EMI Details</h2>
                        <button onclick="Cards.closeEMIDetailsModal()" class="text-white hover:text-gray-200 p-1">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <div class="p-6">
                        <!-- Card & EMI Name -->
                        <div class="mb-4">
                            <h3 class="text-sm font-bold text-gray-800">${Utils.escapeHtml(card.name)}</h3>
                            <p class="text-xs text-gray-600 mt-1">${Utils.escapeHtml(emi.reason)}</p>
                        </div>

                        <!-- EMI Progress -->
                        <div class="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 mb-4">
                            <div class="flex justify-between items-center mb-2">
                                <span class="text-xs font-semibold text-gray-700">Progress</span>
                                <span class="text-xs font-bold text-blue-700">${emi.paidCount}/${emi.totalCount} EMIs</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-3 mb-2">
                                <div class="bg-gradient-to-r from-blue-500 to-cyan-600 h-3 rounded-full transition-all" style="width: ${progress}%"></div>
                            </div>
                            <p class="text-xs text-center text-gray-600">${progress}% completed</p>
                        </div>

                        <!-- Amount Details -->
                        <div class="space-y-3 mb-4">
                            <div class="flex justify-between items-center py-2 border-b border-gray-200">
                                <span class="text-xs text-gray-600">Monthly EMI</span>
                                <span class="text-base font-semibold text-gray-800">₹${Utils.formatIndianNumber(emi.emiAmount)}</span>
                            </div>
                            <div class="flex justify-between items-center py-2 border-b border-gray-200">
                                <span class="text-xs text-gray-600">Total Amount</span>
                                <span class="text-base font-semibold text-gray-800">₹${Utils.formatIndianNumber(totalAmount)}</span>
                            </div>
                            <div class="flex justify-between items-center py-2 border-b border-gray-200">
                                <span class="text-xs text-gray-600">Paid Amount</span>
                                <span class="text-base font-semibold text-green-600">₹${Utils.formatIndianNumber(paidAmount)}</span>
                            </div>
                            <div class="flex justify-between items-center py-2 border-b border-gray-200">
                                <span class="text-xs text-gray-600">Pending Amount</span>
                                <span class="text-base font-semibold text-orange-600">₹${Utils.formatIndianNumber(pendingAmount)}</span>
                            </div>
                        </div>

                        <!-- Date Details -->
                        <div class="bg-gray-50 rounded-xl p-4">
                            <h4 class="text-xs font-semibold text-gray-700 mb-3">📅 Timeline</h4>
                            <div class="space-y-2">
                                <div class="flex justify-between items-center">
                                    <span class="text-xs text-gray-600">Start Date</span>
                                    <span class="text-xs font-medium text-gray-800">${startDateStr}</span>
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-xs text-gray-600">End Date</span>
                                    <span class="text-xs font-medium text-gray-800">${endDateStr}</span>
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-xs text-gray-600">Next EMI</span>
                                    <span class="text-xs font-medium ${nextEMIDateStr === 'Completed' ? 'text-green-600' : 'text-blue-600'}">${nextEMIDateStr}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="bg-gray-50 px-6 py-4 rounded-b-2xl flex gap-2">
                        <button onclick="Cards.openEMIModal(${card.id}); Cards.closeEMIDetailsModal();" class="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-all">
                            View All EMIs
                        </button>
                        <button onclick="Cards.closeEMIDetailsModal()" class="px-4 py-2 bg-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-400 transition-all">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existing = document.getElementById('emi-details-modal');
        if (existing) existing.remove();

        // Add to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    /**
     * Close EMI details modal
     */
    closeEMIDetailsModal() {
        const modal = document.getElementById('emi-details-modal');
        if (modal) modal.remove();
    },
    
    /**
     * Render card for view modal (same design as list but read-only)
     */
    renderCardForModal(card, isCredit) {
        return `
            <div class="p-4 bg-gradient-to-br from-slate-100 via-blue-50 to-purple-100 rounded-xl border-2 border-slate-300 shadow-xl" style="background-image: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 25%, #e0e7ff 50%, #ddd6f3 75%, #faaca8 100%); box-shadow: 0 8px 16px -4px rgba(0, 0, 0, 0.2), inset 0 1px 0 0 rgba(255, 255, 255, 0.4);">
                <!-- Top Row: Card Name -->
                <div class="flex justify-between items-start mb-2">
                    <h4 class="font-bold text-slate-800 text-lg drop-shadow-sm">${Utils.escapeHtml(card.name)}</h4>
                </div>
                
                <!-- Card Number -->
                <p class="text-sm text-slate-700 font-mono font-semibold mb-2">${this.maskCardNumber(card.cardNumber)}</p>
                
                <!-- Expiry & CVV and Credit Limit -->
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <span class="text-xs text-slate-600 font-medium">Expiry: ${Utils.escapeHtml(card.expiry)}</span>
                        <span class="text-xs text-slate-600 font-medium">CVV: •••</span>
                    </div>
                    ${isCredit && card.creditLimit ? `<span class="text-xs text-slate-600 font-medium">💳 Limit: ₹${Utils.formatIndianNumber(card.creditLimit)}</span>` : ''}
                </div>
                
                <!-- Note and Used Limit -->
                <div class="flex justify-between items-start mt-1">
                    <div class="flex-1">
                        ${card.additionalData ? `<p class="text-xs text-slate-700 font-medium">${Utils.escapeHtml(card.additionalData)}</p>` : ''}
                    </div>
                    ${isCredit && this.calculateUsedLimit(card) > 0 ? `<span class="text-xs text-orange-600 font-medium ml-2">Used: ₹${Utils.formatIndianNumber(this.calculateUsedLimit(card))}</span>` : ''}
                </div>
                
                ${isCredit ? `
                <!-- EMIs Section -->
                ${card.emis && card.emis.length > 0 ? `
                <div class="mt-3 pt-3 border-t border-slate-300 flex justify-between items-center">
                    <span class="text-sm font-semibold text-slate-800">💳 EMIs (${card.emis.filter(e => !e.completed).length})</span>
                    <div class="flex gap-2">
                        <button onclick="Cards.showEMIModal('${card.id}')" class="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
                            View Terms
                        </button>
                        ${card.benefits ? `
                        <button onclick="Cards.fetchAndStoreBenefits('${card.id}', '${Utils.escapeHtml(card.name).replace(/'/g, "\\'")}').then(() => Cards.render())" class="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors">
                            Reload Benefits
                        </button>
                        ` : ''}
                    </div>
                </div>
                ` : card.benefits ? `
                <div class="mt-3 pt-3 border-t border-slate-300 flex justify-end">
                    <button onclick="Cards.fetchAndStoreBenefits('${card.id}', '${Utils.escapeHtml(card.name).replace(/'/g, "\\'")}').then(() => Cards.render())" class="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors">
                        Reload Benefits
                    </button>
                </div>
                ` : ''}
                
                <!-- Benefits Section -->
                ${card.benefits ? `
                <div class="mt-3 pt-3 border-t border-slate-300">
                    <h5 class="text-sm font-bold text-slate-800 mb-2">📋 Card Benefits</h5>
                    <div class="bg-white bg-opacity-50 rounded-lg p-3">
                        <div class="text-xs text-slate-700 leading-relaxed">${card.benefits}</div>
                    </div>
                </div>
                ` : ''}
                ` : ''}
            </div>
        `;
    },
    
    render() {
        const list = document.getElementById('cards-list');
        
        if (!list) return;
        
        // Filter cards by current tab
        const filteredCards = window.DB.cards.filter(card => {
            const cardType = card.cardType || 'credit'; // Default to credit for old cards
            return cardType === this.currentTab;
        });
        
        if (filteredCards.length === 0) {
            const cardTypeName = this.currentTab === 'credit' ? 'credit' : 'debit';
            list.innerHTML = `<p class="text-gray-500 text-center py-8">No ${cardTypeName} cards yet. Add your first one above!</p>`;
            return;
        }
        
        list.innerHTML = filteredCards.map(card => {
            const isCredit = card.cardType === 'credit' || !card.cardType; // Default to credit for old cards
            return `
            <div class="p-4 bg-gradient-to-br from-slate-100 via-blue-50 to-purple-100 rounded-xl border-2 border-slate-300 hover:shadow-2xl hover:border-purple-300 transition-all duration-300 backdrop-blur-sm" data-card-id="${card.id}" style="background-image: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 25%, #e0e7ff 50%, #ddd6f3 75%, #faaca8 100%); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), inset 0 1px 0 0 rgba(255, 255, 255, 0.4);">
                <!-- Top Row: Card Name (Left) and Actions (Right) -->
                <div class="flex justify-between items-start mb-2">
                    <h4 class="font-bold text-slate-800 text-sm drop-shadow-sm">${Utils.escapeHtml(card.name)}</h4>
                    
                    <!-- Top Right Actions: View, Edit, Delete -->
                    <div class="flex gap-2">
                        <button onclick="Cards.toggleCardDetails(${card.id})" class="text-indigo-600 hover:text-indigo-800 p-1" title="Show/Hide card details">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                            </svg>
                        </button>
                        <button onclick="openCardModal(${card.id})" class="text-purple-600 hover:text-purple-800 p-1" title="Edit">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>
                        <button onclick="Cards.deleteWithConfirm(${card.id})" class="text-red-500 hover:text-red-700 p-1" title="Delete">
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <!-- Card Number -->
                <p class="text-sm text-slate-700 font-mono font-semibold" id="card-num-${card.id}">${this.maskCardNumber(card.cardNumber)}</p>
                
                <!-- Expiry & CVV (Left) and Credit Limit (Right, below actions) - Credit limit only for credit cards -->
                <div class="flex justify-between items-center mt-1">
                    <div class="flex items-center gap-3">
                        <span class="text-xs text-slate-600 font-medium">Expiry: ${Utils.escapeHtml(card.expiry)}</span>
                        <span class="text-xs text-slate-600 font-medium">CVV: <span id="card-cvv-${card.id}">•••</span></span>
                    </div>
                    ${isCredit && card.creditLimit ? `<span class="text-xs text-slate-600 font-medium">💳 Limit: ₹${Utils.formatIndianNumber(card.creditLimit)}</span>` : '<span></span>'}
                </div>
                
                <!-- Note (Left) and Used Limit (Right, inline) - Used limit only for credit cards -->
                <div class="flex justify-between items-start mt-1">
                    <div class="flex-1">
                        ${card.additionalData ? `<p class="text-xs text-slate-700 font-medium">${Utils.escapeHtml(card.additionalData)}</p>` : '<p class="text-xs text-slate-700">&nbsp;</p>'}
                    </div>
                    ${isCredit && this.calculateUsedLimit(card) > 0 ? `<span class="text-xs text-orange-600 font-medium ml-2">Used: ₹${Utils.formatIndianNumber(this.calculateUsedLimit(card))}</span>` : ''}
                </div>
                
                <!-- Bottom Section: EMI & Benefits Actions - Only for credit cards -->
                ${isCredit ? `
                <div class="pt-3 mt-2 border-t border-slate-300 border-opacity-50">
                    <div class="flex gap-2">
                        <button onclick="Cards.openEMIModal(${card.id})" class="flex-1 text-xs bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 shadow-md">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                            </svg>
                            EMIs (${card.emis && card.emis.filter(e => !e.completed).length || 0})
                        </button>
                        <button onclick="${card.benefits ? `Cards.showBenefitsModal(${card.id})` : 'void(0)'}"
                                class="flex-1 text-xs ${card.benefits ? 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700' : 'bg-gray-400 cursor-not-allowed opacity-60'} text-white px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 shadow-md"
                                title="${card.benefits ? 'View terms' : 'No terms fetched yet'}"
                                ${!card.benefits ? 'disabled' : ''}>
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                            </svg>
                            Terms
                        </button>
                        <button onclick="Cards.refreshBenefits(${card.id})"
                                id="refresh-btn-${card.id}"
                                class="flex-1 text-xs bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 shadow-md"
                                title="Update terms">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                            </svg>
                            <span id="refresh-text-${card.id}">Terms</span>
                        </button>
                    </div>
                </div>
                ` : ''}
            </div>
        `}).join('');
    },

    /**
     * Delete with confirmation
     */
    async deleteWithConfirm(id) {
        const confirmed = await window.Utils.confirm(
            'This will permanently delete this credit card and its rules. Are you sure?',
            'Delete Credit Card'
        );
        if (!confirmed) return;
        
        this.delete(id);
        this.render();
        if (window.Toast) {
            window.Toast.show('Card deleted', 'success');
        }
    },

    /**
     * Toggle card details visibility (both number and CVV)
     */
    toggleCardDetails(id) {
        const card = this.getById(id);
        const numElement = document.getElementById(`card-num-${id}`);
        const cvvElement = document.getElementById(`card-cvv-${id}`);
        if (!card || !numElement || !cvvElement) return;
        
        // Check if currently hidden
        const isHidden = numElement.textContent === this.maskCardNumber(card.cardNumber);
        
        if (isHidden) {
            // Show both number and CVV
            const formatted = card.cardNumber.match(/.{1,4}/g).join(' ');
            numElement.textContent = formatted;
            cvvElement.textContent = card.cvv;
        } else {
            // Hide both
            numElement.textContent = this.maskCardNumber(card.cardNumber);
            cvvElement.textContent = '•••';
        }
    },

    /**
     * Show benefits in modal with better formatting
     */
    showBenefitsModal(id) {
        const card = this.getById(id);
        if (!card || !card.benefits) return;
        
        // Format benefits for better display
        const formattedBenefits = this.formatBenefits(card.benefits);
        
        // Create modal HTML
        const modal = document.createElement('div');
        modal.id = 'benefits-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col">
                <div class="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-4 flex justify-between items-center flex-shrink-0">
                    <h3 class="text-lg font-bold">💳 ${Utils.escapeHtml(card.name)}</h3>
                    <button onclick="document.getElementById('benefits-modal').remove()" class="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-1 transition-all">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div class="p-4 overflow-y-auto flex-1">
                    ${formattedBenefits}
                    ${card.benefitsFetchedAt ? `
                        <div class="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-200">
                            📅 Last updated: ${new Date(card.benefitsFetchedAt).toLocaleString()}
                        </div>
                    ` : ''}
                </div>
                <div class="bg-gray-50 p-3 flex gap-2 flex-shrink-0">
                    <button onclick="Cards.refreshBenefits(${card.id}); document.getElementById('benefits-modal').remove();" class="flex-1 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-all">
                        🔄 Refresh
                    </button>
                    <button onclick="document.getElementById('benefits-modal').remove()" class="px-4 py-2 bg-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-400 transition-all">
                        Close
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    },
    
    /**
     * Format benefits text into beautiful structured HTML (like CardAdvisor)
     */
    formatBenefits(text) {
        if (!text) return '';
        
        // Remove markdown formatting
        text = text.replace(/\*\*/g, ''); // Remove bold **
        text = text.replace(/\*/g, ''); // Remove italic *
        text = text.replace(/#{1,6}\s/g, ''); // Remove headers #
        text = text.replace(/`/g, ''); // Remove code blocks
        
        const lines = text.split('\n');
        let html = '';
        let inList = false;
        let currentSection = '';
        
        for (let line of lines) {
            line = line.trim();
            if (!line) {
                if (inList) {
                    html += '</ul></div>';
                    inList = false;
                }
                continue;
            }
            
            // Major section headers (ALL CAPS or ending with : and short)
            if (line.match(/^[A-Z\s&]{8,}:?$/) || (line.endsWith(':') && line.length < 60 && line.length > 5 && line.split(' ').length <= 5)) {
                if (inList) {
                    html += '</ul></div>';
                    inList = false;
                }
                currentSection = line.replace(/:$/, '');
                html += `<div class="mb-3">
                    <div class="bg-gradient-to-r from-green-100 to-emerald-100 px-3 py-2 rounded-lg mb-2">
                        <h3 class="font-bold text-green-800 text-sm uppercase tracking-wide">${Utils.escapeHtml(currentSection)}</h3>
                    </div>`;
            }
            // List items with various formats
            else if (line.match(/^[-*•►▪]\s/) || line.match(/^\d+[\.)]\s/)) {
                if (!inList) {
                    html += '<ul class="space-y-2 pl-2">';
                    inList = true;
                }
                let content = line.replace(/^[-*•►▪]\s/, '').replace(/^\d+[\.)]\s/, '');
                
                // Check if it's a key-value pair (has : in the middle)
                if (content.includes(':') && content.indexOf(':') > 5 && content.indexOf(':') < content.length - 5) {
                    const parts = content.split(':');
                    const key = parts[0].trim();
                    const value = parts.slice(1).join(':').trim();
                    html += `<li class="flex items-start gap-2 text-sm bg-white p-2 rounded-lg border border-green-100">
                        <span class="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                        <div class="flex-1">
                            <span class="font-semibold text-gray-800">${Utils.escapeHtml(key)}:</span>
                            <span class="text-gray-700 ml-1">${Utils.escapeHtml(value)}</span>
                        </div>
                    </li>`;
                } else {
                    html += `<li class="flex items-start gap-2 text-sm bg-white p-2 rounded-lg border border-green-100">
                        <span class="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                        <span class="text-gray-700">${Utils.escapeHtml(content)}</span>
                    </li>`;
                }
            }
            // Sub-headers or important notes
            else if (line.endsWith(':')) {
                if (inList) {
                    html += '</ul></div>';
                    inList = false;
                }
                html += `<div class="mt-2 mb-1">
                    <h4 class="font-semibold text-green-700 text-sm">${Utils.escapeHtml(line)}</h4>`;
            }
            // Regular paragraphs
            else {
                if (inList) {
                    html += '</ul></div>';
                    inList = false;
                }
                html += `<p class="text-sm text-gray-700 mb-2 leading-relaxed bg-gray-50 p-2 rounded">${Utils.escapeHtml(line)}</p>`;
            }
        }
        
        if (inList) {
            html += '</ul></div>';
        }
        
        return html || `<p class="text-sm text-gray-700">${Utils.escapeHtml(text)}</p>`;
    },

    /**
     * Open EMI modal for a card
     */
    openEMIModal(cardId) {
        const card = this.getById(cardId);
        if (!card) return;
        
        // Initialize emis array if not exists
        if (!card.emis) {
            card.emis = [];
        }
        
        // Store current card ID globally
        window.currentEMICardId = cardId;
        
        // Render EMIs
        this.renderEMIs(cardId);
        
        // Show modal
        document.getElementById('emi-modal').classList.remove('hidden');
        document.getElementById('emi-modal-title').textContent = `EMIs - ${card.name}`;
    },

    /**
     * Render EMIs list in modal
     */
    renderEMIs(cardId) {
        const card = this.getById(cardId);
        if (!card) return;
        
        const list = document.getElementById('emi-list');
        const emis = card.emis || [];
        
        // Auto-mark EMIs as completed if last EMI date has passed
        const today = new Date();
        let autoCompleted = false;
        emis.forEach(emi => {
            if (emi.firstEmiDate && !emi.completed) {
                const firstDate = new Date(emi.firstEmiDate);
                let monthsElapsed = (today.getFullYear() - firstDate.getFullYear()) * 12 
                                  + (today.getMonth() - firstDate.getMonth());
                
                // If current date hasn't reached the EMI day this month, subtract 1
                if (today.getDate() < firstDate.getDate()) {
                    monthsElapsed--;
                }
                
                // Calculate actual paid EMIs
                const actualPaidEMIs = Math.max(0, monthsElapsed + 1);
                
                // If all EMIs should have been paid by now
                if (actualPaidEMIs >= emi.totalCount) {
                    emi.completed = true;
                    emi.paidCount = emi.totalCount;
                    autoCompleted = true;
                }
            }
        });
        
        // Save if any EMI was auto-completed
        if (autoCompleted) {
            window.Storage.save();
        }
        
        // Separate active and completed EMIs
        const activeEMIs = emis.filter(e => !e.completed);
        const completedEMIs = emis.filter(e => e.completed);
        
        if (activeEMIs.length === 0 && completedEMIs.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-center py-4">No EMIs on this card yet.</p>';
            return;
        }
        
        let html = '';
        
        // Active EMIs
        if (activeEMIs.length > 0) {
            html += '<h3 class="text-sm font-semibold text-gray-700 mb-2">Active EMIs</h3>';
            html += activeEMIs.map(emi => {
                // Calculate end date (first date + total EMIs months)
                let endDateStr = 'N/A';
                if (emi.firstEmiDate) {
                    const firstDate = new Date(emi.firstEmiDate);
                    const endDate = new Date(firstDate);
                    endDate.setMonth(endDate.getMonth() + emi.totalCount - 1);
                    endDateStr = Utils.formatLocalDate(endDate);
                }
                
                // Calculate total amount
                const totalAmount = emi.emiAmount ? (parseFloat(emi.emiAmount) * emi.totalCount).toFixed(0) : null;
                
                return `
                <div class="p-3 rounded-lg border border-blue-300 mb-2 backdrop-blur-md bg-white/40" style="background: rgba(219, 234, 254, 0.5); backdrop-filter: blur(10px);">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex-1">
                            <p class="text-sm font-semibold text-gray-800">${Utils.escapeHtml(emi.reason)}</p>
                        </div>
                        <div class="flex gap-1 ml-2">
                            <button onclick="Cards.editEMI(${cardId}, '${emi.id}')" class="text-blue-600 hover:text-blue-800 p-1" title="Edit">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                            </button>
                            ${emi.paidCount >= emi.totalCount ? `
                                <button onclick="Cards.markEMIComplete(${cardId}, '${emi.id}')" class="text-green-600 hover:text-green-800 p-1" title="Mark Complete">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                                    </svg>
                                </button>
                            ` : ''}
                            <button onclick="Cards.deleteEMI(${cardId}, '${emi.id}')" class="text-red-600 hover:text-red-800 p-1" title="Delete">
                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="flex justify-between items-center">
                        <div class="flex-1">
                            <p class="text-xs text-gray-600">
                                📅 ${Utils.escapeHtml(emi.firstEmiDate || emi.date)} → ${Utils.escapeHtml(endDateStr)}
                            </p>
                        </div>
                        ${totalAmount ? `<p class="text-xs font-semibold text-blue-700 ml-2">₹${Utils.formatIndianNumber(totalAmount)}</p>` : ''}
                    </div>
                    <p class="text-xs text-gray-600 mt-1">Progress: ${emi.paidCount}/${emi.totalCount} EMIs ${emi.emiAmount ? `(₹${Utils.formatIndianNumber(emi.emiAmount)}/month)` : ''}</p>
                    <div class="w-full bg-gray-200/60 rounded-full h-1.5 mt-1">
                        <div class="bg-blue-600 h-1.5 rounded-full" style="width: ${(emi.paidCount/emi.totalCount)*100}%"></div>
                    </div>
                </div>
                `;
            }).join('');
        }
        
        // Completed EMIs (collapsed by default)
        if (completedEMIs.length > 0) {
            html += `
                <details class="mt-4">
                    <summary class="text-sm font-semibold text-gray-500 cursor-pointer">Completed EMIs (${completedEMIs.length})</summary>
                    <div class="mt-2">
                        ${completedEMIs.map(emi => {
                            // Calculate end date (first date + total EMIs months)
                            let endDateStr = 'N/A';
                            if (emi.firstEmiDate) {
                                const firstDate = new Date(emi.firstEmiDate);
                                const endDate = new Date(firstDate);
                                endDate.setMonth(endDate.getMonth() + emi.totalCount - 1);
                                endDateStr = Utils.formatLocalDate(endDate);
                            }
                            
                            // Calculate total amount
                            const totalAmount = emi.emiAmount ? (parseFloat(emi.emiAmount) * emi.totalCount).toFixed(0) : null;
                            
                            return `
                            <div class="p-3 rounded-lg border border-green-300 mb-2" style="background: rgba(220, 252, 231, 0.6);">
                                <div class="flex justify-between items-start mb-2">
                                    <div class="flex-1">
                                        <p class="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                            ${Utils.escapeHtml(emi.reason)}
                                            <span class="text-xs text-green-600">✓ Completed</span>
                                        </p>
                                    </div>
                                    <button onclick="Cards.deleteEMI(${cardId}, '${emi.id}')" class="text-red-600 hover:text-red-800 p-1" title="Delete">
                                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                                        </svg>
                                    </button>
                                </div>
                                <div class="flex justify-between items-center">
                                    <div class="flex-1">
                                        <p class="text-xs text-gray-600">
                                            📅 ${Utils.escapeHtml(emi.firstEmiDate || emi.date)} → ${Utils.escapeHtml(endDateStr)}
                                        </p>
                                    </div>
                                    ${totalAmount ? `<p class="text-xs font-semibold text-green-700 ml-2">₹${Utils.formatIndianNumber(totalAmount)}</p>` : ''}
                                </div>
                                <p class="text-xs text-gray-600 mt-1">${emi.totalCount}/${emi.totalCount} EMIs paid ${emi.emiAmount ? `(₹${Utils.formatIndianNumber(emi.emiAmount)}/month)` : ''}</p>
                            </div>
                            `;
                        }).join('')}
                    </div>
                </details>
            `;
        }
        
        list.innerHTML = html;
    },

    /**
     * Open EMI add/edit form
     */
    openEMIForm(cardId, emiId = null) {
        const card = this.getById(cardId);
        if (!card) return;
        
        // Clear form
        document.getElementById('emi-form-id').value = emiId || '';
        document.getElementById('emi-form-reason').value = '';
        document.getElementById('emi-form-first-date').value = '';
        document.getElementById('emi-form-amount').value = '';
        document.getElementById('emi-form-paid').value = '0';
        document.getElementById('emi-form-total').value = '';
        document.getElementById('emi-auto-info').classList.add('hidden');
        
        if (emiId) {
            // Edit mode
            const emi = card.emis.find(e => e.id === emiId);
            if (emi) {
                document.getElementById('emi-form-title').textContent = 'Edit EMI';
                document.getElementById('emi-form-reason').value = emi.reason;
                document.getElementById('emi-form-first-date').value = emi.firstEmiDate || '';
                document.getElementById('emi-form-amount').value = emi.emiAmount || '';
                document.getElementById('emi-form-paid').value = emi.paidCount;
                document.getElementById('emi-form-total').value = emi.totalCount;
            }
        } else {
            document.getElementById('emi-form-title').textContent = 'Add EMI';
        }
        
        document.getElementById('emi-form-modal').classList.remove('hidden');
    },

    /**
     * Save EMI (add or update)
     */
    saveEMI(cardId) {
        const card = this.getById(cardId);
        if (!card) return;
        
        const emiId = document.getElementById('emi-form-id').value;
        const reason = document.getElementById('emi-form-reason').value.trim();
        const firstEmiDate = document.getElementById('emi-form-first-date').value;
        const emiAmount = document.getElementById('emi-form-amount').value.trim();
        const paidCount = parseInt(document.getElementById('emi-form-paid').value) || 0;
        const totalCount = parseInt(document.getElementById('emi-form-total').value);
        
        if (!reason || !firstEmiDate || !totalCount) {
            window.Toast.error('Please fill all required fields');
            return;
        }
        
        if (paidCount > totalCount) {
            window.Toast.error('Paid EMIs cannot exceed total EMIs');
            return;
        }
        
        if (!card.emis) {
            card.emis = [];
        }
        
        if (emiId) {
            // Update existing
            const emi = card.emis.find(e => e.id === emiId);
            if (emi) {
                emi.reason = reason;
                emi.firstEmiDate = firstEmiDate;
                emi.emiAmount = emiAmount;
                emi.date = firstEmiDate; // Keep for backward compatibility
                emi.paidCount = paidCount;
                emi.totalCount = totalCount;
                emi.completed = paidCount >= totalCount;
            }
        } else {
            // Add new
            card.emis.push({
                id: Utils.generateId().toString(),
                reason,
                firstEmiDate,
                emiAmount,
                date: firstEmiDate, // Keep for backward compatibility
                paidCount,
                totalCount,
                completed: false,
                createdAt: Utils.getCurrentTimestamp()
            });
        }
        
        window.Storage.save();
        this.renderEMIs(cardId);
        this.render(); // Update card count
        document.getElementById('emi-form-modal').classList.add('hidden');
        window.Toast.success(emiId ? 'EMI updated!' : 'EMI added!');
    },

    /**
     * Edit EMI
     */
    editEMI(cardId, emiId) {
        this.openEMIForm(cardId, emiId);
    },

    /**
     * Mark EMI as complete
     */
    markEMIComplete(cardId, emiId) {
        const card = this.getById(cardId);
        if (!card || !card.emis) return;
        
        const emi = card.emis.find(e => e.id === emiId);
        if (emi) {
            emi.completed = true;
            emi.paidCount = emi.totalCount;
            window.Storage.save();
            this.renderEMIs(cardId);
            this.render(); // Update card count
            window.Toast.success('EMI marked as complete!');
        }
    },

    /**
     * Delete EMI
     */
    async deleteEMI(cardId, emiId) {
        const confirmed = await window.Utils.confirm(
            'Delete this EMI? This action cannot be undone.',
            'Delete EMI'
        );
        if (!confirmed) return;
        
        const card = this.getById(cardId);
        if (!card || !card.emis) return;
        
        card.emis = card.emis.filter(e => e.id !== emiId);
        window.Storage.save();
        this.renderEMIs(cardId);
        this.render(); // Update card count
        window.Toast.success('EMI deleted!');
    },

    /**
     * Auto-add EMI payments to expenses for current and past months
     * Called when expenses page loads
     */
    autoAddEMIExpenses() {
        if (!window.DB.cards || !window.Expenses) return;
        
        const today = new Date();
        let addedCount = 0;
        
        window.DB.cards.forEach(card => {
            if (!card.emis || card.emis.length === 0) return;
            
            card.emis.forEach(emi => {
                if (!emi.firstEmiDate || emi.completed || !emi.emiAmount) return;
                
                // Initialize tracking array if not exists
                if (!emi.addedToExpenses) {
                    emi.addedToExpenses = [];
                }
                
                const firstDate = new Date(emi.firstEmiDate);
                
                // Calculate which EMI months should have been paid by now
                let monthsElapsed = (today.getFullYear() - firstDate.getFullYear()) * 12 
                                  + (today.getMonth() - firstDate.getMonth());
                
                // If current date hasn't reached the EMI day this month, subtract 1
                if (today.getDate() < firstDate.getDate()) {
                    monthsElapsed--;
                }
                
                // Loop through each month that should have an EMI payment
                for (let i = 0; i <= Math.min(monthsElapsed, emi.totalCount - 1); i++) {
                    const emiDate = new Date(firstDate);
                    emiDate.setMonth(emiDate.getMonth() + i);
                    
                    const emiMonthKey = `${emiDate.getFullYear()}-${String(emiDate.getMonth() + 1).padStart(2, '0')}`;
                    
                    // Skip if already added for this month
                    if (emi.addedToExpenses.includes(emiMonthKey)) {
                        continue;
                    }
                    
                    // Create the EMI date (use the day from firstEmiDate)
                    const expenseDate = new Date(emiDate.getFullYear(), emiDate.getMonth(), firstDate.getDate());
                    const expenseDateStr = Utils.formatLocalDate(expenseDate);
                    
                    const emiTitle = `Card EMI: ${emi.reason}`;
                    
                    // Check if dismissed by user
                    const isDismissed = window.Expenses && window.Expenses.isDismissed(emiTitle, expenseDateStr, parseFloat(emi.emiAmount));
                    
                    if (isDismissed) {
                        continue;
                    }
                    
                    // Check if expense already exists for this EMI and month (check old and new formats)
                    const existingExpense = window.DB.expenses.find(exp => {
                        const titleMatch = exp.title === emiTitle || 
                                          exp.title === `EMI: ${emi.reason}` ||
                                          exp.title === `EMI: ${card.name} - ${emi.reason}`;
                        const dateMatch = exp.date === expenseDateStr;
                        const amountMatch = exp.amount === parseFloat(emi.emiAmount);
                        return titleMatch && dateMatch && amountMatch;
                    });
                    
                    if (!existingExpense) {
                        // Add as expense
                        try {
                            window.Expenses.add(
                                emiTitle,
                                emi.emiAmount,
                                'emi',
                                expenseDateStr,
                                `Auto-added EMI payment ${i + 1}/${emi.totalCount} for ${card.name}`,
                                card.name
                            );
                            
                            // Mark this month as added
                            emi.addedToExpenses.push(emiMonthKey);
                            addedCount++;
                        } catch (error) {
                            console.error('Failed to add EMI expense:', error);
                        }
                    } else {
                        // Mark as added even if it already exists (manual entry)
                        emi.addedToExpenses.push(emiMonthKey);
                    }
                }
            });
        });
        
        // Save if any EMIs were updated
        if (addedCount > 0) {
            window.Storage.save();
        }
        
        return addedCount;
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Cards = Cards;
}
