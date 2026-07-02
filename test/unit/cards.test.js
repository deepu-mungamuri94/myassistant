/**
 * Unit tests for Cards module
 * Tests card CRUD, validation, EMI calculations, and bill management
 */

const { loadModule } = require('../helpers/loadModule.js');

describe('Cards Module', () => {
  let Cards;

  beforeEach(() => {
    // Reset global mocks before each test
    window.DB = { cards: [], cardBills: [], settings: {} };
    window.Storage = { save: vi.fn(), flush: vi.fn() };
    window.Utils = {
      generateId: vi.fn(() => 'card-' + Math.random().toString(36).slice(2, 8)),
      getCurrentTimestamp: vi.fn(() => '2024-06-15T00:00:00.000Z'),
      formatIndianNumber: vi.fn(n => String(n)),
      escapeHtml: vi.fn(s => s),
      showError: vi.fn(),
      showSuccess: vi.fn(),
      showInfo: vi.fn(),
      showProgressModal: vi.fn(),
      showProgressSuccess: vi.fn(),
      showProgressError: vi.fn(),
      confirm: vi.fn(async () => true)
    };
    window.AIProvider = {
      isConfigured: vi.fn(() => false),
      callWithWebSearch: vi.fn(),
      suppressInfoMessages: false
    };
    window.Toast = { show: vi.fn(), success: vi.fn(), error: vi.fn() };
    window.Navigation = { showPage: vi.fn() };

    // Load module fresh for each test
    Cards = loadModule('modules/cards.js', 'Cards');
  });

  describe('Card Validation', () => {
    it('validates card number (13-19 digits)', async () => {
      // Valid card numbers
      await expect(Cards.add('Test Card', '4111111111111111', '12/25', '123', '', '', 'credit'))
        .resolves.toBeDefined();
      await expect(Cards.add('Test Card', '411111111111111', '12/25', '123', '', '', 'credit'))
        .resolves.toBeDefined();
      await expect(Cards.add('Test Card', '4111111111111111111', '12/25', '123', '', '', 'credit'))
        .resolves.toBeDefined();

      // Invalid card numbers
      await expect(Cards.add('Test Card', '411111111111', '12/25', '123'))
        .rejects.toThrow('Invalid card number (13-19 digits required)');
      await expect(Cards.add('Test Card', '41111111111111111111', '12/25', '123'))
        .rejects.toThrow('Invalid card number (13-19 digits required)');
      await expect(Cards.add('Test Card', 'abcd1234abcd1234', '12/25', '123'))
        .rejects.toThrow('Invalid card number (13-19 digits required)');
    });

    it('validates expiry format (MM/YY or MM/YYYY)', async () => {
      // Valid expiry formats
      await expect(Cards.add('Test Card', '4111111111111111', '12/25', '123'))
        .resolves.toBeDefined();
      await expect(Cards.add('Test Card', '4111111111111111', '01/2025', '123'))
        .resolves.toBeDefined();

      // Invalid expiry formats - only checks format, not validity of month/year
      // (The regex /^\d{2}\/\d{2,4}$/ accepts any 2 digits for month)
      await expect(Cards.add('Test Card', '4111111111111111', '1/25', '123'))
        .rejects.toThrow('Invalid expiry format (use MM/YY or MM/YYYY)');
      await expect(Cards.add('Test Card', '4111111111111111', '12-25', '123'))
        .rejects.toThrow('Invalid expiry format (use MM/YY or MM/YYYY)');
    });

    it('validates CVV (3-4 digits)', async () => {
      // Valid CVV
      await expect(Cards.add('Test Card', '4111111111111111', '12/25', '123'))
        .resolves.toBeDefined();
      await expect(Cards.add('Test Card', '4111111111111111', '12/25', '1234'))
        .resolves.toBeDefined();

      // Invalid CVV
      await expect(Cards.add('Test Card', '4111111111111111', '12/25', '12'))
        .rejects.toThrow('Invalid CVV (3-4 digits required)');
      await expect(Cards.add('Test Card', '4111111111111111', '12/25', '12345'))
        .rejects.toThrow('Invalid CVV (3-4 digits required)');
      await expect(Cards.add('Test Card', '4111111111111111', '12/25', 'abc'))
        .rejects.toThrow('Invalid CVV (3-4 digits required)');
    });

    it('requires all mandatory fields', async () => {
      await expect(Cards.add('', '4111111111111111', '12/25', '123'))
        .rejects.toThrow('Please fill in all required fields');
      await expect(Cards.add('Test Card', '', '12/25', '123'))
        .rejects.toThrow('Please fill in all required fields');
      await expect(Cards.add('Test Card', '4111111111111111', '', '123'))
        .rejects.toThrow('Please fill in all required fields');
      await expect(Cards.add('Test Card', '4111111111111111', '12/25', ''))
        .rejects.toThrow('Please fill in all required fields');
    });

    it('strips spaces from card number before validation', async () => {
      const card = await Cards.add('Test Card', '4111 1111 1111 1111', '12/25', '123');
      expect(card.cardNumber).toBe('4111111111111111');
    });
  });

  describe('Card CRUD Operations', () => {
    it('adds a new credit card', async () => {
      const card = await Cards.add('HDFC Regalia', '4111111111111111', '12/25', '123',
        'Platinum card', '500000', 'credit', '10000', '17', '2');

      expect(card).toBeDefined();
      expect(card.name).toBe('HDFC Regalia');
      expect(card.cardNumber).toBe('4111111111111111');
      expect(card.expiry).toBe('12/25');
      expect(card.cvv).toBe('123');
      expect(card.cardType).toBe('credit');
      expect(card.creditLimit).toBe('500000');
      expect(card.outstanding).toBe(10000);
      expect(card.statementDate).toBe(17);
      expect(card.billDate).toBe(2);
      expect(card.additionalData).toBe('Platinum card');
      expect(card.benefits).toBeNull();
      expect(card.emis).toEqual([]);
      expect(window.DB.cards).toContain(card);
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('adds a new debit card', async () => {
      const card = await Cards.add('HDFC Debit', '5111111111111111', '12/25', '123',
        '', '', 'debit');

      expect(card.cardType).toBe('debit');
      expect(card.creditLimit).toBe('');
      expect(card.outstanding).toBe(0);
      expect(card.statementDate).toBeNull();
      expect(card.billDate).toBeNull();
      expect(card.benefits).toBeNull();
    });

    it('retrieves card by ID', async () => {
      const card = await Cards.add('Test Card', '4111111111111111', '12/25', '123');
      const retrieved = Cards.getById(card.id);
      expect(retrieved).toBe(card);
    });

    it('retrieves card by ID (string or number)', async () => {
      const card = await Cards.add('Test Card', '4111111111111111', '12/25', '123');
      expect(Cards.getById(card.id)).toBe(card);
      expect(Cards.getById(String(card.id))).toBe(card);
    });

    it('returns undefined for non-existent card', () => {
      expect(Cards.getById('non-existent-id')).toBeUndefined();
    });

    it('gets all cards', async () => {
      await Cards.add('Card 1', '4111111111111111', '12/25', '123');
      await Cards.add('Card 2', '5111111111111111', '12/25', '123');

      const all = Cards.getAll();
      expect(all.length).toBe(2);
      expect(all[0].name).toBe('Card 1');
      expect(all[1].name).toBe('Card 2');
    });

    it('updates a card', async () => {
      const card = await Cards.add('Old Name', '4111111111111111', '12/25', '123', '', '100000', 'credit', '5000');

      const updated = await Cards.update(card.id, 'New Name', '4111111111111112', '01/26', '456',
        'Updated note', '200000', 'credit', 10000, '15', '5');

      expect(updated.name).toBe('New Name');
      expect(updated.cardNumber).toBe('4111111111111112');
      expect(updated.expiry).toBe('01/26');
      expect(updated.cvv).toBe('456');
      expect(updated.creditLimit).toBe('200000');
      expect(updated.outstanding).toBe(10000);
      expect(updated.statementDate).toBe(15);
      expect(updated.billDate).toBe(5);
      expect(updated.additionalData).toBe('Updated note');
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('deletes a card', async () => {
      const card = await Cards.add('Test Card', '4111111111111111', '12/25', '123');
      expect(window.DB.cards.length).toBe(1);

      Cards.delete(card.id);

      expect(window.DB.cards.length).toBe(0);
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('deletes card by string or number ID', async () => {
      const card1 = await Cards.add('Card 1', '4111111111111111', '12/25', '123');
      const card2 = await Cards.add('Card 2', '5111111111111111', '12/25', '123');

      Cards.delete(String(card1.id));
      expect(window.DB.cards.length).toBe(1);

      Cards.delete(card2.id);
      expect(window.DB.cards.length).toBe(0);
    });
  });

  describe('Card Utility Methods', () => {
    it('masks card number showing only last 4 digits', () => {
      expect(Cards.maskCardNumber('4111111111111111')).toBe('•••• •••• •••• 1111');
      expect(Cards.maskCardNumber('5111111111111111')).toBe('•••• •••• •••• 1111');
      expect(Cards.maskCardNumber('411111111111111')).toBe('•••• •••• •••• 1111'); // 15 digits
    });

    it('identifies card type from first digit', () => {
      expect(Cards.getCardType('4111111111111111')).toBe('Visa');
      expect(Cards.getCardType('5111111111111111')).toBe('Mastercard');
      expect(Cards.getCardType('3111111111111111')).toBe('Amex');
      expect(Cards.getCardType('6111111111111111')).toBe('Discover');
      expect(Cards.getCardType('2111111111111111')).toBe('Unknown');
    });
  });

  describe('EMI Calculations', () => {
    it('calculates used limit from active EMIs', () => {
      const card = {
        id: 'card-1',
        emis: [
          { emiAmount: '5000', paidCount: 2, totalCount: 10, completed: false },
          { emiAmount: '3000', paidCount: 5, totalCount: 12, completed: false },
          { emiAmount: '2000', paidCount: 10, totalCount: 10, completed: true } // Completed
        ]
      };

      // Used = (5000 * 8 remaining) + (3000 * 7 remaining) = 40000 + 21000 = 61000
      expect(Cards.calculateUsedLimit(card)).toBe(61000);
    });

    it('returns 0 used limit when no active EMIs', () => {
      expect(Cards.calculateUsedLimit({ emis: [] })).toBe(0);
      expect(Cards.calculateUsedLimit({ emis: [
        { emiAmount: '2000', paidCount: 10, totalCount: 10, completed: true }
      ]})).toBe(0);
    });

    it('updates EMI progress based on elapsed months', () => {
      // Mock the current date
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15'));

      const firstEmiDate = new Date('2024-01-15'); // 5 months ago

      const emi = {
        firstEmiDate: firstEmiDate.toISOString(),
        totalCount: 12,
        paidCount: 0,
        completed: false
      };

      const updated = Cards.updateEMIProgress(emi);

      expect(updated).toBe(true);
      expect(emi.paidCount).toBe(6); // 5 months + first EMI = 6 paid
      expect(emi.completed).toBe(false);

      vi.useRealTimers();
    });

    it('marks EMI as completed when all payments elapsed', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15'));

      const firstEmiDate = new Date('2023-01-15'); // 17 months ago

      const emi = {
        firstEmiDate: firstEmiDate.toISOString(),
        totalCount: 12,
        paidCount: 0,
        completed: false
      };

      const updated = Cards.updateEMIProgress(emi);

      expect(updated).toBe(true);
      expect(emi.paidCount).toBe(12);
      expect(emi.completed).toBe(true);

      vi.useRealTimers();
    });

    it('does not update EMI if already completed', () => {
      const emi = {
        firstEmiDate: '2024-01-15T00:00:00.000Z',
        totalCount: 12,
        paidCount: 12,
        completed: true
      };

      const updated = Cards.updateEMIProgress(emi);
      expect(updated).toBe(false);
    });

    it('does not update EMI if no firstEmiDate', () => {
      const emi = {
        firstEmiDate: null,
        totalCount: 12,
        paidCount: 0,
        completed: false
      };

      const updated = Cards.updateEMIProgress(emi);
      expect(updated).toBe(false);
    });

    it('gets EMI summary for card', () => {
      const card = {
        id: 'card-1',
        emis: [
          {
            emiAmount: '5000',
            paidCount: 2,
            totalCount: 10,
            completed: false,
            firstEmiDate: '2024-01-15T00:00:00.000Z'
          },
          {
            emiAmount: '3000',
            paidCount: 5,
            totalCount: 12,
            completed: false,
            firstEmiDate: '2024-02-10T00:00:00.000Z'
          }
        ]
      };

      const summary = Cards.getEMISummary(card);

      expect(summary).toBeDefined();
      expect(summary.totalEMIAmount).toBe(86000); // (5000*10) + (3000*12)
      expect(summary.totalPending).toBe(61000); // (5000*8) + (3000*7)
      expect(summary.totalPaid).toBe(25000); // (5000*2) + (3000*5)
      expect(summary.progress).toBe(29); // Math.round(25000/86000 * 100)
      expect(summary.activeCount).toBe(2);
      expect(summary.nextEMIDate).toBeDefined();
    });

    it('returns null EMI summary for card with no active EMIs', () => {
      expect(Cards.getEMISummary({ emis: [] })).toBeNull();
      expect(Cards.getEMISummary({ emis: [
        { emiAmount: '2000', paidCount: 10, totalCount: 10, completed: true }
      ]})).toBeNull();
    });
  });

  describe('Benefits Freshness', () => {
    it('returns not fetched for card without benefits', () => {
      const card = { id: 'card-1', benefits: null, benefitsFetchedAt: null };
      const freshness = Cards.getBenefitsFreshness(card);

      expect(freshness.hasBenefits).toBe(false);
      expect(freshness.ageDays).toBe(0);
      expect(freshness.isStale).toBe(false);
      expect(freshness.label).toBe('Not fetched');
    });

    it('returns fresh for recently fetched benefits', () => {
      const card = {
        id: 'card-1',
        benefits: 'Some benefits text',
        benefitsFetchedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() // 10 days ago
      };
      const freshness = Cards.getBenefitsFreshness(card);

      expect(freshness.hasBenefits).toBe(true);
      expect(freshness.ageDays).toBe(10);
      expect(freshness.isStale).toBe(false);
      expect(freshness.label).toBe('10d old');
    });

    it('returns stale for old benefits (>180 days)', () => {
      const card = {
        id: 'card-1',
        benefits: 'Some benefits text',
        benefitsFetchedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString() // 200 days ago
      };
      const freshness = Cards.getBenefitsFreshness(card);

      expect(freshness.hasBenefits).toBe(true);
      expect(freshness.ageDays).toBe(200);
      expect(freshness.isStale).toBe(true);
      expect(freshness.label).toBe('6 mo old');
    });

    it('formats age labels correctly', () => {
      // Days
      let card = {
        benefits: 'text',
        benefitsFetchedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
      };
      expect(Cards.getBenefitsFreshness(card).label).toBe('15d old');

      // Months
      card = {
        benefits: 'text',
        benefitsFetchedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
      };
      expect(Cards.getBenefitsFreshness(card).label).toBe('3 mo old');

      // Years
      card = {
        benefits: 'text',
        benefitsFetchedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString()
      };
      expect(Cards.getBenefitsFreshness(card).label).toBe('1y+ old');
    });
  });

  describe('Bill Migration', () => {
    it('generates IDs for bills missing them', () => {
      window.DB.cardBills = [
        { cardId: 'card-1', amount: 5000 }, // No id
        { cardId: 'card-2', amount: 3000, id: '' }, // Empty id
        { cardId: 'card-3', amount: 2000, id: 'bill-123' } // Has id
      ];

      Cards.migrateCardBills();

      expect(window.DB.cardBills[0].id).toBeDefined();
      expect(window.DB.cardBills[0].id).not.toBe('');
      expect(window.DB.cardBills[1].id).toBeDefined();
      expect(window.DB.cardBills[1].id).not.toBe('');
      expect(window.DB.cardBills[2].id).toBe('bill-123');
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('normalizes cardId to string', () => {
      window.DB.cardBills = [
        { id: 'bill-1', cardId: 123, amount: 5000 }, // Numeric cardId
        { id: 'bill-2', cardId: '456', amount: 3000 } // String cardId
      ];

      Cards.migrateCardBills();

      expect(window.DB.cardBills[0].cardId).toBe('123');
      expect(window.DB.cardBills[1].cardId).toBe('456');
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('coerces amounts to numbers', () => {
      window.DB.cardBills = [
        { id: 'bill-1', cardId: 'card-1', amount: '5,000.00', paidAmount: '2,500' },
        { id: 'bill-2', cardId: 'card-2', amount: '₹3000', paidAmount: '₹1500' },
        { id: 'bill-3', cardId: 'card-3', amount: 1000, paidAmount: 500 } // Already numbers
      ];

      Cards.migrateCardBills();

      expect(window.DB.cardBills[0].amount).toBe(5000);
      expect(window.DB.cardBills[0].paidAmount).toBe(2500);
      expect(window.DB.cardBills[1].amount).toBe(3000);
      expect(window.DB.cardBills[1].paidAmount).toBe(1500);
      expect(window.DB.cardBills[2].amount).toBe(1000);
      expect(window.DB.cardBills[2].paidAmount).toBe(500);
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('handles malformed amounts gracefully', () => {
      window.DB.cardBills = [
        { id: 'bill-1', cardId: 'card-1', amount: 'invalid', paidAmount: 'xyz' }
      ];

      Cards.migrateCardBills();

      expect(window.DB.cardBills[0].amount).toBe(0);
      expect(window.DB.cardBills[0].paidAmount).toBe(0);
    });

    it('generates unique IDs for duplicate IDs', () => {
      window.DB.cardBills = [
        { id: 'bill-1', cardId: 'card-1', amount: 5000 },
        { id: 'bill-1', cardId: 'card-2', amount: 3000 }, // Duplicate id
        { id: 'bill-1', cardId: 'card-3', amount: 2000 }  // Duplicate id
      ];

      Cards.migrateCardBills();

      const ids = window.DB.cardBills.map(b => b.id);
      expect(new Set(ids).size).toBe(3); // All unique
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('does nothing for empty or missing cardBills', () => {
      window.DB.cardBills = [];
      Cards.migrateCardBills();
      expect(window.Storage.save).not.toHaveBeenCalled();

      window.DB.cardBills = null;
      Cards.migrateCardBills();
      expect(window.Storage.save).not.toHaveBeenCalled();
    });

    it('skips invalid bill entries', () => {
      window.DB.cardBills = [
        { id: 'bill-1', cardId: 'card-1', amount: 5000 },
        null, // Invalid
        'invalid', // Invalid
        { id: 'bill-2', cardId: 'card-2', amount: 3000 }
      ];

      Cards.migrateCardBills();

      // Should only process valid entries
      expect(window.DB.cardBills[0].id).toBe('bill-1');
      expect(window.DB.cardBills[3].id).toBe('bill-2');
    });
  });

  describe('Bill Management', () => {
    it('clears other unpaid bills when marking one paid', () => {
      window.DB.cardBills = [
        { id: 'bill-1', cardId: 'card-1', amount: 5000, isPaid: false },
        { id: 'bill-2', cardId: 'card-1', amount: 3000, isPaid: false },
        { id: 'bill-3', cardId: 'card-1', amount: 2000, isPaid: false }
      ];

      const cleared = Cards.clearOtherUnpaidBills('card-1', 'bill-1', new Date().toISOString());

      expect(cleared).toBe(2);
      expect(window.DB.cardBills[0].isPaid).toBe(false); // Kept
      expect(window.DB.cardBills[1].isPaid).toBe(true); // Cleared
      expect(window.DB.cardBills[1].paidType).toBe('cleared');
      expect(window.DB.cardBills[1].paidAmount).toBe(0);
      expect(window.DB.cardBills[2].isPaid).toBe(true); // Cleared
      expect(window.DB.cardBills[2].paidType).toBe('cleared');
    });

    it('does not clear bills for other cards', () => {
      window.DB.cardBills = [
        { id: 'bill-1', cardId: 'card-1', amount: 5000, isPaid: false },
        { id: 'bill-2', cardId: 'card-2', amount: 3000, isPaid: false }
      ];

      const cleared = Cards.clearOtherUnpaidBills('card-1', 'bill-1', new Date().toISOString());

      expect(cleared).toBe(0);
      expect(window.DB.cardBills[1].isPaid).toBe(false);
    });

    it('does not clear already paid bills', () => {
      window.DB.cardBills = [
        { id: 'bill-1', cardId: 'card-1', amount: 5000, isPaid: false },
        { id: 'bill-2', cardId: 'card-1', amount: 3000, isPaid: true }
      ];

      const cleared = Cards.clearOtherUnpaidBills('card-1', 'bill-1', new Date().toISOString());

      expect(cleared).toBe(0);
    });

    it('clears all unpaid bills when keepBillId is null', () => {
      window.DB.cardBills = [
        { id: 'bill-1', cardId: 'card-1', amount: 5000, isPaid: false },
        { id: 'bill-2', cardId: 'card-1', amount: 3000, isPaid: false }
      ];

      const cleared = Cards.clearOtherUnpaidBills('card-1', null, new Date().toISOString());

      expect(cleared).toBe(2);
      expect(window.DB.cardBills[0].isPaid).toBe(true);
      expect(window.DB.cardBills[1].isPaid).toBe(true);
    });
  });

  describe('Due Date Calculations', () => {
    beforeEach(() => {
      // Mock today as June 15, 2024
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calculates next due date when bill day is after statement day', () => {
      // Statement on 10th, bill due on 25th (same month)
      const result = Cards.calculateNextDueDate(10, 25);
      expect(result).toBe('25 Jun'); // This month since we haven't passed 25th yet
    });

    it('calculates next due date when bill day is before statement day', () => {
      // Statement on 17th, bill due on 5th (next month)
      const result = Cards.calculateNextDueDate(17, 5);
      expect(result).toBe('5 Jul'); // Next month
    });

    it('handles month rollover correctly', () => {
      vi.setSystemTime(new Date('2024-12-20'));
      // Statement on 15th, bill due on 5th (next month crosses year)
      const result = Cards.calculateNextDueDate(15, 5);
      expect(result).toContain('Jan'); // Should be Jan of next year
    });

    it('returns empty string when no bill day provided', () => {
      expect(Cards.calculateNextDueDate(15, null)).toBe('');
      expect(Cards.calculateNextDueDate(15, undefined)).toBe('');
    });
  });
});
