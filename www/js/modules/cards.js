/**
 * Cards Module
 * Handles credit card information management
 */

const Cards = {
    /**
     * Add a new card (fetches benefits automatically)
     */
    async add(name, cardNumber, expiry, cvv) {
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
            benefits: null, // Will be fetched
            benefitsFetchedAt: null,
            createdAt: Utils.getCurrentTimestamp()
        };
        
        // Add card to DB immediately
        window.DB.cards.push(card);
        window.Storage.save();
        
        // Fetch benefits in background (don't block)
        this.fetchAndStoreBenefits(card.id, name).catch(err => {
            console.error('Failed to fetch card benefits:', err);
        });
        
        return card;
    },

    /**
     * Fetch card benefits from AI and store in database
     */
    async fetchAndStoreBenefits(cardId, cardName) {
        try {
            // Check if AI is configured
            if (!window.AIProvider || !window.AIProvider.isConfigured()) {
                console.warn('AI not configured, skipping benefits fetch');
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
        } catch (error) {
            console.error(`Failed to fetch benefits for ${cardName}:`, error);
            // Don't show error toast - this is background operation
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
            
            await this.fetchAndStoreBenefits(cardId, card.name);
            
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
    async update(id, name, cardNumber, expiry, cvv) {
        if (!name || !cardNumber || !expiry || !cvv) {
            throw new Error('Please fill in all required fields');
        }
        
        // Debug logging
        console.log('=== UPDATE DEBUG ===');
        console.log('Received ID:', id, 'Type:', typeof id);
        console.log('All card IDs in DB:', window.DB.cards.map(c => ({ id: c.id, type: typeof c.id, name: c.name })));
        
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
        console.log('Found card:', card);
        if (!card) {
            console.error('Card not found! Searched for ID:', id);
            throw new Error('Card not found');
        }
        
        // Check if card name changed (only fetch benefits if name changed)
        const nameChanged = card.name !== name;
        console.log('Card name changed:', nameChanged, 'Old:', card.name, 'New:', name);
        
        // Update card fields
        card.name = name;
        card.cardNumber = cleanCardNumber;
        card.expiry = expiry;
        card.cvv = cvv;
        card.lastUpdated = Utils.getCurrentTimestamp();
        
        // Save to storage
        window.Storage.save();
        
        // Only re-fetch benefits if card name changed
        if (nameChanged) {
            console.log('Card name changed - fetching new benefits...');
            this.fetchAndStoreBenefits(card.id, name).catch(err => {
                console.error('Failed to fetch benefits for updated card:', err);
            });
        } else {
            console.log('Card name unchanged - skipping benefits fetch');
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
        console.log('getById - Searching for:', searchId, 'Original:', id, 'Type:', typeof id);
        const result = window.DB.cards.find(c => {
            const cardIdStr = String(c.id);
            const match = cardIdStr === searchId;
            console.log(`  Comparing: "${cardIdStr}" === "${searchId}" = ${match}`);
            return match;
        });
        console.log('getById - Result:', result ? `Found: ${result.name}` : 'NOT FOUND');
        return result;
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
     * Render cards list
     */
    render() {
        const list = document.getElementById('cards-list');
        
        if (!list) return;
        
        if (window.DB.cards.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-center py-8">No cards yet. Add your first one above!</p>';
            return;
        }
        
        list.innerHTML = window.DB.cards.map(card => `
            <div class="p-4 bg-gradient-to-r from-green-100 to-emerald-100 rounded-xl border-2 border-green-300 hover:shadow-lg transition-all">
                <!-- Top Section: Card Details and Actions -->
                <div class="flex justify-between items-start mb-3">
                    <div class="flex-1">
                        <h4 class="font-bold text-green-800 text-lg">${Utils.escapeHtml(card.name)}</h4>
                        
                        <!-- Card Number -->
                        <p class="text-sm text-gray-600 font-mono mt-1" id="card-num-${card.id}">${this.maskCardNumber(card.cardNumber)}</p>
                        
                        <!-- Expiry and CVV -->
                        <div class="flex items-center gap-3 mt-1">
                            <span class="text-xs text-gray-500">Expiry: ${Utils.escapeHtml(card.expiry)}</span>
                            <span class="text-xs text-gray-500">CVV: <span id="card-cvv-${card.id}">•••</span></span>
                        </div>
                        
                    </div>
                    
                    <!-- Top Right Actions: View, Edit, Delete -->
                    <div class="flex gap-2 ml-3">
                        <button onclick="Cards.toggleCardDetails(${card.id})" class="text-blue-500 hover:text-blue-700 p-1" title="Show/Hide card details">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                            </svg>
                        </button>
                        <button onclick="openCardModal(${card.id})" class="text-green-600 hover:text-green-800 p-1" title="Edit">
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
                
                <!-- Bottom Section: Card Rules -->
                <div class="pt-3 border-t border-green-200">
                    <div class="flex justify-between items-center">
                        <span class="text-sm font-semibold text-green-800">💳 Card Rules</span>
                        <div class="flex gap-2">
                            <button onclick="${card.benefits ? `Cards.showBenefitsModal(${card.id})` : 'void(0)'}" 
                                    class="text-xs ${card.benefits ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-400 cursor-not-allowed opacity-60'} text-white px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 shadow-sm"
                                    title="${card.benefits ? 'View full benefits' : 'No rules fetched yet - click Update Rules first'}"
                                    ${!card.benefits ? 'disabled' : ''}>
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                </svg>
                                View
                            </button>
                            <button onclick="Cards.refreshBenefits(${card.id})" 
                                    id="refresh-btn-${card.id}"
                                    class="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 shadow-sm"
                                    title="Fetch latest rules">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                                </svg>
                                <span id="refresh-text-${card.id}">Update Rules</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
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
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Cards = Cards;
}
