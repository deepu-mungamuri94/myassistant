/**
 * Card Bills Helper
 *
 * Bill amounts are managed manually by the user from the Cards page
 * (edit bill / edit outstanding / mark paid). This module only exposes
 * a few utility helpers that other modules read from:
 *   - getSummary()            : aggregated credit-card stats for the summary card
 *   - getCardBills(cardId)    : all bills for a card
 *   - getUnpaidBills()        : unpaid bills across all cards
 *   - relinkBillsOnCardAdd()  : move bills from a placeholder card onto a real one
 *
 * The previous SMS/email auto-import flow has been removed because it was
 * unreliable and caused stale bill/outstanding values that could not be
 * settled cleanly. The global is still named `SmsBills` to keep stored
 * references working.
 */

const SmsBills = {
    /**
     * Get bills for a specific card
     */
    getCardBills(cardId) {
        if (!window.DB.cardBills) return [];
        return window.DB.cardBills.filter(b => String(b.cardId) === String(cardId));
    },

    /**
     * Get all unpaid bills across cards
     */
    getUnpaidBills() {
        if (!window.DB.cardBills) return [];
        return window.DB.cardBills.filter(b => !b.isPaid);
    },

    /**
     * Aggregated summary used by the credit-cards summary header
     */
    getSummary() {
        const cards = (window.DB.cards || []).filter(c => c.cardType === 'credit' && !c.isPlaceholder);
        const placeholderCards = (window.DB.cards || []).filter(c => c.cardType === 'credit' && c.isPlaceholder);
        const allCardIds = (window.DB.cards || []).map(c => String(c.id));
        const bills = window.DB.cardBills || [];
        const groups = window.DB.cardGroups || [];

        const activeBills = bills.filter(b => allCardIds.includes(String(b.cardId)));

        // Credit limit: cards in a group share the group's limit (counted once)
        let totalCreditLimit = 0;
        const processedGroupIds = new Set();
        cards.forEach(card => {
            const cardIdStr = String(card.id);
            const group = groups.find(g => g.cardIds?.map(String).includes(cardIdStr));
            if (group) {
                if (!processedGroupIds.has(group.id)) {
                    totalCreditLimit += parseFloat(group.sharedLimit) || 0;
                    processedGroupIds.add(group.id);
                }
            } else {
                totalCreditLimit += parseFloat(card.creditLimit) || 0;
            }
        });

        const totalOutstanding = cards.reduce(
            (sum, c) => sum + (parseFloat(c.outstanding) || 0),
            0
        );

        // Count only the latest unpaid bill per card (or per group, when shared)
        let totalBillsDue = 0;
        let unpaidBillsCount = 0;
        const processedBillGroups = new Set();
        const cardIds = [...new Set(activeBills.map(b => String(b.cardId)))];
        cardIds.forEach(cardId => {
            const card = (window.DB.cards || []).find(c => String(c.id) === cardId);
            if (!card) return;

            const group = groups.find(g => g.cardIds?.map(String).includes(cardId) && g.shareBill);
            if (group) {
                if (String(group.primaryCardId) !== cardId) return;
                if (processedBillGroups.has(group.id)) return;
                processedBillGroups.add(group.id);
            }

            const cardBills = activeBills.filter(b => String(b.cardId) === cardId);
            cardBills.sort((a, b) => new Date(b.dueDate || b.parsedAt || 0) - new Date(a.dueDate || a.parsedAt || 0));
            const unpaidBill = cardBills.find(b => !b.isPaid);
            if (unpaidBill) {
                totalBillsDue += parseFloat(unpaidBill.amount) || 0;
                unpaidBillsCount++;
            }
        });

        let totalEmis = 0;
        let activeEmiCount = 0;
        cards.forEach(card => {
            if (card.emis && card.emis.length > 0) {
                card.emis.forEach(emi => {
                    if (!emi.completed && emi.emiAmount) {
                        totalEmis += parseFloat(emi.emiAmount) || 0;
                    }
                });
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
     * When a real card is added that matches a placeholder (same last 4 digits),
     * move the placeholder's bills onto the new card and remove the placeholder.
     */
    relinkBillsOnCardAdd(newCard) {
        if (!newCard || !newCard.cardNumber || !window.DB.cardBills) return;

        const newLast4 = newCard.cardNumber.slice(-4);
        const placeholder = (window.DB.cards || []).find(c =>
            c.isPlaceholder && c.cardNumber && c.cardNumber.slice(-4) === newLast4
        );
        if (!placeholder) return;

        window.DB.cardBills.forEach(bill => {
            if (String(bill.cardId) === String(placeholder.id)) {
                bill.cardId = newCard.id;
            }
        });

        const placeholderIndex = window.DB.cards.findIndex(c => c.id === placeholder.id);
        if (placeholderIndex !== -1) {
            window.DB.cards.splice(placeholderIndex, 1);
        }

        if (window.Storage && typeof window.Storage.save === 'function') {
            window.Storage.save();
        }
    }
};

if (typeof window !== 'undefined') {
    window.SmsBills = SmsBills;
}
