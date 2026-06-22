/**
 * Cards Module
 * Handles credit card information management
 */

const Cards = {
    currentTab: 'credit', // Track current tab: 'credit' or 'debit'
    currentEMITabs: {}, // Track current tab for each card's EMI modal: {cardId: 'active' or 'completed'}
    
    /**
     * One-time data integrity check for window.DB.cardBills.
     * Ensures every record has an `id` (so find-by-id works) and that
     * `cardId` is a string. Without this, legacy bills (especially after
     * a backup-restore) silently fall through and can never be marked paid.
     */
    migrateCardBills() {
        const bills = window.DB && window.DB.cardBills;
        if (!Array.isArray(bills) || bills.length === 0) return;
        let changed = false;
        const seenIds = new Set();
        for (const b of bills) {
            if (!b || typeof b !== 'object') continue;
            // Generate id if missing or duplicate
            if (b.id == null || b.id === '' || seenIds.has(String(b.id))) {
                b.id = (window.Utils && typeof window.Utils.generateId === 'function')
                    ? window.Utils.generateId()
                    : 'bill_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
                changed = true;
            }
            seenIds.add(String(b.id));
            // Normalise cardId to string for consistent lookups
            if (b.cardId != null && typeof b.cardId !== 'string') {
                b.cardId = String(b.cardId);
                changed = true;
            }
            // Coerce amounts to numbers (legacy SMS sync sometimes stored strings)
            if (b.amount != null && typeof b.amount !== 'number') {
                const n = parseFloat(String(b.amount).replace(/[₹,\s]/g, ''));
                b.amount = isNaN(n) ? 0 : n;
                changed = true;
            }
            if (b.paidAmount != null && typeof b.paidAmount !== 'number') {
                const n = parseFloat(String(b.paidAmount).replace(/[₹,\s]/g, ''));
                b.paidAmount = isNaN(n) ? 0 : n;
                changed = true;
            }
        }
        if (changed && window.Storage && typeof window.Storage.save === 'function') {
            window.Storage.save();
            console.log('🛠 Cards.migrateCardBills: fixed up cardBills data');
        }
    },
    
    /**
     * Auto-update EMI progress based on elapsed months
     * @param {Object} emi - The EMI object to update
     * @returns {boolean} - Whether the EMI was updated
     */
    updateEMIProgress(emi) {
        if (!emi.firstEmiDate || emi.completed) {
            return false;
        }
        
        const today = new Date();
        const firstDate = new Date(emi.firstEmiDate);
        let monthsElapsed = (today.getFullYear() - firstDate.getFullYear()) * 12 
                          + (today.getMonth() - firstDate.getMonth());
        
        // If current date hasn't reached the EMI day this month, subtract 1
        if (today.getDate() < firstDate.getDate()) {
            monthsElapsed--;
        }
        
        // Calculate actual paid EMIs (first EMI is paid on the first date itself)
        const actualPaidEMIs = Math.max(0, monthsElapsed + 1);
        
        let dataChanged = false;
        
        // Update paidCount to reflect actual progress
        if (emi.paidCount !== actualPaidEMIs) {
            emi.paidCount = Math.min(actualPaidEMIs, emi.totalCount);
            dataChanged = true;
        }
        
        // If all EMIs should have been paid by now, mark as completed
        if (actualPaidEMIs >= emi.totalCount) {
            emi.completed = true;
            emi.paidCount = emi.totalCount;
            dataChanged = true;
        }
        
        return dataChanged;
    },
    
    /**
     * Add a new card (fetches benefits automatically for credit cards)
     */
    async add(name, cardNumber, expiry, cvv, additionalData = '', creditLimit = '', cardType = 'credit', outstanding = '', statementDate = '', billDate = '') {
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
            outstanding: (cardType === 'credit' && outstanding) ? parseFloat(outstanding.replace(/[₹,\s]/g, '')) || 0 : 0,
            statementDate: (cardType === 'credit' && statementDate) ? parseInt(statementDate) : null,
            billDate: (cardType === 'credit' && billDate) ? parseInt(billDate) : null,
            cardGroup: null, // Group ID for linked cards (same billing account)
            isPlaceholder: false,
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
    // Tracks in-flight benefit fetches per card to prevent duplicate concurrent calls
    _benefitsFetchesInFlight: new Set(),

    // When true, per-card success/error toasts are suppressed so the bulk runner
    // can show one consolidated summary at the end of the batch.
    _suppressBenefitToasts: false,

    // Benefits older than this are considered stale — banks revise reward terms
    // a few times per year, so 180 days is a reasonable refresh cadence.
    BENEFITS_STALE_DAYS: 180,

    /**
     * Check how stale a card's benefits are.
     * Returns { hasBenefits, ageDays, isStale, label } where:
     *  - hasBenefits: false → no benefits fetched yet
     *  - ageDays: integer days since last fetch (0 if never)
     *  - isStale: true when ageDays exceeds BENEFITS_STALE_DAYS
     *  - label: short human-readable freshness label ("Fresh", "5 mo old", etc.)
     */
    getBenefitsFreshness(card) {
        if (!card || !card.benefits || !card.benefitsFetchedAt) {
            return { hasBenefits: false, ageDays: 0, isStale: false, label: 'Not fetched' };
        }
        const ageMs = Date.now() - new Date(card.benefitsFetchedAt).getTime();
        const ageDays = Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
        const isStale = ageDays > this.BENEFITS_STALE_DAYS;
        let label;
        if (ageDays < 30) label = `${ageDays}d old`;
        else if (ageDays < 365) label = `${Math.floor(ageDays / 30)} mo old`;
        else label = `${Math.floor(ageDays / 365)}y+ old`;
        return { hasBenefits: true, ageDays, isStale, label };
    },

    async fetchAndStoreBenefits(cardId, cardName, showLoading = true) {
        const cardKey = String(cardId);

        // Concurrency guard: ignore duplicate clicks while a fetch is already running for this card
        if (this._benefitsFetchesInFlight.has(cardKey)) {
            console.warn(`Benefits fetch already in progress for card ${cardKey}; ignoring duplicate request.`);
            if (showLoading && window.Utils) {
                window.Utils.showInfo('⏳ Update already in progress for this card');
            }
            return;
        }
        this._benefitsFetchesInFlight.add(cardKey);

        // Suppress AIProvider info messages if using progress modal
        if (showLoading && window.AIProvider) {
            window.AIProvider.suppressInfoMessages = true;
        }

        try {
            // Show progress modal
            if (showLoading) {
                Utils.showProgressModal(`💳 Fetching benefits for ${cardName}...<br><span class="text-sm text-gray-600">Searching official bank website</span>`, true);
            }

            // Check if AI is configured
            if (!window.AIProvider || !window.AIProvider.isConfigured()) {
                console.warn('AI not configured, skipping benefits fetch');
                if (showLoading) {
                    Utils.showProgressError(`❌ AI not configured<br><span class="text-sm text-gray-300">Please configure AI in settings</span>`);
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
- Use bold (**text**) for emphasis on offer names and reward rates/percentages
- Do NOT manually bold ₹ amounts — the app highlights them automatically
- Keep lines short for mobile readability
- Use clear section headings (### Heading), with a BLANK LINE before each heading so it renders correctly
- ABSOLUTELY NO LaTeX: no $...$ math mode, no \\text{}, no \\times, no \\$
- For multiplication use "×" or "x", NOT \\times or $\\times$
- Write as plain text/Markdown only
- A benefit may span more than one line when caps/exclusions need it — completeness wins over brevity here

6. CURRENCY RULES (CRITICAL):
- ALL amounts must be in Indian Rupees (₹) ONLY
- Never use $ or dollars - this is for INDIAN credit cards
- Example: ₹100, ₹1,000, ₹50 cashback

7. SOURCE VERIFICATION:
- Use ONLY official bank sources as the source of truth
- If specific benefit not found on official site, don't make it up
- But be thorough - check rewards page, terms & conditions, feature highlights

8. SOURCES SECTION (MANDATORY):
- End the response with a "### Sources" section listing the official bank URL(s) you used
- Format each source as: "- [Page name](https://...)" (use plain markdown links)
- This lets the user verify the data and re-check whenever the bank updates terms
- If no usable official source was found, say so explicitly: "Could not locate official source for ${cardName}"

9. CARD NOT FOUND HANDLING:
- If the card "${cardName}" cannot be found on any official bank website (possibly discontinued
  or renamed), respond with EXACTLY this short message and nothing else:
  "### Card Not Found\\n\\nCould not locate \\"${cardName}\\" on any official bank website. It may
  have been discontinued or renamed. Please check the card name and try again, or update it
  manually using the Notes field."
- Do NOT invent or substitute benefits from a similar-sounding card.`;
            
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
                // Sanity check: a real benefits payload covers many categories and
                // is typically several thousand chars. If the response is suspiciously
                // short (web search miss, provider hiccup), refuse to overwrite a
                // previously good version — this prevents losing accurate data to a
                // transient failure.
                const MIN_BENEFITS_LENGTH = 200;
                const benefitsTrim = (benefits || '').trim();
                const tooShort = benefitsTrim.length < MIN_BENEFITS_LENGTH;
                const hadGoodVersion = card.benefits && card.benefits.length >= MIN_BENEFITS_LENGTH;

                if (tooShort && hadGoodVersion) {
                    console.warn(`Discarding short benefits response (${benefitsTrim.length} chars) for ${cardName} — keeping previous version.`);
                    if (showLoading) {
                        Utils.showProgressError(`⚠️ Update incomplete<br><span class="text-sm text-gray-300">Web search returned too little data; keeping your previous benefits. Try again in a moment.</span>`);
                    } else if (window.Utils && !this._suppressBenefitToasts) {
                        Utils.showError(`Update incomplete for ${cardName} — kept previous version`);
                    }
                    return;
                }

                if (tooShort && !hadGoodVersion) {
                    // No previous version to fall back on — store but warn the user
                    console.warn(`Storing minimal benefits (${benefitsTrim.length} chars) for ${cardName} as initial version.`);
                }

                card.benefits = benefitsTrim;
                card.benefitsFetchedAt = Utils.getCurrentTimestamp();
                window.Storage.save();

                // Refresh UI if on cards view
                if (document.getElementById('cards-view') &&
                    !document.getElementById('cards-view').classList.contains('hidden')) {
                    this.render();
                }

                console.log(`✅ Benefits fetched for ${cardName} (${benefitsTrim.length} chars)`);
                if (showLoading) {
                    Utils.showProgressSuccess(`✅ Benefits loaded!<br><span class="text-sm text-gray-600">${cardName} benefits updated</span>`, true);
                } else if (window.Utils && !this._suppressBenefitToasts) {
                    Utils.showSuccess(`Card benefits loaded for ${cardName}`);
                }
            }
        } catch (error) {
            console.error(`Failed to fetch benefits for ${cardName}:`, error);

            // Show error in progress modal or regular error
            if (showLoading) {
                Utils.showProgressError(`❌ Failed to fetch benefits<br><span class="text-sm text-gray-300">${error.message}</span>`);
            } else if (window.Utils && !this._suppressBenefitToasts) {
                Utils.showError(`Failed to fetch benefits for ${cardName}`);
            }
        } finally {
            // Re-enable AIProvider info messages
            if (showLoading && window.AIProvider) {
                window.AIProvider.suppressInfoMessages = false;
            }
            // Release the concurrency lock for this card
            this._benefitsFetchesInFlight.delete(cardKey);
        }
    },

    /**
     * Tapped the Terms button on a card that has no benefits yet. Explain the
     * next step instead of doing nothing: configure AI, or hit Update to fetch.
     */
    promptEnableAIForBenefits(cardId) {
        const aiReady = window.AIProvider && window.AIProvider.isConfigured();
        if (aiReady) {
            window.Utils.showInfo('No benefits yet — tap “Update” to fetch this card’s reward terms.');
        } else {
            window.Utils.showInfo('Enable AI in Settings to fetch card benefits, then tap “Update”.');
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
            // Use progress modal for status updates
            await this.fetchAndStoreBenefits(cardId, card.name, true);

            // Re-render to show View button now enabled
            this.render();
        } finally {
            // Restore button state
            if (btn && btnText) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-wait');
                btnText.textContent = 'Update';
            }
        }
    },

    /**
     * Update a card
     */
    async update(id, name, cardNumber, expiry, cvv, additionalData = '', creditLimit = '', cardType = 'credit', outstanding = undefined, statementDate = '', billDate = '') {
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
        // Preserve outstanding if not provided (undefined), otherwise update it
        if (outstanding !== undefined) {
            card.outstanding = (cardType === 'credit' && outstanding) ? parseFloat(outstanding.toString().replace(/[₹,\s]/g, '')) || 0 : 0;
        } // else preserve existing card.outstanding
        card.statementDate = (cardType === 'credit' && statementDate) ? parseInt(statementDate) : null;
        card.billDate = (cardType === 'credit' && billDate) ? parseInt(billDate) : null;
        card.additionalData = additionalData || '';
        card.lastUpdated = Utils.getCurrentTimestamp();
        
        // Save to storage
        window.Storage.save();
        
        // Only re-fetch benefits if card name changed AND it's a credit card.
        // showLoading=true gives the user a visible progress modal so they
        // know the rules are being re-fetched (and don't think the edit failed).
        if (nameChanged && card.cardType === 'credit') {
            this.fetchAndStoreBenefits(card.id, name, true).catch(err => {
                console.error('Failed to fetch benefits for updated card:', err);
            });
        }
        
        return card;
    },

    /**
     * Delete a card
     */
    delete(id) {
        const idStr = String(id);
        window.DB.cards = window.DB.cards.filter(c => String(c.id) !== idStr);
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
        this.render();
    },
    
    /**
     * Show card details in a view-only modal
     */
    showDetailsModal(cardId) {
        const card = window.DB.cards.find(c => c.id === cardId || String(c.id) === String(cardId));
        if (!card) {
            Utils.showError('Card not found');
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
     * Show simple card summary modal (for expense details view)
     */
    showCardSummaryModal(cardId) {
        const card = window.DB.cards.find(c => c.id === cardId || String(c.id) === String(cardId));
        if (!card) {
            Utils.showError('Card not found');
            return;
        }
        
        const isCredit = card.cardType === 'credit' || !card.cardType;
        const outstanding = parseFloat(card.outstanding) || 0;
        const creditLimit = parseFloat(card.creditLimit) || 0;
        const available = creditLimit - outstanding;
        
        // Get latest bill info
        const bills = window.DB.cardBills?.filter(b => String(b.cardId) === String(cardId)) || [];
        const latestBill = bills.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
        const billAmount = latestBill ? parseFloat(latestBill.amount) || 0 : 0;
        const billPaid = latestBill?.isPaid || false;
        
        const modalHtml = `
            <div id="card-summary-modal" class="fixed inset-0 bg-black bg-opacity-50 z-[10002] flex items-end justify-center" onclick="if(event.target===this) this.remove()">
                <div class="bg-white rounded-t-2xl w-full max-w-lg animate-slide-up">
                    <!-- Header -->
                    <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <h3 class="text-lg font-semibold text-gray-800">💳 Card Details</h3>
                        <button onclick="document.getElementById('card-summary-modal').remove()" class="p-2 hover:bg-gray-100 rounded-full">
                            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    
                    <!-- Card Visual -->
                    <div class="p-4">
                        <div class="p-4 bg-gradient-to-br ${isCredit ? 'from-indigo-600 to-purple-700' : 'from-teal-600 to-emerald-700'} rounded-xl text-white shadow-lg">
                            <div class="flex justify-between items-start mb-4">
                                <h4 class="font-bold text-lg">${Utils.escapeHtml(card.name)}</h4>
                                <span class="text-xs bg-white bg-opacity-20 px-2 py-1 rounded">${isCredit ? 'Credit' : 'Debit'}</span>
                            </div>
                            <p class="font-mono text-lg tracking-wider mb-4">${this.maskCardNumber(card.cardNumber)}</p>
                            <div class="flex justify-between text-sm opacity-90">
                                <span>Expiry: ${Utils.escapeHtml(card.expiry)}</span>
                            </div>
                        </div>
                    </div>
                    
                    ${isCredit ? `
                    <!-- Financial Details -->
                    <div class="px-4 pb-4 space-y-3">
                        <div class="grid grid-cols-2 gap-3">
                            <div class="bg-gray-50 rounded-lg p-3 text-center">
                                <p class="text-xs text-gray-500 mb-1">Credit Limit</p>
                                <p class="text-lg font-bold text-gray-800">₹${Utils.formatIndianNumber(creditLimit)}</p>
                            </div>
                            <div class="bg-gray-50 rounded-lg p-3 text-center">
                                <p class="text-xs text-gray-500 mb-1">Available</p>
                                <p class="text-lg font-bold ${available >= 0 ? 'text-green-600' : 'text-red-600'}">₹${Utils.formatIndianNumber(available)}</p>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div class="bg-orange-50 rounded-lg p-3 text-center">
                                <p class="text-xs text-orange-600 mb-1">Outstanding</p>
                                <p class="text-lg font-bold text-orange-700">₹${Utils.formatIndianNumber(outstanding)}</p>
                            </div>
                            <div class="bg-blue-50 rounded-lg p-3 text-center">
                                <p class="text-xs text-blue-600 mb-1">Latest Bill</p>
                                <p class="text-lg font-bold text-blue-700">₹${Utils.formatIndianNumber(billAmount)}</p>
                                ${billPaid ? '<span class="text-xs text-green-600">✓ Paid</span>' : billAmount > 0 ? '<span class="text-xs text-red-600">Unpaid</span>' : ''}
                            </div>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existing = document.getElementById('card-summary-modal');
        if (existing) existing.remove();
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    /**
     * Show specific EMI details in a modal (called from expenses page)
     */
    showEMIDetailsModal(cardName, emiReason) {
        // Find the card
        const card = window.DB.cards.find(c => c.name === cardName || cardName.includes(c.name) || c.name.includes(cardName));
        if (!card) {
            Utils.showError('Card not found');
            return;
        }

        // Find the specific EMI
        const emi = card.emis?.find(e => e.reason === emiReason);
        if (!emi) {
            Utils.showError('EMI not found');
            return;
        }

        // Auto-update EMI progress based on elapsed months
        if (this.updateEMIProgress(emi)) {
            window.Storage.save();
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
                        ${window.AIRenderer ? window.AIRenderer.toHtml(card.benefits, { compact: true }) : `<div class="text-xs text-slate-700 leading-relaxed">${Utils.escapeHtml(card.benefits)}</div>`}
                    </div>
                </div>
                ` : ''}
                ` : ''}
            </div>
        `;
    },
    
    // Track expanded bank groups (collapsed by default)
    expandedBankGroups: new Set(),
    
    // Store custom bank group order
    getBankGroupOrder() {
        return window.DB.bankGroupOrder || [];
    },
    
    saveBankGroupOrder(order) {
        window.DB.bankGroupOrder = order;
        window.Storage.save();
    },
    
    toggleBankGroup(bankName) {
        if (this.expandedBankGroups.has(bankName)) {
            this.expandedBankGroups.delete(bankName);
        } else {
            this.expandedBankGroups.add(bankName);
        }
        this.render();
    },
    
    moveBankGroup(bankName, direction) {
        const order = this.getBankGroupOrder();
        const idx = order.indexOf(bankName);
        if (idx === -1) return;
        
        const newIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= order.length) return;
        
        // Swap
        [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
        this.saveBankGroupOrder(order);
        this.render();
    },
    
    render() {
        const list = document.getElementById('cards-list');
        
        if (!list) return;
        
        // Filter cards by current tab - separate real and placeholder cards
        const allCards = window.DB.cards.filter(card => {
            const cardType = card.cardType || 'credit';
            return cardType === this.currentTab;
        });
        const realCards = allCards.filter(c => !c.isPlaceholder);
        const placeholderCards = allCards.filter(c => c.isPlaceholder);
        const filteredCards = [...realCards, ...placeholderCards];
        
        // Summary card for credit cards tab
        let summaryHtml = '';
        if (this.currentTab === 'credit') {
            summaryHtml = this.renderSummaryCard();
        }
        
        if (filteredCards.length === 0) {
            const cardTypeName = this.currentTab === 'credit' ? 'credit' : 'debit';
            list.innerHTML = summaryHtml + `<p class="text-gray-500 text-center py-8">No ${cardTypeName} cards yet. Add your first one above!</p>`;
            return;
        }
        
        // Group cards by first word of name (bank name)
        const bankGroups = {};
        filteredCards.forEach(card => {
            const firstWord = (card.name || 'Other').split(' ')[0].toUpperCase();
            if (!bankGroups[firstWord]) {
                bankGroups[firstWord] = [];
            }
            bankGroups[firstWord].push(card);
        });
        
        // Sort cards within each group: primary cards first, then by name
        Object.keys(bankGroups).forEach(bank => {
            bankGroups[bank].sort((a, b) => {
                const aIsPrimary = this.isPrimaryCard(a.id);
                const bIsPrimary = this.isPrimaryCard(b.id);
                if (aIsPrimary && !bIsPrimary) return -1;
                if (!aIsPrimary && bIsPrimary) return 1;
                return a.name.localeCompare(b.name);
            });
        });
        
        // Get ordered bank names (use saved order, add new banks at end)
        let savedOrder = this.getBankGroupOrder();
        const allBanks = Object.keys(bankGroups);
        
        // Add any new banks to the order
        allBanks.forEach(bank => {
            if (!savedOrder.includes(bank)) {
                savedOrder.push(bank);
            }
        });
        
        // Remove banks that no longer exist
        savedOrder = savedOrder.filter(bank => allBanks.includes(bank));
        this.saveBankGroupOrder(savedOrder);
        
        // Render grouped cards
        const isCreditTab = this.currentTab === 'credit';
        const groupsHtml = savedOrder.map((bankName, groupIndex) => {
            const cards = bankGroups[bankName];
            if (!cards || cards.length === 0) return '';
            
            const isExpanded = this.expandedBankGroups.has(bankName);
            const cardCount = cards.length;
            
            // Per-bank totals (credit tab only): outstanding across all cards in
            // this bank, plus a count of unpaid bills so the user can see at a
            // glance whether anything still needs attention without expanding.
            let bankOutstanding = 0;
            let bankUnpaidBillCount = 0;
            if (isCreditTab) {
                const billsByCard = (window.DB.cardBills || []);
                cards.forEach(card => {
                    if (card.isPlaceholder) return;
                    const os = parseFloat(String(card.outstanding).replace(/[₹,\s]/g, '')) || 0;
                    bankOutstanding += os;
                    bankUnpaidBillCount += billsByCard.filter(b =>
                        String(b.cardId) === String(card.id) && !b.isPaid
                    ).length;
                });
            }
            
            const cardsInGroupHtml = cards.map(card => this.renderSingleCard(card)).join('');
            
            return `
            <div class="mb-3 bg-white rounded-xl border border-slate-300 overflow-hidden shadow-sm">
                <!-- Bank Group Header -->
                <div class="flex items-center justify-between bg-gradient-to-r from-slate-200 to-slate-300 px-3 py-2.5 cursor-pointer hover:from-slate-300 hover:to-slate-400 transition-all"
                     onclick="Cards.toggleBankGroup('${bankName}')">
                    <div class="flex items-center gap-2 min-w-0">
                        <svg class="w-4 h-4 text-slate-600 transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                        <span class="font-bold text-slate-700 truncate">${Utils.escapeHtml(bankName)}</span>
                        <span class="text-xs text-white bg-slate-500 px-2 py-0.5 rounded-full font-medium shrink-0">${cardCount}</span>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        ${isCreditTab ? `
                        <span class="text-xs font-bold ${bankOutstanding > 0 ? 'text-slate-800' : 'text-slate-400'}" title="Total outstanding across ${cardCount} card(s) in ${Utils.escapeHtml(bankName)}${bankUnpaidBillCount > 0 ? ` • ${bankUnpaidBillCount} unpaid bill(s)` : ''}" style="font-variant-numeric: tabular-nums;">
                            O/S ₹${Utils.formatIndianNumber(bankOutstanding)}${bankUnpaidBillCount > 0 ? ` <span class="text-[10px] font-medium text-slate-500">· ${bankUnpaidBillCount} unpaid</span>` : ''}
                        </span>
                        ` : ''}
                        <div class="flex items-center gap-1" onclick="event.stopPropagation()">
                            ${groupIndex > 0 ? `
                            <button onclick="Cards.moveBankGroup('${bankName}', 'up')" class="p-1 text-slate-500 hover:text-slate-700 hover:bg-white hover:bg-opacity-50 rounded" title="Move up">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>
                            </button>
                            ` : ''}
                            ${groupIndex < savedOrder.length - 1 ? `
                            <button onclick="Cards.moveBankGroup('${bankName}', 'down')" class="p-1 text-slate-500 hover:text-slate-700 hover:bg-white hover:bg-opacity-50 rounded" title="Move down">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                            </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
                <!-- Cards in Group -->
                <div class="${isExpanded ? '' : 'hidden'} p-3 space-y-3 bg-slate-50">
                    ${cardsInGroupHtml}
                </div>
            </div>
            `;
        }).join('');
        
        list.innerHTML = summaryHtml + groupsHtml;
    },
    
    /**
     * Render a single card
     */
    renderSingleCard(card) {
        const isCredit = card.cardType === 'credit' || !card.cardType;
        const isPlaceholder = card.isPlaceholder;
        const cardIdStr = String(card.id);
        
        // Check if card is in a group
        const cardGroup = this.getCardGroup(cardIdStr);
        const isPrimary = cardGroup && String(cardGroup.primaryCardId) === cardIdStr;
        const isInGroup = !!cardGroup;
        const primaryCard = cardGroup ? this.getById(cardGroup.primaryCardId) : null;
        
        // Get bills for this card (or primary card if in group and not primary)
        let billCardId = cardIdStr;
        if (isInGroup && !isPrimary && cardGroup.shareBill && primaryCard) {
            billCardId = String(cardGroup.primaryCardId); // Use primary card's bills
        }
        const cardBills = window.DB.cardBills ? window.DB.cardBills.filter(b => String(b.cardId) === billCardId) : [];
            
            // Sort bills by due date (newest first) without mutating original array
            const sortedBills = [...cardBills].sort((a, b) => new Date(b.dueDate || b.parsedAt || 0) - new Date(a.dueDate || a.parsedAt || 0));
            
            // Get the most recent unpaid bill (this is what we show in the UI)
            const unpaidBill = sortedBills.find(b => !b.isPaid);
            const unpaidBillId = unpaidBill ? String(unpaidBill.id) : '';
            
            // Get the latest bill by due date (for showing paid status if no unpaid bills)
            const latestBill = sortedBills[0];
            const latestBillIsPaid = latestBill && latestBill.isPaid && !unpaidBill;
            
            // Card styling
            const cardBg = isPlaceholder 
                ? 'background: #f3f4f6; border-style: dashed;' 
                : 'background-image: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 25%, #e0e7ff 50%, #ddd6f3 75%, #faaca8 100%);';
            
            // Check if there's a bill that needs to be paid (amount > 0 and not paid)
            const hasBillToPay = unpaidBill && unpaidBill.amount > 0 && !unpaidBill.isPaid;
            const outstandingAmt = parseFloat(String(card.outstanding).replace(/[₹,\s]/g, '')) || 0;
            
            // Stale-bill detection: more than one unpaid bill on this card means
            // there are leftovers from the old SMS sync still hanging around.
            const unpaidBillsForCard = cardBills.filter(b => !b.isPaid);
            const staleUnpaidCount = Math.max(0, unpaidBillsForCard.length - 1);
            
            // Check if bill is paid (for showing green tick)
            const billIsPaid = unpaidBill && unpaidBill.isPaid;
            const latestPaidBill = cardBills.find(b => b.isPaid);
            const showPaidTick = !hasBillToPay && latestPaidBill;
            
            return `
            <div class="p-4 rounded-xl border-2 border-slate-300 hover:shadow-2xl hover:border-purple-300 transition-all duration-300 relative" data-card-id="${cardIdStr}" style="${cardBg}">
                ${isPlaceholder ? '<span class="text-[10px] bg-gray-500 text-white px-2 py-0.5 rounded-full mb-2 inline-block">Unlinked Card</span>' : ''}
                ${isInGroup ? `<span class="absolute -top-2 -right-2 text-xs ${isPrimary ? 'bg-indigo-500' : 'bg-indigo-400'} text-white w-6 h-6 rounded-full shadow-sm flex items-center justify-center cursor-pointer" title="${cardGroup.name}${isPrimary ? ' (Primary)' : ''}" onclick="event.stopPropagation(); Cards.showGroupsModal()">${isPrimary ? '⭐' : '🔗'}</span>` : ''}
                
                <!-- Line 1: Card Name + Paid status (left) | Actions (right) -->
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-2">
                        <h4 class="font-bold text-slate-800 text-sm">${Utils.escapeHtml(card.name)}</h4>
                        ${isCredit && !isPlaceholder ? `
                            ${hasBillToPay ? `
                                <button onclick="Cards.showMarkPaidOptions('${unpaidBillId}', '${cardIdStr}')" 
                                        class="text-[10px] bg-green-100 hover:bg-green-200 text-green-700 font-medium px-2 py-0.5 rounded transition-colors">
                                    Paid ?
                                </button>
                            ` : showPaidTick && outstandingAmt > 0 ? `
                                <span class="flex items-center gap-1">
                                    <span class="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center" title="Bill Paid">
                                        <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                                        </svg>
                                    </span>
                                    <button onclick="Cards.showPayOutstandingOptions('${cardIdStr}')" 
                                            class="text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium px-2 py-0.5 rounded transition-colors">
                                        Pay More
                                    </button>
                                </span>
                            ` : showPaidTick ? `
                                <span class="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center" title="Bill Paid">
                                    <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                                    </svg>
                                </span>
                            ` : outstandingAmt > 0 ? `
                                <button onclick="Cards.showPayOutstandingOptions('${cardIdStr}')" 
                                        class="text-[10px] bg-orange-100 hover:bg-orange-200 text-orange-700 font-medium px-2 py-0.5 rounded transition-colors">
                                    Pay O/S
                                </button>
                            ` : ''}
                        ` : ''}
                    </div>
                    <div class="flex gap-1">
                        ${!isPlaceholder ? `
                        <button onclick="Cards.toggleCardDetailsSecure('${cardIdStr}')" class="text-indigo-600 hover:text-indigo-800 p-0.5" title="Show/Hide card details">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                            </svg>
                        </button>
                        <button onclick="Cards.editCardSecure('${cardIdStr}')" class="text-purple-600 hover:text-purple-800 p-0.5" title="Edit Card">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>
                        ` : ''}
                        <button onclick="Cards.deleteCardSecure('${cardIdStr}')" class="text-red-500 hover:text-red-700 p-0.5" title="Delete">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <!-- Lines 2-4: Left content | Right aligned financial info -->
                <div class="flex justify-between mt-1">
                    <!-- Left column -->
                    <div class="flex-1">
                        <div class="text-sm text-slate-700 font-mono font-semibold" id="card-num-${cardIdStr}">${this.maskCardNumber(card.cardNumber)}</div>
                        ${!isPlaceholder ? `
                        <div class="flex items-center gap-2 text-xs text-slate-500 mt-1">
                            <span>Exp: ${Utils.escapeHtml(card.expiry)}</span>
                            <span>CVV: <span id="card-cvv-${cardIdStr}">•••</span></span>
                        </div>
                        <div class="text-xs text-slate-600 truncate mt-1">
                            ${card.additionalData ? Utils.escapeHtml(card.additionalData) : '&nbsp;'}
                        </div>
                        ${isCredit ? `
                        <div class="flex items-center gap-2 text-xs text-slate-500 mt-1">
                            <span>${card.statementDate ? `Statement: Day ${card.statementDate}` : (latestBill && latestBill.parsedAt ? `Billed: ${new Date(latestBill.parsedAt).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})}` : '')}</span>
                            <button onclick="Cards.showBillsManager('${billCardId}')" class="text-[10px] bg-purple-100 hover:bg-purple-200 text-purple-700 font-medium px-2 py-0.5 rounded inline-flex items-center gap-1" title="Manage all bills for this card">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                                Bills${cardBills.length > 0 ? ` (${cardBills.length})` : ''}
                            </button>
                        </div>
                        ` : ''}
                        ` : ''}
                    </div>
                    
                    <!-- Right column: Aligned financial info -->
                    ${isCredit && !isPlaceholder ? `
                    <div class="text-xs shrink-0" style="font-variant-numeric: tabular-nums;">
                        <table class="ml-auto" style="border-collapse: separate; border-spacing: 0 4px;">
                            ${card.creditLimit ? `
                            <tr>
                                <td class="text-slate-500 text-right pr-1">Limit:</td>
                                <td class="text-slate-600 font-semibold text-right">₹${Utils.formatIndianNumber(card.creditLimit)}</td>
                                <td style="width: 16px;"></td>
                            </tr>
                            ` : ''}
                            ${unpaidBill ? `
                            <tr>
                                <td class="text-slate-500 text-right pr-1">Bill:</td>
                                <td class="font-bold text-slate-800 text-right">₹${Utils.formatIndianNumber(unpaidBill.amount)}</td>
                                <td class="pl-1"><button onclick="Cards.showEditBillModal('${unpaidBillId}', '${cardIdStr}')" class="text-blue-500 hover:text-blue-700" title="Edit bill">✎</button></td>
                            </tr>
                            ${staleUnpaidCount > 0 ? `
                            <tr>
                                <td colspan="3" class="text-right">
                                    <button onclick="Cards.confirmClearStaleBills('${billCardId}', '${unpaidBillId}')" class="text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-700 font-medium px-2 py-0.5 rounded mt-0.5" title="Clear ${staleUnpaidCount} duplicate/stale unpaid bill(s) from old SMS sync">
                                        ⚠ ${staleUnpaidCount} stale — clear
                                    </button>
                                </td>
                            </tr>
                            ` : ''}
                            ` : latestBillIsPaid ? `
                            <tr>
                                <td class="text-slate-500 text-right pr-1">Bill:</td>
                                <td class="font-bold text-green-600 text-right">₹0</td>
                                <td class="pl-1"><button onclick="Cards.showEditBillModal('', '${cardIdStr}')" class="text-blue-500 hover:text-blue-700" title="Add new bill">✎</button></td>
                            </tr>
                            ` : `
                            <tr>
                                <td class="text-slate-500 text-right pr-1">Bill:</td>
                                <td class="text-gray-400 text-right">—</td>
                                <td class="pl-1"><button onclick="Cards.showEditBillModal('', '${cardIdStr}')" class="text-blue-500 hover:text-blue-700" title="Add bill">✎</button></td>
                            </tr>
                            `}
                            <tr>
                                <td class="text-slate-500 text-right pr-1">O/S:</td>
                                <td class="${outstandingAmt > 0 ? 'font-bold text-orange-600' : 'text-green-600'} text-right">₹${Utils.formatIndianNumber(outstandingAmt)}</td>
                                <td class="pl-1"><button onclick="Cards.showEditOutstandingModal('${cardIdStr}')" class="text-blue-500 hover:text-blue-700" title="Edit outstanding">✎</button></td>
                            </tr>
                            ${(unpaidBill && unpaidBill.dueDate) || card.billDate ? `
                            <tr>
                                <td class="text-slate-500 text-right pr-1">Due:</td>
                                <td class="text-slate-600 text-right">${unpaidBill && unpaidBill.dueDate ? new Date(unpaidBill.dueDate).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'}) : this.calculateNextDueDate(card.statementDate, card.billDate)}</td>
                                <td style="width: 16px;"></td>
                            </tr>
                            ` : ''}
                            ${unpaidBill && unpaidBill.parsedAt ? `
                            <tr>
                                <td class="text-slate-500 text-right pr-1">Updated:</td>
                                <td class="text-slate-400 text-right text-xs">${new Date(unpaidBill.parsedAt).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})}</td>
                                <td style="width: 16px;"></td>
                            </tr>
                            ` : ''}
                        </table>
                    </div>
                    ` : ''}
                </div>
                
                <!-- Add Card Button for Placeholders -->
                ${isPlaceholder ? `<button onclick="openCardModal()" class="w-full mt-3 text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-2 rounded-lg">+ Add This Card</button>` : ''}
                
                <!-- Due Date Warning Message -->
                ${(() => {
                    if (!isCredit || isPlaceholder || !hasBillToPay) return '';
                    const dueDate = unpaidBill?.dueDate;
                    if (!dueDate && !card.billDate) return '';
                    
                    let daysUntilDue;
                    if (dueDate) {
                        const due = new Date(dueDate);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        due.setHours(0, 0, 0, 0);
                        daysUntilDue = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
                    } else {
                        // Calculate from card's billDate
                        const today = new Date();
                        const currentDay = today.getDate();
                        const billDay = card.billDate;
                        const statementDay = card.statementDate || 1;
                        
                        // Determine if due is this month or next
                        let dueMonth = today.getMonth();
                        let dueYear = today.getFullYear();
                        if (billDay <= statementDay) {
                            dueMonth += 1;
                            if (dueMonth > 11) { dueMonth = 0; dueYear++; }
                        }
                        const dueDate = new Date(dueYear, dueMonth, billDay);
                        daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
                    }
                    
                    if (daysUntilDue < 0) {
                        return '<div class="mt-2 text-xs text-red-600 font-medium text-center">⚠️ Payment overdue by ' + Math.abs(daysUntilDue) + ' day(s)!</div>';
                    } else if (daysUntilDue === 0) {
                        return '<div class="mt-2 text-xs text-red-600 font-medium text-center">⚠️ Payment due today!</div>';
                    } else if (daysUntilDue === 1) {
                        return '<div class="mt-2 text-xs text-orange-600 font-medium text-center">⚡ Payment due tomorrow!</div>';
                    } else if (daysUntilDue <= 3) {
                        return '<div class="mt-2 text-xs text-yellow-600 font-medium text-center">📅 Payment due in ' + daysUntilDue + ' days</div>';
                    }
                    return '';
                })()}
                
                <!-- EMI & Benefits Actions - inline with card -->
                ${isCredit && !isPlaceholder ? (() => {
                    const freshness = this.getBenefitsFreshness(card);
                    const stalePill = freshness.isStale
                        ? `<div class="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-1 rounded-md" title="Benefits last fetched ${freshness.label}. Bank reward terms change — tap Update to refresh.">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                                Benefits stale (${freshness.label}) — tap Update
                           </div>`
                        : '';
                    return `
                <div class="pt-3 mt-2 border-t border-slate-300 border-opacity-50">
                    ${stalePill}
                    <div class="flex gap-2">
                        <button onclick="Cards.openEMIModal('${cardIdStr}')" class="flex-1 text-xs bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 shadow-md">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                            </svg>
                            EMIs (${card.emis && card.emis.filter(e => !e.completed).length || 0})
                        </button>
                        <button onclick="${card.benefits ? `Cards.showBenefitsModal('${cardIdStr}')` : `Cards.promptEnableAIForBenefits('${cardIdStr}')`}"
                                class="flex-1 text-xs ${card.benefits ? 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700' : 'bg-gray-400 hover:bg-gray-500 opacity-80'} text-white px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 shadow-md"
                                title="${card.benefits ? 'View terms' : 'No terms fetched yet — tap for how to fetch'}"
                                aria-label="${card.benefits ? 'View card benefit terms' : 'How to fetch card benefit terms'}">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                            </svg>
                            Terms
                        </button>
                        <button onclick="Cards.refreshBenefits('${cardIdStr}')"
                                id="refresh-btn-${cardIdStr}"
                                class="flex-1 text-xs bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-3 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 shadow-md"
                                title="Re-fetch latest reward rules from the bank">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                            </svg>
                            <span id="refresh-text-${cardIdStr}">Update</span>
                        </button>
                    </div>
                </div>
                `;
                })() : ''}
            </div>
        `;
    },
    
    /**
     * Render summary card for credit cards
     */
    renderSummaryCard() {
        const summary = window.SmsBills ? window.SmsBills.getSummary() : { totalCreditLimit: 0, totalOutstanding: 0, totalBillsDue: 0, unpaidBillsCount: 0, totalEmis: 0, activeEmiCount: 0 };

        // Calculate from cards if SmsBills not loaded
        if (!window.SmsBills) {
            const creditCardsForSummary = window.DB.cards.filter(c => c.cardType === 'credit' && !c.isPlaceholder);
            summary.totalCreditLimit = creditCardsForSummary.reduce((sum, c) => sum + (parseFloat(c.creditLimit) || 0), 0);
            summary.totalOutstanding = creditCardsForSummary.reduce((sum, c) => sum + (parseFloat(c.outstanding) || 0), 0);
        }

        // Count credit cards whose benefits are stale (or never fetched) so we can
        // surface a single "Update all" CTA instead of asking the user to refresh
        // each card individually.
        const allCreditCards = window.DB.cards.filter(c => c.cardType === 'credit' && !c.isPlaceholder);
        const staleCards = allCreditCards.filter(c => {
            const f = this.getBenefitsFreshness(c);
            return !f.hasBenefits || f.isStale;
        });
        const staleCount = staleCards.length;
        
        // Calculate current month EMI amount (only credit card EMIs, not loans)
        let currentMonthEMIAmount = 0;
        let currentMonthEMICount = 0;
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;
        const currentMonthName = today.toLocaleDateString('en-US', { month: 'short' });
        
        if (window.Dashboard && window.Dashboard.getEmiItemsForMonth) {
            const currentMonthEMIs = window.Dashboard.getEmiItemsForMonth(currentYear, currentMonth);
            // Filter only credit card EMIs (type === 'card'), exclude loan EMIs
            const cardEMIs = currentMonthEMIs.filter(emi => emi.type === 'card');
            currentMonthEMIAmount = cardEMIs.reduce((sum, emi) => sum + (parseFloat(emi.amount) || 0), 0);
            currentMonthEMICount = cardEMIs.length;
        }
        
        // Calculate latest end EMI date from all active credit card EMIs
        let latestEndEmiDate = null;
        const creditCards = window.DB.cards.filter(c => c.cardType === 'credit' && !c.isPlaceholder);
        creditCards.forEach(card => {
            if (card.emis && card.emis.length > 0) {
                card.emis.forEach(emi => {
                    if (!emi.completed && emi.firstEmiDate && emi.totalCount) {
                        // Auto-update EMI progress
                        if (window.Cards && window.Cards.updateEMIProgress) {
                            window.Cards.updateEMIProgress(emi);
                        }
                        
                        const paidCount = emi.paidCount || 0;
                        const totalCount = emi.totalCount || emi.totalEmis || 0;
                        const remaining = totalCount - paidCount;
                        
                        if (remaining > 0) {
                            // Calculate end date: firstEmiDate + (totalCount - 1) months
                            const firstDate = new Date(emi.firstEmiDate);
                            const endDate = new Date(firstDate);
                            endDate.setMonth(endDate.getMonth() + totalCount - 1);
                            
                            if (!latestEndEmiDate || endDate > latestEndEmiDate) {
                                latestEndEmiDate = endDate;
                            }
                        }
                    }
                });
            }
        });
        
        return `
        <div class="mb-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl p-4 shadow-lg">
            <!-- Row 1: Credit Limit & Outstanding -->
            <div class="grid grid-cols-2 gap-4 mb-3">
                <div>
                    <p class="text-xs opacity-90">Credit Limit</p>
                    <p class="text-base font-bold">₹${Utils.formatIndianNumber(summary.totalCreditLimit)}</p>
                </div>
                <div class="text-right">
                    <p class="text-xs opacity-90">Outstanding</p>
                    <p class="text-base font-bold ${summary.totalOutstanding > 0 ? 'text-yellow-200' : ''}">₹${Utils.formatIndianNumber(summary.totalOutstanding)}</p>
                </div>
            </div>
            
            <!-- Row 2: Bills Due & EMIs -->
            <div class="grid grid-cols-2 gap-4 border-t border-white border-opacity-20 pt-3">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="text-xs opacity-90">Bills Due ${summary.unpaidBillsCount > 0 ? `(${summary.unpaidBillsCount})` : ''}</span>
                        <button onclick="Cards.showGroupsModal()" class="text-[10px] bg-white bg-opacity-25 hover:bg-opacity-40 px-1.5 py-0.5 rounded transition-all" title="Manage Card Groups">🔗</button>
                    </div>
                    <p class="text-sm font-bold ${summary.totalBillsDue > 0 ? 'text-orange-200' : ''}">₹${Utils.formatIndianNumber(summary.totalBillsDue)}</p>
                </div>
                <div class="text-right">
                    <p class="text-xs opacity-90">End EMI Date</p>
                    <p class="text-sm font-bold">${latestEndEmiDate ? latestEndEmiDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</p>
                </div>
            </div>
            
            <!-- Row 3: Current Month EMI -->
            ${currentMonthEMIAmount > 0 ? `
            <div class="border-t border-white border-opacity-20 pt-3 mt-3">
                <div class="flex items-center justify-between">
                    <p class="text-xs opacity-90">${currentMonthName} EMI${currentMonthEMICount > 0 ? ` (${currentMonthEMICount})` : ''}</p>
                    <p class="text-base font-bold">₹${Utils.formatIndianNumber(currentMonthEMIAmount)}</p>
                </div>
            </div>
            ` : ''}

            ${staleCount > 0 ? `
            <!-- Stale benefits CTA: refresh terms on all stale cards in one tap -->
            <div class="border-t border-white border-opacity-20 pt-3 mt-3">
                <div class="flex items-center justify-between gap-2">
                    <div class="text-xs opacity-90 flex-1 min-w-0">
                        <strong>${staleCount}</strong> card${staleCount > 1 ? 's have' : ' has'} stale or missing benefit data
                    </div>
                    <button onclick="Cards.refreshAllStaleBenefits()"
                            id="refresh-all-btn"
                            class="text-xs bg-white text-purple-700 hover:bg-purple-50 font-bold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap shadow-md">
                        🔄 Update All
                    </button>
                </div>
            </div>
            ` : ''}
        </div>
        `;
    },

    /**
     * Refresh benefits sequentially for every credit card whose benefits are stale
     * or missing. Sequential (not parallel) to avoid hitting AI provider rate limits
     * and to keep the progress UI legible. Skips cards already in flight.
     */
    async refreshAllStaleBenefits() {
        const candidates = window.DB.cards.filter(c => {
            if (c.cardType !== 'credit' || c.isPlaceholder) return false;
            const f = this.getBenefitsFreshness(c);
            return !f.hasBenefits || f.isStale;
        });

        if (candidates.length === 0) {
            window.Utils.showInfo('All card benefits are up to date ✓');
            return;
        }

        if (!window.AIProvider || !window.AIProvider.isConfigured()) {
            window.Utils.showError('Please configure an AI provider in settings first.');
            return;
        }

        // Disable the bulk button to prevent re-entry while batch is running
        const btn = document.getElementById('refresh-all-btn');
        if (btn) {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-wait');
            btn.textContent = 'Updating...';
        }

        let succeeded = 0;
        let failed = 0;
        // Suppress AI provider info messages for the whole batch and per-card
        // success/error toasts so only the batch summary is shown.
        const previousSuppressState = window.AIProvider.suppressInfoMessages;
        window.AIProvider.suppressInfoMessages = true;
        this._suppressBenefitToasts = true;

        for (let i = 0; i < candidates.length; i++) {
            const card = candidates[i];
            // Skip if a per-card fetch is already running
            if (this._benefitsFetchesInFlight.has(String(card.id))) continue;

            // Drive a single shared progress modal across the batch so the user
            // sees overall progress (e.g., "Updating 3/7: HDFC Regalia").
            window.Utils.showProgressModal(
                `🔄 Updating ${i + 1}/${candidates.length}<br><span class="text-sm text-gray-600">${Utils.escapeHtml(card.name)}</span>`,
                true
            );
            try {
                // showLoading=false → per-card flow won't open/close its own modal;
                // we keep the batch modal in place for the user.
                await this.fetchAndStoreBenefits(card.id, card.name, false);
                succeeded++;
            } catch (e) {
                console.error(`Bulk refresh failed for ${card.name}:`, e);
                failed++;
            }
        }

        window.AIProvider.suppressInfoMessages = previousSuppressState;
        this._suppressBenefitToasts = false;

        // Final summary modal
        if (failed === 0) {
            window.Utils.showProgressSuccess(`✅ Updated ${succeeded} card${succeeded !== 1 ? 's' : ''}`, true);
        } else {
            window.Utils.showProgressError(`Updated ${succeeded}, failed ${failed}. Try again for failed ones.`);
        }

        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-wait');
            btn.textContent = '🔄 Update All';
        }

        this.render();
    },
    
    /**
     * Get days until due date
     */
    getDaysUntilDue(dateStr) {
        if (!dateStr) return 999;
        const due = new Date(dateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        due.setHours(0, 0, 0, 0);
        return Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    },
    
    /**
     * Get days until due text
     */
    getDaysUntilDueText(dateStr) {
        const days = this.getDaysUntilDue(dateStr);
        if (days < 0) return `${Math.abs(days)}d overdue`;
        if (days === 0) return 'Due today';
        if (days === 1) return 'Due tomorrow';
        return `${days}d left`;
    },
    
    /**
     * Calculate next due date based on statement day and bill day
     * @param {number} statementDay - Day of month statement is generated (e.g., 17)
     * @param {number} billDay - Day of month bill is due (e.g., 2)
     * @returns {string} Formatted date like "2 Jan" or "29 Dec"
     */
    calculateNextDueDate(statementDay, billDay) {
        if (!billDay) return '';
        
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const currentDay = today.getDate();
        
        let dueMonth, dueYear;
        
        // Determine which month the due date falls in
        // If billDay < statementDay, due is in the next month after statement
        // If billDay > statementDay, due is in the same month as statement
        
        if (statementDay) {
            // We have both statement day and bill day
            if (billDay <= statementDay) {
                // Due date is in the next month after statement
                // Check if we're before or after the statement day this month
                if (currentDay <= statementDay) {
                    // Statement hasn't generated yet this month, so due is next month
                    dueMonth = currentMonth + 1;
                    dueYear = currentYear;
                } else {
                    // Statement has generated, due is next month
                    dueMonth = currentMonth + 1;
                    dueYear = currentYear;
                }
            } else {
                // Due date is in the same month as statement
                // Check if we've passed the due date this month
                if (currentDay > billDay) {
                    // Passed this month's due, show next month's
                    dueMonth = currentMonth + 1;
                    dueYear = currentYear;
                } else {
                    dueMonth = currentMonth;
                    dueYear = currentYear;
                }
            }
        } else {
            // Only bill day, no statement day - assume current/next month based on if we passed the day
            if (currentDay > billDay) {
                dueMonth = currentMonth + 1;
                dueYear = currentYear;
            } else {
                dueMonth = currentMonth;
                dueYear = currentYear;
            }
        }
        
        // Handle year rollover
        if (dueMonth > 11) {
            dueMonth = dueMonth - 12;
            dueYear = dueYear + 1;
        }
        
        const dueDate = new Date(dueYear, dueMonth, billDay);
        return dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    },
    
    /**
     * Show edit bill modal
     */
    showEditBillModal(billId, cardId) {
        const billIdStr = String(billId);
        const cardIdStr = String(cardId);
        const bill = window.DB.cardBills?.find(b => String(b.id) === billIdStr);
        const card = window.DB.cards?.find(c => String(c.id) === cardIdStr);
        
        const existing = document.getElementById('edit-bill-modal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.id = 'edit-bill-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-[10001] flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        
        const cardName = card ? card.name : 'Card';
        const currentAmount = bill ? bill.amount : 0;
        
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
                <div class="bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-3">
                    <h3 class="text-white font-bold text-sm">✎ Edit Bill Amount</h3>
                    <p class="text-blue-100 text-xs">${Utils.escapeHtml(cardName)}</p>
                </div>
                <div class="p-4">
                    ${bill ? `<p class="text-xs text-gray-500 mb-2">Current: ₹${Utils.formatIndianNumber(currentAmount)}</p>` : ''}
                    <div class="relative">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                        <input type="text" id="edit-bill-amount-input" 
                               class="w-full p-3 pl-8 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-lg font-semibold"
                               placeholder="Enter amount"
                               value="${currentAmount || ''}"
                               inputmode="decimal"
                               autocomplete="off">
                    </div>
                </div>
                <div class="flex border-t">
                    <button onclick="document.getElementById('edit-bill-modal').remove()" 
                            class="flex-1 py-3 text-gray-500 hover:bg-gray-50 transition-colors text-sm">Cancel</button>
                    ${bill ? `
                    <button onclick="Cards.deleteBill('${billIdStr}', '${cardIdStr}')" 
                            class="flex-1 py-3 text-white bg-red-500 hover:bg-red-600 transition-colors text-sm font-medium" title="Remove this bill record">Delete</button>
                    ` : ''}
                    <button onclick="Cards.saveBillAmount('${billIdStr}', '${cardIdStr}')" 
                            class="flex-1 py-3 text-white bg-blue-500 hover:bg-blue-600 transition-colors text-sm font-medium">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Focus the input
        setTimeout(() => {
            const input = document.getElementById('edit-bill-amount-input');
            if (input) { input.focus(); input.select(); }
        }, 100);
    },
    
    /**
     * Delete a single bill record (used to clean up stale entries)
     */
    deleteBill(billId, cardId) {
        const billIdStr = String(billId);
        const modal = document.getElementById('edit-bill-modal');
        const bills = window.DB.cardBills || [];
        const idx = bills.findIndex(b => String(b.id) === billIdStr);
        if (idx === -1) {
            Utils.showError('Bill not found');
            return;
        }
        const removed = bills[idx];
        const wasUnpaid = !removed.isPaid;
        const removedAmount = parseFloat(removed.amount) || 0;
        bills.splice(idx, 1);
        
        // If the deleted bill was unpaid, also pull its amount out of card.outstanding
        // so the totals stay consistent.
        if (wasUnpaid && removedAmount > 0) {
            const card = window.DB.cards?.find(c => String(c.id) === String(cardId));
            if (card) {
                const currentOutstanding = parseFloat(card.outstanding) || 0;
                card.outstanding = Math.max(0, currentOutstanding - removedAmount);
            }
        }
        
        window.Storage.save();
        if (modal) modal.remove();
        this.render();
        Utils.showSuccess('Bill deleted');
    },
    
    /**
     * Clear all stale unpaid bills on a card (the "X stale — clear" button).
     * Keeps the most recent unpaid bill, marks the rest as 'cleared'. Useful
     * after the buggy SMS sync left several leftover unpaid records behind.
     */
    async confirmClearStaleBills(cardId, keepBillId) {
        const cardIdStr = String(cardId);
        const keepIdStr = keepBillId ? String(keepBillId) : '';
        const unpaid = (window.DB.cardBills || []).filter(b =>
            String(b.cardId) === cardIdStr && !b.isPaid && String(b.id) !== keepIdStr
        );
        if (unpaid.length === 0) {
            Utils.showInfo('No stale bills to clear');
            return;
        }
        const ok = await window.Utils.confirm(
            `Clear ${unpaid.length} stale unpaid bill(s) on this card? They'll be marked as cleared in payment history. This does not change your outstanding amount.`,
            'Clear Stale Bills'
        );
        if (!ok) {
            return;
        }
        const cleared = this.clearOtherUnpaidBills(cardIdStr, keepIdStr, new Date().toISOString());
        window.Storage.save();
        this.render();
        Utils.showSuccess(`${cleared} stale bill(s) cleared`);
    },
    
    /**
     * Save bill amount from modal
     * Manual edits keep card.outstanding in sync by applying the delta
     * (new amount - old amount), so reducing the bill also reduces O/S.
     */
    saveBillAmount(billId, cardId) {
        const billIdStr = String(billId);
        const cardIdStr = String(cardId);
        const input = document.getElementById('edit-bill-amount-input');
        const modal = document.getElementById('edit-bill-modal');
        
        if (!input) return;
        
        const rawValue = input.value.replace(/[₹,\s]/g, '');
        const amount = parseFloat(rawValue);
        
        if (isNaN(amount) || amount < 0) {
            Utils.showError('Please enter a valid amount');
            return;
        }
        
        let bill = window.DB.cardBills?.find(b => String(b.id) === billIdStr);
        const card = window.DB.cards?.find(c => String(c.id) === cardIdStr);
        
        let previousBillAmount = 0;
        
        if (!bill && card) {
            if (!window.DB.cardBills) window.DB.cardBills = [];
            bill = {
                id: Utils.generateId(),
                cardId: cardIdStr,
                cardLast4: card.cardNumber ? card.cardNumber.slice(-4) : '****',
                amount: amount,
                originalAmount: amount,
                dueDate: null,
                minDue: null,
                isPaid: amount === 0,
                paidAmount: null,
                paidType: null,
                paidAt: null,
                parsedAt: new Date().toISOString()
            };
            window.DB.cardBills.push(bill);
            Utils.showSuccess('Bill added');
        } else if (bill) {
            // Treat a previously-paid bill as having 0 contribution to O/S
            previousBillAmount = bill.isPaid ? 0 : (parseFloat(bill.amount) || 0);
            bill.amount = amount;
            bill.parsedAt = new Date().toISOString();
            if (amount === 0) {
                bill.isPaid = true;
                bill.paidAt = new Date().toISOString();
            } else {
                bill.isPaid = false;
                bill.paidAmount = null;
                bill.paidType = null;
                bill.paidAt = null;
            }
            Utils.showSuccess('Bill updated');
        }
        
        // Keep outstanding in sync with the bill change
        if (card) {
            const currentOutstanding = parseFloat(card.outstanding) || 0;
            const delta = amount - previousBillAmount;
            // When user lowers a bill, lower outstanding too; when they raise it, raise outstanding.
            // Clamp at 0 so we never go negative.
            const nextOutstanding = Math.max(0, currentOutstanding + delta);
            card.outstanding = nextOutstanding;
        }
        
        window.Storage.save();
        if (modal) modal.remove();
        this.render();
    },
    
    /**
     * Show edit outstanding modal
     */
    showEditOutstandingModal(cardId) {
        const cardIdStr = String(cardId);
        const card = window.DB.cards?.find(c => String(c.id) === cardIdStr);
        
        if (!card) {
            Utils.showError('Card not found');
            return;
        }
        
        const existing = document.getElementById('edit-outstanding-modal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.id = 'edit-outstanding-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-[10001] flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        
        const currentAmount = parseFloat(card.outstanding) || 0;
        
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
                <div class="bg-gradient-to-r from-orange-500 to-amber-600 px-4 py-3">
                    <h3 class="text-white font-bold text-sm">✎ Edit Outstanding</h3>
                    <p class="text-orange-100 text-xs">${Utils.escapeHtml(card.name)}</p>
                </div>
                <div class="p-4">
                    <p class="text-xs text-gray-500 mb-2">Current: ₹${Utils.formatIndianNumber(currentAmount)}</p>
                    <div class="relative">
                        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                        <input type="text" id="edit-outstanding-input" 
                               class="w-full p-3 pl-8 border-2 border-gray-200 rounded-lg focus:border-orange-500 focus:outline-none text-lg font-semibold"
                               placeholder="Enter amount"
                               value="${currentAmount || ''}"
                               inputmode="decimal"
                               autocomplete="off">
                    </div>
                </div>
                <div class="flex border-t">
                    <button onclick="document.getElementById('edit-outstanding-modal').remove()" 
                            class="flex-1 py-3 text-gray-500 hover:bg-gray-50 transition-colors text-sm">Cancel</button>
                    <button onclick="Cards.saveOutstanding('${cardIdStr}')" 
                            class="flex-1 py-3 text-white bg-orange-500 hover:bg-orange-600 transition-colors text-sm font-medium">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Focus the input
        setTimeout(() => {
            const input = document.getElementById('edit-outstanding-input');
            if (input) { input.focus(); input.select(); }
        }, 100);
    },
    
    /**
     * Save outstanding amount from modal.
     * If the user lowers outstanding below the sum of currently-unpaid bills,
     * the excess unpaid bills are 'cleared' so the card reflects the user's
     * intent (typical case: bills were paid in the bank app and the user is
     * just syncing the in-app state).
     */
    saveOutstanding(cardId) {
        const cardIdStr = String(cardId);
        const input = document.getElementById('edit-outstanding-input');
        const modal = document.getElementById('edit-outstanding-modal');
        
        if (!input) return;
        
        const rawValue = input.value.replace(/[₹,\s]/g, '');
        const amount = parseFloat(rawValue);
        
        if (isNaN(amount) || amount < 0) {
            Utils.showError('Please enter a valid amount');
            return;
        }
        
        const card = window.DB.cards?.find(c => String(c.id) === cardIdStr);
        
        if (!card) {
            Utils.showError('Card not found');
            return;
        }
        
        card.outstanding = amount;
        
        // If the new outstanding is less than the total currently-unpaid bills,
        // clear the stale ones so the bill row matches reality.
        const unpaidBills = (window.DB.cardBills || []).filter(b => 
            String(b.cardId) === cardIdStr && !b.isPaid
        );
        const totalUnpaid = unpaidBills.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
        let cleared = 0;
        if (totalUnpaid > amount) {
            const nowIso = new Date().toISOString();
            // Keep at most one bill that fits within the new outstanding.
            // Sort newest-first so we keep the most recent bill if any survives.
            const sorted = [...unpaidBills].sort((a, b) =>
                new Date(b.dueDate || b.parsedAt || 0) - new Date(a.dueDate || a.parsedAt || 0)
            );
            const keepId = amount > 0 && sorted.length > 0 ? String(sorted[0].id) : '';
            cleared = this.clearOtherUnpaidBills(cardIdStr, keepId, nowIso);
            // If we kept one, ensure its amount matches the new outstanding so totals line up
            if (keepId && amount > 0) {
                const keep = (window.DB.cardBills || []).find(b => String(b.id) === keepId);
                if (keep) keep.amount = amount;
            }
        }
        
        window.Storage.save();
        if (modal) modal.remove();
        this.render();
        Utils.showSuccess(`Outstanding updated${cleared > 0 ? ` (${cleared} stale bill(s) cleared)` : ''}`);
    },
    
    /**
     * Show mark paid options
     */
    showMarkPaidOptions(billId, cardId) {
        const billIdStr = String(billId);
        const cardIdStr = String(cardId);
        const bill = window.DB.cardBills?.find(b => String(b.id) === billIdStr);
        const card = window.DB.cards?.find(c => String(c.id) === cardIdStr);
        if (!bill) { Utils.showError('Bill not found'); return; }
        
        const existing = document.getElementById('mark-paid-modal');
        if (existing) existing.remove();
        
        const cardName = card ? card.name : 'Card';
        // Force numeric so inline onclick handlers can't be broken by legacy
        // string amounts like "5,000.00" left over from the old SMS sync.
        const billAmount = parseFloat(String(bill.amount).replace(/[₹,\s]/g, '')) || 0;
        const outstandingAmt = card ? Math.max(0, parseFloat(String(card.outstanding).replace(/[₹,\s]/g, '')) || 0) : 0;
        
        // Count other unpaid bills so we can warn the user about the cleanup
        const allCardBills = (window.DB.cardBills || []).filter(b => String(b.cardId) === cardIdStr);
        const otherUnpaidCount = allCardBills.filter(b => !b.isPaid && String(b.id) !== billIdStr).length;
        
        const today = new Date().toISOString().split('T')[0];
        
        const modal = document.createElement('div');
        modal.id = 'mark-paid-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-[10001] flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
                <div class="bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-3">
                    <h3 class="text-white font-bold text-sm">✓ Mark as Paid</h3>
                    <p class="text-green-100 text-xs">${Utils.escapeHtml(cardName)}</p>
                </div>
                <div class="p-3 space-y-2">
                    ${otherUnpaidCount > 0 ? `
                    <div class="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded">
                        ⚠️ ${otherUnpaidCount} other stale unpaid bill(s) on this card will be auto-cleared.
                    </div>
                    ` : ''}
                    <!-- Payment Date Selector -->
                    <div class="flex items-center gap-2 pb-2 border-b">
                        <label class="text-xs text-gray-500">Payment Date:</label>
                        <input type="date" id="payment-date-input" value="${today}" 
                               class="flex-1 p-1.5 border border-gray-200 rounded-lg text-sm focus:border-green-500 focus:outline-none">
                    </div>
                    
                    <!-- Pay Bill Option -->
                    <button onclick="Cards.markBillPaidWithDate('${billIdStr}', 'bill', ${billAmount})" 
                            class="w-full flex justify-between items-center p-3 rounded-lg border-2 border-green-200 hover:border-green-400 hover:bg-green-50 transition-all">
                        <div class="text-left">
                            <p class="font-medium text-gray-800">Pay Bill Amount</p>
                            <p class="text-xs text-gray-500">Statement bill</p>
                        </div>
                        <span class="text-lg font-bold text-green-600">₹${Utils.formatIndianNumber(billAmount)}</span>
                    </button>
                    
                    ${outstandingAmt > 0 && outstandingAmt !== billAmount ? `
                    <!-- Pay Outstanding Option -->
                    <button onclick="Cards.markBillPaidWithDate('${billIdStr}', 'outstanding', ${outstandingAmt})" 
                            class="w-full flex justify-between items-center p-3 rounded-lg border-2 border-orange-200 hover:border-orange-400 hover:bg-orange-50 transition-all">
                        <div class="text-left">
                            <p class="font-medium text-gray-800">Pay Outstanding</p>
                            <p class="text-xs text-gray-500">Total dues</p>
                        </div>
                        <span class="text-lg font-bold text-orange-600">₹${Utils.formatIndianNumber(outstandingAmt)}</span>
                    </button>
                    ` : ''}
                    
                    <!-- Custom Amount Option -->
                    <div class="pt-2 border-t">
                        <p class="text-xs text-gray-500 mb-2">Or enter custom amount:</p>
                        <div class="flex gap-2">
                            <div class="relative flex-1">
                                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                                <input type="text" id="custom-pay-amount" 
                                       class="w-full p-2 pl-8 border-2 border-gray-200 rounded-lg focus:border-green-500 focus:outline-none text-sm"
                                       placeholder="Amount"
                                       inputmode="decimal"
                                       autocomplete="off">
                            </div>
                            <button onclick="Cards.markBillPaidFromInput('${billIdStr}')" 
                                    class="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors text-sm font-medium">
                                Pay
                            </button>
                        </div>
                    </div>
                </div>
                <button onclick="document.getElementById('mark-paid-modal').remove()" 
                        class="w-full py-2.5 text-gray-500 hover:bg-gray-50 text-sm border-t transition-colors">Cancel</button>
            </div>
        `;
        document.body.appendChild(modal);
    },
    
    /**
     * Show pay outstanding options (when no bill but outstanding exists)
     */
    showPayOutstandingOptions(cardId) {
        const cardIdStr = String(cardId);
        const card = window.DB.cards?.find(c => String(c.id) === cardIdStr);
        if (!card) { Utils.showError('Card not found'); return; }
        
        // Defensive numeric coercion (legacy data may store strings like "5,000")
        const outstandingAmt = Math.max(0, parseFloat(String(card.outstanding).replace(/[₹,\s]/g, '')) || 0);
        if (outstandingAmt <= 0) { Utils.showError('No outstanding amount'); return; }
        
        const otherUnpaidCount = (window.DB.cardBills || []).filter(b => 
            String(b.cardId) === cardIdStr && !b.isPaid
        ).length;
        
        const existing = document.getElementById('pay-outstanding-modal');
        if (existing) existing.remove();
        
        const today = new Date().toISOString().split('T')[0];
        
        const modal = document.createElement('div');
        modal.id = 'pay-outstanding-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-[10001] flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
                <div class="bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-3">
                    <h3 class="text-white font-bold text-sm">💳 Pay Outstanding</h3>
                    <p class="text-blue-100 text-xs">${Utils.escapeHtml(card.name)}</p>
                </div>
                <div class="p-3 space-y-2">
                    ${otherUnpaidCount > 0 ? `
                    <div class="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded">
                        ⚠️ ${otherUnpaidCount} stale unpaid bill(s) on this card will be auto-cleared.
                    </div>
                    ` : ''}
                    <!-- Payment Date Selector -->
                    <div class="flex items-center gap-2 pb-2 border-b">
                        <label class="text-xs text-gray-500">Payment Date:</label>
                        <input type="date" id="os-payment-date-input" value="${today}" 
                               class="flex-1 p-1.5 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none">
                    </div>
                    
                    <!-- Pay Full Outstanding Option -->
                    <button onclick="Cards.payOutstandingAmount('${cardIdStr}', ${outstandingAmt})" 
                            class="w-full flex justify-between items-center p-3 rounded-lg border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50 transition-all">
                        <div class="text-left">
                            <p class="font-medium text-gray-800">Pay Full Outstanding</p>
                            <p class="text-xs text-gray-500">Clear all dues</p>
                        </div>
                        <span class="text-lg font-bold text-blue-600">₹${Utils.formatIndianNumber(outstandingAmt)}</span>
                    </button>
                    
                    <!-- Custom Amount Option -->
                    <div class="pt-2 border-t">
                        <p class="text-xs text-gray-500 mb-2">Or enter custom amount:</p>
                        <div class="flex gap-2">
                            <div class="relative flex-1">
                                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                                <input type="text" id="custom-os-pay-amount" 
                                       class="w-full p-2 pl-8 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
                                       placeholder="Amount"
                                       inputmode="decimal"
                                       autocomplete="off">
                            </div>
                            <button onclick="Cards.payOutstandingFromInput('${cardIdStr}')" 
                                    class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium">
                                Pay
                            </button>
                        </div>
                    </div>
                </div>
                <button onclick="document.getElementById('pay-outstanding-modal').remove()" 
                        class="w-full py-2.5 text-gray-500 hover:bg-gray-50 text-sm border-t transition-colors">Cancel</button>
            </div>
        `;
        document.body.appendChild(modal);
    },
    
    /**
     * Pay outstanding amount directly
     */
    payOutstandingAmount(cardId, amount) {
        const dateInput = document.getElementById('os-payment-date-input');
        const paidDateStr = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
        const paidAt = new Date(paidDateStr + 'T12:00:00').toISOString();
        
        const card = window.DB.cards?.find(c => String(c.id) === String(cardId));
        if (!card) { Utils.showError('Card not found'); return; }
        
        const numericAmount = parseFloat(amount) || 0;
        const currentOutstanding = parseFloat(card.outstanding) || 0;
        card.outstanding = Math.max(0, currentOutstanding - numericAmount);
        
        if (!window.DB.cardBills) window.DB.cardBills = [];
        window.DB.cardBills.push({
            id: Utils.generateId(),
            cardId: String(cardId),
            amount: 0,
            dueDate: null,
            isPaid: true,
            paidAmount: numericAmount,
            paidAt: paidAt,
            paidType: 'outstanding',
            originalBillAmount: 0,
            createdAt: Utils.getCurrentTimestamp()
        });
        
        // Sweep up any stale unpaid bills hanging around on this card
        let clearedCount = this.clearOtherUnpaidBills(cardId, null, paidAt);
        
        // For grouped cards with shared billing, settle and sweep linked cards too
        const group = this.getCardGroup(cardId);
        if (group && group.shareBill) {
            const otherCardIds = group.cardIds.filter(id => String(id) !== String(cardId));
            otherCardIds.forEach(otherCardId => {
                const otherCard = this.getById(otherCardId);
                if (otherCard) {
                    const otherOutstanding = parseFloat(otherCard.outstanding) || 0;
                    otherCard.outstanding = Math.max(0, otherOutstanding - numericAmount);
                }
                clearedCount += this.clearOtherUnpaidBills(otherCardId, null, paidAt);
            });
        }
        
        window.Storage.save();
        
        const modal = document.getElementById('pay-outstanding-modal');
        if (modal) modal.remove();
        
        Utils.showSuccess(`Paid ₹${Utils.formatIndianNumber(numericAmount)} towards outstanding${clearedCount > 0 ? ` (${clearedCount} stale bill(s) cleared)` : ''}`);
        this.render();
    },
    
    /**
     * Pay outstanding from custom input
     */
    payOutstandingFromInput(cardId) {
        const input = document.getElementById('custom-os-pay-amount');
        
        const showInputError = (msg) => {
            input.classList.add('border-red-500');
            input.placeholder = msg;
            input.value = '';
            input.focus();
            setTimeout(() => {
                input.classList.remove('border-red-500');
                input.placeholder = 'Amount';
            }, 2000);
        };
        
        if (!input || !input.value.trim()) {
            showInputError('Enter amount');
            return;
        }
        
        const amount = parseFloat(input.value.replace(/[₹,\s]/g, ''));
        if (isNaN(amount) || amount <= 0) {
            showInputError('Invalid amount');
            return;
        }
        
        this.payOutstandingAmount(cardId, amount);
    },
    
    /**
     * Mark bill paid with selected date
     */
    markBillPaidWithDate(billId, paidType, amount) {
        const dateInput = document.getElementById('payment-date-input');
        const paidDate = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
        this.markBillPaid(billId, paidType, amount, paidDate);
    },
    
    /**
     * Mark bill paid from custom input
     */
    markBillPaidFromInput(billId) {
        const input = document.getElementById('custom-pay-amount');
        const dateInput = document.getElementById('payment-date-input');
        
        // Show validation error inline
        const showInputError = (msg) => {
            input.classList.add('border-red-500');
            input.placeholder = msg;
            input.value = '';
            input.focus();
            setTimeout(() => {
                input.classList.remove('border-red-500');
                input.placeholder = 'Amount';
            }, 2000);
        };
        
        if (!input || !input.value.trim()) { 
            showInputError('Enter amount');
            return; 
        }
        
        const parsed = parseFloat(input.value.replace(/[₹,\s]/g, ''));
        if (isNaN(parsed) || parsed <= 0) { 
            showInputError('Invalid amount');
            return; 
        }
        
        const paidDate = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
        this.markBillPaid(billId, 'custom', parsed, paidDate);
    },
    
    /**
     * Mark bill as paid
     */
    markBillPaid(billId, paidType, amount, paidDate = null) {
        const modal = document.getElementById('mark-paid-modal');
        if (modal) modal.remove();
        
        const billIdStr = String(billId);
        const bill = window.DB.cardBills?.find(b => String(b.id) === billIdStr);
        if (!bill) {
            Utils.showError('Bill not found');
            return;
        }
        
        // Find the card to update outstanding
        const card = window.DB.cards?.find(c => String(c.id) === String(bill.cardId));
        const currentOutstanding = card ? (parseFloat(card.outstanding) || 0) : 0;
        const paidAmount = parseFloat(amount) || 0;
        
        // Determine paid date
        const paidAtDate = paidDate 
            ? new Date(paidDate + 'T12:00:00').toISOString()
            : new Date().toISOString();
        
        // Mark this bill as paid
        bill.isPaid = true;
        bill.paidAmount = paidAmount;
        bill.paidType = paidType;
        bill.paidAt = paidAtDate;
        
        // Update card's outstanding amount
        if (card) {
            if (paidType === 'outstanding') {
                card.outstanding = 0;
            } else {
                card.outstanding = Math.max(0, currentOutstanding - paidAmount);
            }
            console.log(`Updated outstanding: ${currentOutstanding} - ${paidAmount} = ${card.outstanding}`);
        }
        
        // Auto-clear EVERY OTHER unpaid bill for this card. Stale bills left
        // over from old SMS imports often share dueDates or have inconsistent
        // parsedAt timestamps, so any "older than" heuristic misses them.
        // When the user marks a bill paid we treat that as settling everything
        // outstanding on the card; the cleanups are tagged paidType 'cleared'
        // with paidAmount 0 so payment-history totals stay accurate.
        let clearedCount = this.clearOtherUnpaidBills(bill.cardId, bill.id, paidAtDate);
        
        // Check if card is in a group with shared billing
        const group = this.getCardGroup(bill.cardId);
        if (group && group.shareBill) {
            // Mark bills for all other cards in the group as paid too
            const otherCardIds = group.cardIds.filter(id => String(id) !== String(bill.cardId));
            
            otherCardIds.forEach(otherCardId => {
                const otherCard = this.getById(otherCardId);
                
                // Find unpaid bills for this card with similar due date
                const otherBills = window.DB.cardBills?.filter(b => 
                    String(b.cardId) === String(otherCardId) && 
                    !b.isPaid &&
                    b.dueDate === bill.dueDate // Same billing cycle
                ) || [];
                
                otherBills.forEach(ob => {
                    ob.isPaid = true;
                    ob.paidAmount = paidAmount;
                    ob.paidType = paidType;
                    ob.paidAt = paidAtDate;
                    console.log(`Group billing: Also marked bill for card ${otherCardId} as paid`);
                });
                
                // Update outstanding for other cards in group
                if (otherCard) {
                    const otherOutstanding = parseFloat(otherCard.outstanding) || 0;
                    if (paidType === 'outstanding') {
                        otherCard.outstanding = 0;
                    } else {
                        otherCard.outstanding = Math.max(0, otherOutstanding - paidAmount);
                    }
                }
                
                // Also clear every other unpaid bill on linked cards
                clearedCount += this.clearOtherUnpaidBills(otherCardId, bill.id, paidAtDate);
            });
            
            Utils.showSuccess(`Bill paid for ${group.cardIds.length} linked cards!${clearedCount > 0 ? ` (${clearedCount} stale bill(s) cleared)` : ''}`);
        } else {
            Utils.showSuccess(`Bill marked as paid!${clearedCount > 0 ? ` (${clearedCount} stale bill(s) cleared)` : ''}`);
        }
        
        window.Storage.save();
        this.render();
    },
    
    /**
     * Clear every unpaid bill for a card except the specified one.
     * Used after a payment to sweep up stale duplicates left behind by the
     * old SMS sync. Cleared bills get paidType 'cleared' / paidAmount 0 so
     * payment-history totals are unaffected.
     *
     * @param {string} cardId - Card whose unpaid bills should be cleared
     * @param {string} keepBillId - Bill id to skip (e.g. the one just paid)
     * @param {string} paidAtDate - ISO timestamp to record on cleared bills
     * @returns {number} How many bills were cleared
     */
    clearOtherUnpaidBills(cardId, keepBillId, paidAtDate) {
        if (!window.DB.cardBills) return 0;
        const cardIdStr = String(cardId);
        const keepIdStr = keepBillId == null ? '' : String(keepBillId);
        let cleared = 0;
        window.DB.cardBills.forEach(b => {
            if (String(b.cardId) !== cardIdStr) return;
            if (b.isPaid) return;
            if (keepIdStr && String(b.id) === keepIdStr) return;
            b.isPaid = true;
            b.paidAmount = 0;
            b.paidType = 'cleared';
            b.paidAt = paidAtDate;
            cleared++;
        });
        return cleared;
    },
    
    /**
     * Show the Bills Manager for a card.
     * Lists every bill (paid + cleared + unpaid) with per-row actions so the
     * user can fully manage stale records left behind by the old SMS sync.
     * Top-level controls let them clear all unpaid or wipe the card's bills
     * completely. Also kept reachable as `showPaymentHistory` for backward
     * compatibility with anywhere it's still referenced.
     */
    showBillsManager(cardId) {
        const cardIdStr = String(cardId);
        const card = window.DB.cards?.find(c => String(c.id) === cardIdStr);
        if (!card) { Utils.showError('Card not found'); return; }
        
        if (!Array.isArray(window.DB.cardBills)) window.DB.cardBills = [];
        
        // Defensive integrity: any bill on this card without an id gets one
        // so the per-row actions below can find it.
        let needSave = false;
        window.DB.cardBills.forEach(b => {
            if (b && String(b.cardId) === cardIdStr && (!b.id || b.id === '')) {
                b.id = (window.Utils && Utils.generateId)
                    ? Utils.generateId()
                    : 'bill_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
                needSave = true;
            }
        });
        if (needSave) window.Storage.save();
        
        const bills = window.DB.cardBills.filter(b => String(b.cardId) === cardIdStr);
        
        // Newest first by due date, falling back to paid/parsed
        bills.sort((a, b) => {
            const da = new Date(a.dueDate || a.paidAt || a.parsedAt || 0).getTime();
            const db = new Date(b.dueDate || b.paidAt || b.parsedAt || 0).getTime();
            return db - da;
        });
        
        const unpaidCount = bills.filter(b => !b.isPaid).length;
        const outstandingAmt = parseFloat(String(card.outstanding).replace(/[₹,\s]/g, '')) || 0;
        
        const fmt = (n) => Utils.formatIndianNumber(n);
        const formatDate = (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        
        const rowsHtml = bills.length === 0 ? `
            <p class="text-gray-500 text-sm text-center py-6">No bills on this card.</p>
        ` : bills.map(b => {
            const billIdStr = String(b.id || '');
            const isCleared = b.paidType === 'cleared';
            const isPaid = !!b.isPaid;
            const amount = parseFloat(b.amount) || 0;
            const paidAmount = parseFloat(b.paidAmount) || 0;
            const due = formatDate(b.dueDate);
            const paid = formatDate(b.paidAt || b.paidDate);
            const status = isCleared ? 'CLEARED' : isPaid ? 'PAID' : 'UNPAID';
            const statusClasses = isCleared ? 'bg-gray-100 text-gray-600'
                : isPaid ? 'bg-green-100 text-green-700'
                : 'bg-orange-100 text-orange-700';
            const amountClasses = isCleared ? 'text-gray-500'
                : isPaid ? 'text-green-600'
                : 'text-orange-600';
            const labelType = isCleared ? 'Cleared (stale)'
                : b.paidType === 'outstanding' ? 'Outstanding'
                : b.paidType === 'custom' ? 'Custom' : 'Bill';
            
            const displayAmount = isCleared ? 0 : (isPaid ? (paidAmount || amount) : amount);
            
            return `
            <div class="py-2 px-3 border-b last:border-b-0">
                <div class="flex justify-between items-start gap-2">
                    <div class="min-w-0">
                        <p class="text-sm font-bold ${amountClasses}">₹${fmt(displayAmount)}</p>
                        <p class="text-xs text-gray-500 truncate">${isPaid ? `${isCleared ? 'Cleared' : 'Paid'} on ${paid}` : (due ? `Due: ${due}` : 'Pending')}</p>
                        <p class="text-[10px] text-gray-400">${labelType}${!isPaid ? '' : ''} • Bill ₹${fmt(amount)}${due ? ` • Due ${due}` : ''}</p>
                    </div>
                    <div class="flex flex-col items-end gap-1 shrink-0">
                        <span class="text-[10px] ${statusClasses} px-2 py-0.5 rounded-full">${status}</span>
                        <div class="flex gap-1">
                            ${!isPaid ? `
                            <button onclick="Cards.markBillPaidFromManager('${billIdStr}')" class="text-[10px] bg-green-500 hover:bg-green-600 text-white px-2 py-0.5 rounded" title="Mark this bill as paid">Mark Paid</button>
                            ` : ''}
                            <button onclick="Cards.deleteBillFromManager('${billIdStr}', '${cardIdStr}')" class="text-[10px] bg-red-500 hover:bg-red-600 text-white px-2 py-0.5 rounded" title="Delete this bill record">Delete</button>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }).join('');
        
        const existing = document.getElementById('bills-manager-modal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.id = 'bills-manager-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-[10001] flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-sm w-full max-h-[80vh] overflow-hidden flex flex-col">
                <div class="bg-gradient-to-r from-purple-500 to-indigo-600 px-4 py-3">
                    <h3 class="text-white font-bold text-sm">💰 Bills Manager</h3>
                    <p class="text-purple-100 text-xs">${Utils.escapeHtml(card.name)} • ${bills.length} record(s) • O/S ₹${fmt(outstandingAmt)}</p>
                </div>
                ${unpaidCount > 0 ? `
                <div class="px-3 py-2 bg-amber-50 border-b border-amber-100 flex items-center justify-between gap-2">
                    <p class="text-xs text-amber-700">${unpaidCount} unpaid bill(s) on this card</p>
                    <button onclick="Cards.clearAllUnpaidFromManager('${cardIdStr}')" class="text-[11px] bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded font-medium" title="Mark all unpaid as cleared (stale)">Clear All Unpaid</button>
                </div>
                ` : ''}
                <div class="flex-1 overflow-y-auto">${rowsHtml}</div>
                <div class="border-t flex items-center justify-between px-3 py-2">
                    <button onclick="Cards.resetAllBillsFromManager('${cardIdStr}')" class="text-[11px] text-red-500 hover:text-red-700 hover:underline" title="Delete every bill record on this card and zero outstanding">🗑 Reset all bills</button>
                    <button onclick="document.getElementById('bills-manager-modal').remove()" class="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },
    
    // Backward-compat: anywhere code still calls showPaymentHistory
    showPaymentHistory(cardId) { return this.showBillsManager(cardId); },
    
    /**
     * Bills Manager action: mark a single unpaid bill paid (no auto-clear of others).
     */
    markBillPaidFromManager(billId) {
        const bill = (window.DB.cardBills || []).find(b => String(b.id) === String(billId));
        if (!bill) { Utils.showError('Bill not found'); return; }
        const cardId = bill.cardId;
        const amount = parseFloat(bill.amount) || 0;
        const paidAt = new Date().toISOString();
        bill.isPaid = true;
        bill.paidAmount = amount;
        bill.paidType = bill.paidType === 'outstanding' ? 'outstanding' : 'bill';
        bill.paidAt = paidAt;
        const card = (window.DB.cards || []).find(c => String(c.id) === String(cardId));
        if (card) {
            const cur = parseFloat(String(card.outstanding).replace(/[₹,\s]/g, '')) || 0;
            card.outstanding = Math.max(0, cur - amount);
        }
        window.Storage.save();
        Utils.showSuccess('Bill marked as paid');
        this.render();
        // Refresh the manager modal so the user sees the updated row
        this.showBillsManager(cardId);
    },
    
    /**
     * Bills Manager action: delete one bill (manager handles re-render).
     */
    deleteBillFromManager(billId, cardId) {
        const idStr = String(billId);
        const bills = window.DB.cardBills || [];
        const idx = bills.findIndex(b => String(b.id) === idStr);
        if (idx === -1) { Utils.showError('Bill not found'); return; }
        const removed = bills[idx];
        bills.splice(idx, 1);
        // If we removed an unpaid bill, also pull its amount out of card.outstanding
        if (removed && !removed.isPaid) {
            const removedAmt = parseFloat(removed.amount) || 0;
            const card = (window.DB.cards || []).find(c => String(c.id) === String(cardId));
            if (card && removedAmt > 0) {
                const cur = parseFloat(String(card.outstanding).replace(/[₹,\s]/g, '')) || 0;
                card.outstanding = Math.max(0, cur - removedAmt);
            }
        }
        window.Storage.save();
        Utils.showSuccess('Bill deleted');
        this.render();
        this.showBillsManager(cardId);
    },
    
    /**
     * Bills Manager action: mark every unpaid bill on the card as cleared.
     * Does not record any payment; outstanding is left alone (use the
     * outstanding pencil ✎ to adjust separately).
     */
    clearAllUnpaidFromManager(cardId) {
        const cardIdStr = String(cardId);
        const cleared = this.clearOtherUnpaidBills(cardIdStr, null, new Date().toISOString());
        window.Storage.save();
        Utils.showSuccess(`${cleared} unpaid bill(s) cleared`);
        this.render();
        this.showBillsManager(cardId);
    },
    
    /**
     * Bills Manager action: nuke every bill record on this card and zero out
     * the card's outstanding. The escape hatch when SMS sync left the data
     * in an unrecoverable state. Confirms first.
     */
    async resetAllBillsFromManager(cardId) {
        const cardIdStr = String(cardId);
        const card = (window.DB.cards || []).find(c => String(c.id) === cardIdStr);
        const cardName = card ? card.name : 'this card';
        const removed = (window.DB.cardBills || []).filter(b => String(b.cardId) === cardIdStr).length;
        const ok = await window.Utils.confirm(
            `Delete ALL ${removed} bill record(s) on ${cardName} and reset outstanding to ₹0?\n\nThis cannot be undone.`,
            'Reset All Bills'
        );
        if (!ok) {
            return;
        }
        if (Array.isArray(window.DB.cardBills)) {
            window.DB.cardBills = window.DB.cardBills.filter(b => String(b.cardId) !== cardIdStr);
        }
        if (card) card.outstanding = 0;
        window.Storage.save();
        Utils.showSuccess('All bills reset');
        this.render();
        const modal = document.getElementById('bills-manager-modal');
        if (modal) modal.remove();
    },

    /**
     * Delete with confirmation
     */
    async deleteWithConfirm(id) {
        const card = this.getById(id);
        if (!card) return;
        
        const cardIdStr = String(id);
        
        // Check linked data
        const linkedExpenses = window.DB.expenses.filter(e => e.suggestedCard === card.name);
        const linkedBills = (window.DB.cardBills || []).filter(b => String(b.cardId) === cardIdStr);
        const activeEMIs = card.emis ? card.emis.filter(e => !e.completed) : [];
        
        // Create delete modal
        const existing = document.getElementById('delete-card-modal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.id = 'delete-card-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-[10001] flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
                <div class="bg-gradient-to-r from-red-500 to-rose-600 px-4 py-3">
                    <h3 class="text-white font-bold text-sm">🗑️ Delete Card</h3>
                    <p class="text-red-100 text-xs">${Utils.escapeHtml(card.name)}</p>
                </div>
                <div class="p-4 space-y-3">
                    ${linkedExpenses.length > 0 ? `
                    <div class="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                        ⚠️ ${linkedExpenses.length} expense(s) linked to this card
                    </div>
                    ` : ''}
                    ${activeEMIs.length > 0 ? `
                    <div class="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                        ⚠️ ${activeEMIs.length} active EMI(s) will stop auto-adding
                    </div>
                    ` : ''}
                    ${linkedBills.length > 0 ? `
                    <div class="text-xs text-blue-700 bg-blue-50 p-2 rounded">
                        📋 ${linkedBills.length} bill record(s) found
                    </div>
                    ` : ''}
                    
                    <div class="pt-2 border-t">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" id="delete-permanently-checkbox" class="w-4 h-4 text-red-600 rounded">
                            <span class="text-sm text-gray-700">Delete permanently (remove all bill history)</span>
                        </label>
                    </div>
                    
                    <p class="text-xs text-gray-500">This action cannot be undone.</p>
                </div>
                <div class="flex border-t">
                    <button onclick="document.getElementById('delete-card-modal').remove()" 
                            class="flex-1 py-3 text-gray-500 hover:bg-gray-50 transition-colors text-sm">Cancel</button>
                    <button onclick="Cards.executeDelete('${cardIdStr}')" 
                            class="flex-1 py-3 text-white bg-red-500 hover:bg-red-600 transition-colors text-sm font-medium">Delete</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },
    
    /**
     * Execute card deletion
     */
    executeDelete(id) {
        const cardIdStr = String(id);
        const permanentlyDelete = document.getElementById('delete-permanently-checkbox')?.checked || false;
        
        // Remove modal
        const modal = document.getElementById('delete-card-modal');
        if (modal) modal.remove();
        
        // Delete the card
        this.delete(id);
        
        // If permanent delete, also remove all bills for this card
        if (permanentlyDelete && window.DB.cardBills) {
            window.DB.cardBills = window.DB.cardBills.filter(b => String(b.cardId) !== cardIdStr);
            window.Storage.save();
        }
        
        this.render();
        Utils.showSuccess(permanentlyDelete ? 'Card and all bills deleted permanently' : 'Card deleted');
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
     * Toggle card details with authentication check
     */
    async toggleCardDetailsSecure(id) {
        const authenticated = await window.Security.requireAuthentication('View Card Details', 'cards');
        if (authenticated) {
            this.toggleCardDetails(id);
        }
    },
    
    /**
     * Edit card with authentication check
     */
    async editCardSecure(id) {
        const authenticated = await window.Security.requireAuthentication('Edit Card', 'cards');
        if (authenticated) {
            window.openCardModal(id);
        }
    },
    
    /**
     * Delete card with authentication check
     */
    async deleteCardSecure(id) {
        const authenticated = await window.Security.requireAuthentication('Delete Card', 'cards');
        if (authenticated) {
            this.deleteWithConfirm(id);
        }
    },

    /**
     * Show benefits in modal with better formatting
     */
    showBenefitsModal(id) {
        const card = this.getById(id);
        if (!card || !card.benefits) return;

        // Format benefits for better display via the unified AI renderer.
        const formattedBenefits = window.AIRenderer
            ? window.AIRenderer.toHtml(card.benefits)
            : this.formatBenefits(card.benefits);
        
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
                    ${(() => {
                        const f = this.getBenefitsFreshness(card);
                        return f.isStale ? `
                            <div class="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2">
                                <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                                <span><strong>Stale benefits:</strong> these were fetched ${f.label}. Bank reward terms can change — tap <strong>Refresh</strong> below to fetch the latest from the official site.</span>
                            </div>
                        ` : '';
                    })()}
                    ${(card.additionalData && card.additionalData.trim()) ? `
                        <div class="mb-3 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs">
                            <p class="font-bold mb-1">📝 Your Notes</p>
                            <p class="whitespace-pre-wrap">${Utils.escapeHtml(card.additionalData)}</p>
                            <p class="text-[10px] text-blue-700 mt-2 italic">AI Advisor treats these as authoritative.</p>
                        </div>
                    ` : ''}
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
        
        // Auto-update EMI progress based on elapsed months
        let dataChanged = false;
        emis.forEach(emi => {
            if (this.updateEMIProgress(emi)) {
                dataChanged = true;
            }
        });
        
        // Save if any EMI data was changed
        if (dataChanged) {
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
        
        // Build active EMIs HTML
        const activeEMIsHTML = activeEMIs.map(emi => {
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
                        ${totalAmount ? `<p class="text-xs font-semibold text-blue-700 ml-2">₹${Utils.formatIndianNumber(totalAmount)}</p>` : `<p class="text-[11px] font-medium text-amber-600 ml-2" title="This EMI has no monthly amount — edit it to set one">amount not set</p>`}
                    </div>
                    <p class="text-xs text-gray-600 mt-1">Progress: ${emi.paidCount}/${emi.totalCount} EMIs ${emi.emiAmount ? `(₹${Utils.formatIndianNumber(emi.emiAmount)}/month)` : ''}</p>
                    <div class="w-full bg-gray-200/60 rounded-full h-1.5 mt-1">
                        <div class="bg-blue-600 h-1.5 rounded-full" style="width: ${(emi.paidCount/emi.totalCount)*100}%"></div>
                    </div>
                </div>
                `;
            }).join('');
        
        // Build completed EMIs HTML
        const completedEMIsHTML = completedEMIs.map(emi => {
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
        }).join('');
        
        // Now build the complete HTML with tabs (always show both tabs)
        html = `
            <div class="bg-white rounded-xl border-2 border-blue-200 overflow-hidden mb-3">
                <!-- Tabs -->
                <div class="border-b border-blue-200">
                    <div class="flex justify-evenly">
                        <button onclick="Cards.switchEMITab(${cardId}, 'active')" 
                                id="emi-tab-${cardId}-active"
                                class="flex-1 px-3 py-2 text-xs font-semibold transition-colors border-b-2 border-blue-500 text-blue-600">
                            Active (${activeEMIs.length})
                        </button>
                        <button onclick="Cards.switchEMITab(${cardId}, 'completed')" 
                                id="emi-tab-${cardId}-completed"
                                class="flex-1 px-3 py-2 text-xs font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700">
                            Completed (${completedEMIs.length})
                        </button>
                    </div>
                </div>
                
                <!-- Tab Content: Active EMIs -->
                <div id="emi-content-${cardId}-active" class="p-3">
                    ${activeEMIs.length > 0 ? activeEMIsHTML : '<p class="text-gray-400 text-center py-4 text-sm">No active EMIs</p>'}
                </div>
                
                <!-- Tab Content: Completed EMIs -->
                <div id="emi-content-${cardId}-completed" class="p-3 hidden">
                    ${completedEMIs.length > 0 ? completedEMIsHTML : '<p class="text-gray-400 text-center py-4 text-sm">No completed EMIs</p>'}
                </div>
            </div>
        `;
        
        list.innerHTML = html;
        
        // Restore the current tab state for this card after re-rendering
        const currentTab = this.currentEMITabs[cardId] || 'active';
        if (currentTab === 'completed') {
            // Use setTimeout to ensure DOM is ready
            setTimeout(() => {
                this.switchEMITab(cardId, 'completed');
            }, 0);
        }
    },

    /**
     * Switch between Active and Completed tabs in EMIs
     */
    switchEMITab(cardId, tab) {
        // Store current tab for this card
        this.currentEMITabs[cardId] = tab;
        
        // Tab buttons
        const activeTab = document.getElementById(`emi-tab-${cardId}-active`);
        const completedTab = document.getElementById(`emi-tab-${cardId}-completed`);
        
        // Tab contents
        const activeContent = document.getElementById(`emi-content-${cardId}-active`);
        const completedContent = document.getElementById(`emi-content-${cardId}-completed`);
        
        if (tab === 'active') {
            // Activate active tab
            if (activeTab) {
                activeTab.className = 'flex-1 px-3 py-2 text-xs font-semibold transition-colors border-b-2 border-blue-500 text-blue-600';
            }
            if (completedTab) {
                completedTab.className = 'flex-1 px-3 py-2 text-xs font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700';
            }
            
            // Show active content
            if (activeContent) activeContent.classList.remove('hidden');
            if (completedContent) completedContent.classList.add('hidden');
        } else if (tab === 'completed') {
            // Activate completed tab
            if (activeTab) {
                activeTab.className = 'flex-1 px-3 py-2 text-xs font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700';
            }
            if (completedTab) {
                completedTab.className = 'flex-1 px-3 py-2 text-xs font-semibold transition-colors border-b-2 border-green-500 text-green-600';
            }
            
            // Show completed content
            if (activeContent) activeContent.classList.add('hidden');
            if (completedContent) completedContent.classList.remove('hidden');
        }
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
            Utils.showError('Please fill all required fields');
            return;
        }
        
        if (paidCount > totalCount) {
            Utils.showError('Paid EMIs cannot exceed total EMIs');
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
        Utils.showSuccess(emiId ? 'EMI updated!' : 'EMI added!');
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
            Utils.showSuccess('EMI marked as complete!');
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
        Utils.showSuccess('EMI deleted!');
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
                            
                            // Update card's outstanding amount (EMI adds to bill)
                            if (card.cardType === 'credit') {
                                const oldOutstanding = parseFloat(card.outstanding) || 0;
                                card.outstanding = oldOutstanding + parseFloat(emi.emiAmount);
                                console.log(`Auto-updated ${card.name} outstanding for EMI: ₹${oldOutstanding} → ₹${card.outstanding}`);
                            }
                            
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
    },

    // ==================== CARD GROUPS ====================
    
    /**
     * Get the group a card belongs to
     */
    getCardGroup(cardId) {
        const cardIdStr = String(cardId);
        if (!window.DB.cardGroups) return null;
        return window.DB.cardGroups.find(g => g.cardIds && g.cardIds.map(String).includes(cardIdStr));
    },
    
    /**
     * Check if card is primary in its group
     */
    isPrimaryCard(cardId) {
        const group = this.getCardGroup(cardId);
        return group && String(group.primaryCardId) === String(cardId);
    },
    
    /**
     * Get all cards in a group
     */
    getGroupCards(groupId) {
        const group = window.DB.cardGroups?.find(g => String(g.id) === String(groupId));
        if (!group || !group.cardIds) return [];
        return group.cardIds.map(cid => this.getById(cid)).filter(Boolean);
    },
    
    /**
     * Show Card Groups management modal
     */
    showGroupsModal() {
        const existing = document.getElementById('card-groups-modal');
        if (existing) existing.remove();
        
        const groups = window.DB.cardGroups || [];
        
        const modal = document.createElement('div');
        modal.id = 'card-groups-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-[10001] flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        
        const groupsHtml = groups.length === 0 
            ? '<p class="text-gray-500 text-sm text-center py-4">No card groups yet. Create one to link cards that share billing.</p>'
            : groups.map(g => {
                const cardCount = g.cardIds?.length || 0;
                const primaryCard = this.getById(g.primaryCardId);
                return `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg mb-2">
                    <div>
                        <p class="font-medium text-gray-800">${Utils.escapeHtml(g.name)}</p>
                        <p class="text-xs text-gray-500">${cardCount} card(s) • Limit: ₹${Utils.formatIndianNumber(g.sharedLimit || 0)}</p>
                        ${primaryCard ? `<p class="text-xs text-indigo-600">Primary: ${Utils.escapeHtml(primaryCard.name)}</p>` : ''}
                    </div>
                    <div class="flex gap-1">
                        <button onclick="Cards.showEditGroupModal('${g.id}')" class="text-blue-600 hover:text-blue-800 p-1" title="Edit">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        <button onclick="Cards.deleteGroup('${g.id}')" class="text-red-500 hover:text-red-700 p-1" title="Delete">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                        </button>
                    </div>
                </div>
                `;
            }).join('');
        
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
                <div class="bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3 flex justify-between items-center">
                    <h3 class="text-white font-bold">🔗 Card Groups</h3>
                    <button onclick="document.getElementById('card-groups-modal').remove()" class="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-1">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
                <div class="p-4 overflow-y-auto flex-1">
                    <p class="text-xs text-gray-600 mb-3">Group cards that share the same credit limit & billing. Bill payment on primary card marks all cards paid.</p>
                    ${groupsHtml}
                </div>
                <div class="p-3 border-t bg-gray-50">
                    <button onclick="Cards.showCreateGroupModal()" class="w-full py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors">
                        + Create Group
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },
    
    /**
     * Show create group modal
     */
    showCreateGroupModal() {
        this.showEditGroupModal(null);
    },
    
    /**
     * Show edit group modal
     */
    showEditGroupModal(groupId) {
        // Close groups list modal
        const listModal = document.getElementById('card-groups-modal');
        if (listModal) listModal.remove();
        
        const group = groupId ? window.DB.cardGroups?.find(g => String(g.id) === String(groupId)) : null;
        const isEdit = !!group;
        
        // Get available credit cards (not in any group, or in this group)
        const creditCards = window.DB.cards.filter(c => 
            c.cardType === 'credit' && !c.isPlaceholder
        );
        
        const existing = document.getElementById('edit-group-modal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.id = 'edit-group-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-[10002] flex items-center justify-center p-4';
        modal.onclick = (e) => { if (e.target === modal) Cards.closeEditGroupModal(true); };
        
        // Build cards checklist
        const cardsHtml = creditCards.map(card => {
            const inThisGroup = group && group.cardIds?.map(String).includes(String(card.id));
            const otherGroup = !inThisGroup && this.getCardGroup(card.id);
            const disabled = otherGroup ? 'disabled' : '';
            const checked = inThisGroup ? 'checked' : '';
            const label = otherGroup 
                ? `${Utils.escapeHtml(card.name)} <span class="text-xs text-gray-400">(in ${Utils.escapeHtml(otherGroup.name)})</span>`
                : Utils.escapeHtml(card.name);
            
            return `
            <label class="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer ${disabled ? 'opacity-50' : ''}">
                <input type="checkbox" name="group-cards" value="${card.id}" ${checked} ${disabled} 
                       class="w-4 h-4 text-indigo-600 rounded" onchange="Cards.updatePrimaryCardOptions()">
                <span class="text-sm">${label}</span>
            </label>
            `;
        }).join('');
        
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col">
                <div class="bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3">
                    <h3 class="text-white font-bold">${isEdit ? '✏️ Edit Group' : '➕ Create Group'}</h3>
                </div>
                <div class="p-4 overflow-y-auto flex-1 space-y-4">
                    <input type="hidden" id="group-id" value="${group?.id || ''}">
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Group Name</label>
                        <input type="text" id="group-name" value="${group?.name || ''}" 
                               placeholder="e.g., ICICI Main Account"
                               class="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Shared Credit Limit</label>
                        <div class="relative">
                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                            <input type="text" id="group-limit" value="${group?.sharedLimit || ''}" 
                                   placeholder="Combined limit for all cards"
                                   class="w-full p-2 pl-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Select Cards</label>
                        <div class="border rounded-lg max-h-40 overflow-y-auto">
                            ${cardsHtml || '<p class="p-3 text-gray-500 text-sm">No credit cards available</p>'}
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Primary Card (for billing)</label>
                        <select id="group-primary-card" class="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                            <option value="">Select primary card...</option>
                        </select>
                        <p class="text-xs text-gray-500 mt-1">Bills shown & payments tracked on this card</p>
                    </div>
                    
                    <div>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" id="group-share-bill" ${group?.shareBill !== false ? 'checked' : ''} class="w-4 h-4 text-indigo-600 rounded">
                            <span class="text-sm text-gray-700">Share bill payment (paying one marks all paid)</span>
                        </label>
                    </div>
                </div>
                <div class="flex border-t">
                    <button onclick="Cards.closeEditGroupModal(true)" class="flex-1 py-3 text-gray-500 hover:bg-gray-50 text-sm">Back</button>
                    <button onclick="Cards.saveGroup()" class="flex-1 py-3 text-white bg-indigo-500 hover:bg-indigo-600 text-sm font-medium">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Initialize primary card options
        setTimeout(() => this.updatePrimaryCardOptions(), 50);
    },
    
    /**
     * Close the edit group modal
     * @param {boolean} goBack - If true, return to groups list modal
     */
    closeEditGroupModal(goBack = false) {
        const modal = document.getElementById('edit-group-modal');
        if (modal) modal.remove();
        
        if (goBack) {
            this.showGroupsModal();
        }
    },
    
    /**
     * Update primary card dropdown options based on selected cards
     */
    updatePrimaryCardOptions() {
        const checkboxes = document.querySelectorAll('input[name="group-cards"]:checked');
        const select = document.getElementById('group-primary-card');
        const groupIdVal = document.getElementById('group-id')?.value;
        const group = groupIdVal ? window.DB.cardGroups?.find(g => String(g.id) === String(groupIdVal)) : null;
        const currentPrimary = group?.primaryCardId || null;
        
        if (!select) return;
        
        // Remember current selection if user already picked one
        const currentSelection = select.value;
        
        select.innerHTML = '<option value="">Select primary card...</option>';
        
        checkboxes.forEach(cb => {
            const card = this.getById(cb.value);
            if (card) {
                const option = document.createElement('option');
                option.value = card.id;
                option.textContent = card.name;
                // Restore selection: prefer current UI selection, then saved value
                if (currentSelection && String(card.id) === String(currentSelection)) {
                    option.selected = true;
                } else if (!currentSelection && String(card.id) === String(currentPrimary)) {
                    option.selected = true;
                }
                select.appendChild(option);
            }
        });
    },
    
    /**
     * Save group (create or update)
     */
    saveGroup() {
        const groupId = document.getElementById('group-id')?.value;
        const name = document.getElementById('group-name')?.value.trim();
        const limitStr = document.getElementById('group-limit')?.value.replace(/[₹,\s]/g, '');
        const sharedLimit = parseFloat(limitStr) || 0;
        const primaryCardId = document.getElementById('group-primary-card')?.value;
        const shareBill = document.getElementById('group-share-bill')?.checked;
        
        // Get selected cards
        const checkboxes = document.querySelectorAll('input[name="group-cards"]:checked');
        const cardIds = Array.from(checkboxes).map(cb => cb.value);
        
        // Validation
        if (!name) { Utils.showError('Please enter a group name'); return; }
        if (cardIds.length < 2) { Utils.showError('Select at least 2 cards for a group'); return; }
        if (!primaryCardId) { Utils.showError('Please select a primary card'); return; }
        
        if (!window.DB.cardGroups) window.DB.cardGroups = [];
        
        if (groupId) {
            // Update existing
            const group = window.DB.cardGroups.find(g => String(g.id) === String(groupId));
            if (group) {
                group.name = name;
                group.sharedLimit = sharedLimit;
                group.primaryCardId = primaryCardId;
                group.shareBill = shareBill;
                group.cardIds = cardIds;
            }
        } else {
            // Create new
            window.DB.cardGroups.push({
                id: Utils.generateId(),
                name,
                sharedLimit,
                primaryCardId,
                shareBill,
                cardIds,
                createdAt: Utils.getCurrentTimestamp()
            });
        }
        
        window.Storage.save();
        
        // Close edit modal and return to groups list
        const modal = document.getElementById('edit-group-modal');
        if (modal) modal.remove();
        
        Utils.showSuccess(groupId ? 'Group updated' : 'Group created');
        this.showGroupsModal(); // Return to groups list
        this.render();
    },
    
    /**
     * Delete a group
     */
    async deleteGroup(groupId) {
        const group = window.DB.cardGroups?.find(g => String(g.id) === String(groupId));
        if (!group) return;
        
        const confirmed = await Utils.confirm(`Delete group "${group.name}"?\n\nCards will remain but no longer be linked.`, 'Delete Group');
        if (!confirmed) return;
        
        window.DB.cardGroups = window.DB.cardGroups.filter(g => String(g.id) !== String(groupId));
        window.Storage.save();
        
        Utils.showSuccess('Group deleted');
        this.showGroupsModal();
        this.render();
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Cards = Cards;
}
