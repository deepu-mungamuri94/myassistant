const { loadModule } = require('../helpers/loadModule.js');

describe('Investments Module', () => {
  let Investments;

  beforeAll(() => {
    Investments = loadModule('modules/investments.js', 'Investments');
  });

  beforeEach(() => {
    window.DB = {
      portfolioInvestments: [],
      monthlyInvestments: [],
      sharePrices: [],
      exchangeRate: { rate: 83.5, updatedAt: '2024-01-01' },
      goldRatePerGram: { rate: 7500, updatedAt: '2024-01-01', purity: '22K' },
      settings: { paySchedule: 'first_week' }
    };
    window.Storage = { save: vi.fn(), flush: vi.fn() };
    window.Utils = {
      generateId: vi.fn(() => 'inv-' + Date.now()),
      getCurrentTimestamp: vi.fn(() => '2024-01-01T00:00:00.000Z'),
      formatIndianNumber: vi.fn(n => String(n)),
      escapeHtml: vi.fn(s => s),
      showError: vi.fn(),
      showSuccess: vi.fn(),
      showInfo: vi.fn(),
      formatLocalDate: vi.fn(d => d.toISOString().split('T')[0])
    };
    window.StockAPI = { fetchStockPrice: vi.fn(), fetchAllPrices: vi.fn() };
    window.AIProvider = { call: vi.fn() };
    window.Toast = { show: vi.fn(), success: vi.fn(), error: vi.fn() };
    window.Navigation = { showPage: vi.fn() };
    document.getElementById = vi.fn(() => null);
    document.querySelector = vi.fn(() => null);
    document.querySelectorAll = vi.fn(() => []);
    document.addEventListener = vi.fn();
  });

  afterEach(() => {
    // Restore all mocks to prevent test pollution
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('should initialize exchange rate with default value if not set', () => {
      delete window.DB.exchangeRate;
      Investments.init();

      expect(window.DB.exchangeRate).toEqual({ rate: 89, updatedAt: null });
    });

    it('should migrate legacy numeric exchange rate to object format', () => {
      window.DB.exchangeRate = 85;
      Investments.init();

      expect(window.DB.exchangeRate).toEqual({ rate: 85, updatedAt: null });
    });

    it('should initialize gold rate with default value if not set', () => {
      delete window.DB.goldRatePerGram;
      Investments.init();

      expect(window.DB.goldRatePerGram).toEqual({ rate: 9000, updatedAt: null, purity: '22K' });
    });

    it('should migrate legacy numeric gold rate to object format with 22K default', () => {
      window.DB.goldRatePerGram = 8500;
      Investments.init();

      expect(window.DB.goldRatePerGram).toEqual({ rate: 8500, updatedAt: null, purity: '22K' });
    });

    it('should initialize empty portfolioInvestments array if not set', () => {
      delete window.DB.portfolioInvestments;
      Investments.init();

      expect(window.DB.portfolioInvestments).toEqual([]);
    });

    it('should initialize empty monthlyInvestments array if not set', () => {
      delete window.DB.monthlyInvestments;
      Investments.init();

      expect(window.DB.monthlyInvestments).toEqual([]);
    });

    it('should initialize empty sharePrices array if not set', () => {
      delete window.DB.sharePrices;
      Investments.init();

      expect(window.DB.sharePrices).toEqual([]);
    });
  });

  describe('getExchangeRate', () => {
    it('should return rate from object format', () => {
      window.DB.exchangeRate = { rate: 84.5, updatedAt: '2024-01-01' };

      expect(Investments.getExchangeRate()).toBe(84.5);
    });

    it('should handle legacy numeric format', () => {
      window.DB.exchangeRate = 82;

      expect(Investments.getExchangeRate()).toBe(82);
    });

    it('should return default 89 if not set', () => {
      delete window.DB.exchangeRate;

      expect(Investments.getExchangeRate()).toBe(89);
    });
  });

  describe('getGoldRate', () => {
    it('should return rate from object format', () => {
      window.DB.goldRatePerGram = { rate: 7800, updatedAt: '2024-01-01', purity: '22K' };

      expect(Investments.getGoldRate()).toBe(7800);
    });

    it('should handle legacy numeric format', () => {
      window.DB.goldRatePerGram = 7200;

      expect(Investments.getGoldRate()).toBe(7200);
    });

    it('should return default 9000 if not set', () => {
      delete window.DB.goldRatePerGram;

      expect(Investments.getGoldRate()).toBe(9000);
    });
  });

  describe('setExchangeRate', () => {
    it('should set exchange rate with timestamp', () => {
      const mockDate = new Date('2024-06-15T10:30:00Z');
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate);

      Investments.setExchangeRate(85.5);

      expect(window.DB.exchangeRate).toEqual({
        rate: 85.5,
        updatedAt: '2024-06-15T10:30:00.000Z'
      });
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('should throw error for invalid rate', () => {
      expect(() => Investments.setExchangeRate(0)).toThrow('Invalid exchange rate');
      expect(() => Investments.setExchangeRate(-5)).toThrow('Invalid exchange rate');
      expect(() => Investments.setExchangeRate(null)).toThrow('Invalid exchange rate');
    });
  });

  describe('setGoldRate', () => {
    it('should set gold rate with timestamp and purity', () => {
      const mockDate = new Date('2024-06-15T10:30:00Z');
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate);

      Investments.setGoldRate(8200, '24K');

      expect(window.DB.goldRatePerGram).toEqual({
        rate: 8200,
        updatedAt: '2024-06-15T10:30:00.000Z',
        purity: '24K'
      });
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('should throw error for invalid rate', () => {
      expect(() => Investments.setGoldRate(0)).toThrow('Invalid gold rate');
      expect(() => Investments.setGoldRate(-100)).toThrow('Invalid gold rate');
      expect(() => Investments.setGoldRate(null)).toThrow('Invalid gold rate');
    });
  });

  describe('calculatePortfolioAmount', () => {
    const exchangeRate = 84;
    const goldRate = 7500;
    const sharePrices = [];

    it('should calculate amount for SHARES in INR', () => {
      const inv = { type: 'SHARES', name: 'Reliance', quantity: 10, price: 2500, currency: 'INR' };

      const amount = Investments.calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePrices);

      expect(amount).toBe(25000);
    });

    it('should calculate amount for SHARES in USD', () => {
      const inv = { type: 'SHARES', name: 'Apple', quantity: 5, price: 150, currency: 'USD' };

      const amount = Investments.calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePrices);

      expect(amount).toBe(5 * 150 * 84); // 63000
    });

    it('should use latest share price from storage if available', () => {
      const inv = { type: 'SHARES', name: 'TCS', quantity: 8, price: 3000, currency: 'INR' };
      const sharePricesWithData = [
        { name: 'TCS', price: 3200, currency: 'INR', active: true }
      ];

      const amount = Investments.calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePricesWithData);

      expect(amount).toBe(25600); // 8 * 3200
    });

    it('should calculate amount for MF', () => {
      const inv = { type: 'MF', name: 'HDFC Equity', quantity: 100, price: 150.5 };

      const amount = Investments.calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePrices);

      expect(amount).toBe(15050); // 100 * 150.5
    });

    it('should calculate amount for GOLD', () => {
      const inv = { type: 'GOLD', name: '22K Gold', quantity: 50 };

      const amount = Investments.calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePrices);

      expect(amount).toBe(375000); // 50 * 7500
    });

    it('should calculate amount for EPF', () => {
      const inv = { type: 'EPF', name: 'EPF Contribution', amount: 150000 };

      const amount = Investments.calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePrices);

      expect(amount).toBe(150000);
    });

    it('should calculate amount for FD', () => {
      const inv = { type: 'FD', name: 'HDFC Bank FD', amount: 200000 };

      const amount = Investments.calculatePortfolioAmount(inv, exchangeRate, goldRate, sharePrices);

      expect(amount).toBe(200000);
    });
  });

  describe('calculateMonthlyAmount', () => {
    const goldRate = 7500;

    it('should calculate amount for monthly SHARES in INR', () => {
      const inv = { type: 'SHARES', name: 'Infosys', quantity: 5, price: 1500, currency: 'INR' };

      const amount = Investments.calculateMonthlyAmount(inv, goldRate);

      expect(amount).toBe(7500);
    });

    it('should calculate amount for monthly SHARES in USD', () => {
      const inv = { type: 'SHARES', name: 'Tesla', quantity: 2, price: 200, currency: 'USD' };
      window.DB.exchangeRate = { rate: 84, updatedAt: '2024-01-01' };

      const amount = Investments.calculateMonthlyAmount(inv, goldRate);

      expect(amount).toBe(2 * 200 * 84); // 33600
    });

    it('should calculate amount for monthly MF', () => {
      const inv = { type: 'MF', name: 'Axis Bluechip', quantity: 50, price: 45.6789 };

      const amount = Investments.calculateMonthlyAmount(inv, goldRate);

      expect(amount).toBeCloseTo(2283.945, 2); // 50 * 45.6789 (handle floating point precision)
    });

    it('should calculate amount for monthly GOLD', () => {
      const inv = { type: 'GOLD', name: '22K Gold Coin', quantity: 10, price: 7500 };

      const amount = Investments.calculateMonthlyAmount(inv, goldRate);

      expect(amount).toBe(75000); // 10 * 7500
    });

    it('should calculate amount for monthly EPF', () => {
      const inv = { type: 'EPF', name: 'Monthly EPF', amount: 12000 };

      const amount = Investments.calculateMonthlyAmount(inv, goldRate);

      expect(amount).toBe(12000);
    });

    it('should calculate amount for monthly FD', () => {
      const inv = { type: 'FD', name: 'Monthly FD', amount: 50000 };

      const amount = Investments.calculateMonthlyAmount(inv, goldRate);

      expect(amount).toBe(50000);
    });
  });

  describe('groupByType', () => {
    it('should group investments by type', () => {
      const investments = [
        { id: 1, type: 'SHARES', name: 'Stock1' },
        { id: 2, type: 'MF', name: 'Fund1' },
        { id: 3, type: 'SHARES', name: 'Stock2' },
        { id: 4, type: 'GOLD', name: 'Gold1' },
        { id: 5, type: 'EPF', name: 'EPF1' }
      ];

      const grouped = Investments.groupByType(investments);

      expect(grouped.SHARES).toHaveLength(2);
      expect(grouped.MF).toHaveLength(1);
      expect(grouped.GOLD).toHaveLength(1);
      expect(grouped.EPF).toHaveLength(1);
      expect(grouped.FD).toBeUndefined();
    });

    it('should handle empty array', () => {
      const grouped = Investments.groupByType([]);

      expect(grouped).toEqual({});
    });
  });

  describe('groupByYearMonth', () => {
    it('should group investments by budget month (incomeMonth/incomeYear)', () => {
      const investments = [
        { id: 1, date: '2024-01-15', incomeMonth: 1, incomeYear: 2024 },
        { id: 2, date: '2024-01-20', incomeMonth: 1, incomeYear: 2024 },
        { id: 3, date: '2024-02-10', incomeMonth: 2, incomeYear: 2024 }
      ];

      const grouped = Investments.groupByYearMonth(investments);

      // The structure is {year: {month: [...]}}
      expect(grouped).toHaveProperty('2024');
      expect(grouped['2024']).toHaveProperty('1');
      expect(grouped['2024']).toHaveProperty('2');
      expect(grouped['2024']['1']).toHaveLength(2);
      expect(grouped['2024']['2']).toHaveLength(1);
    });

    it('should fallback to investment date if incomeMonth/incomeYear not set', () => {
      const investments = [
        { id: 1, date: '2024-03-15' },
        { id: 2, date: '2024-03-20' }
      ];

      const grouped = Investments.groupByYearMonth(investments);

      // The structure is {year: {month: [...]}}
      expect(grouped).toHaveProperty('2024');
      expect(grouped['2024']).toHaveProperty('3');
      expect(grouped['2024']['3']).toHaveLength(2);
    });
  });

  describe('suggestIncomeMonth', () => {
    it('should suggest current month for first_week pay schedule', () => {
      window.DB.settings = { paySchedule: 'first_week' };

      const result = Investments.suggestIncomeMonth('2024-06-15');

      expect(result).toEqual({ month: 6, year: 2024 });
    });

    it('should suggest next month for last_week pay schedule if day >= 25', () => {
      window.DB.settings = { paySchedule: 'last_week' };

      const result = Investments.suggestIncomeMonth('2024-06-27');

      // For last_week schedule, day 27 (>= 25) should suggest next month
      expect(result).toEqual({ month: 7, year: 2024 });
    });

    it('should suggest current month for last_week pay schedule if day < 25', () => {
      window.DB.settings = { paySchedule: 'last_week' };

      const result = Investments.suggestIncomeMonth('2024-06-20');

      expect(result).toEqual({ month: 6, year: 2024 });
    });

    it('should handle year rollover for December investments', () => {
      window.DB.settings = { paySchedule: 'last_week' };

      const result = Investments.suggestIncomeMonth('2024-12-28');

      expect(result).toEqual({ month: 1, year: 2025 });
    });
  });

  describe('updateSharePrice', () => {
    it('should add new share price for SHARES', () => {
      const mockDate = new Date('2024-06-15T10:30:00Z');
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate);

      Investments.updateSharePrice('TCS', 3500, 'INR', null, 'TCS.NS');

      expect(window.DB.sharePrices).toHaveLength(1);
      expect(window.DB.sharePrices[0]).toEqual({
        name: 'TCS',
        price: 3500,
        currency: 'INR',
        active: true,
        lastUpdated: '2024-06-15T10:30:00.000Z',
        ticker: 'TCS.NS'
      });
    });

    it('should update existing share price', () => {
      window.DB.sharePrices = [
        { name: 'Reliance', price: 2500, currency: 'INR', active: true, lastUpdated: '2024-01-01' }
      ];
      const mockDate = new Date('2024-06-15T10:30:00Z');
      vi.spyOn(global, 'Date').mockImplementation(() => mockDate);

      Investments.updateSharePrice('Reliance', 2700, 'INR');

      expect(window.DB.sharePrices).toHaveLength(1);
      expect(window.DB.sharePrices[0].price).toBe(2700);
      expect(window.DB.sharePrices[0].lastUpdated).toBe('2024-06-15T10:30:00.000Z');
    });

    it('should round MF NAV to 4 decimals', () => {
      Investments.updateSharePrice('HDFC Equity', 150.567891, 'INR', '12345');

      expect(window.DB.sharePrices[0].price).toBe(150.5679);
      expect(window.DB.sharePrices[0].schemeCode).toBe('12345');
    });

    it('should round share price to 2 decimals', () => {
      Investments.updateSharePrice('Infosys', 1234.567, 'INR', null, 'INFY.NS');

      expect(window.DB.sharePrices[0].price).toBe(1234.57);
    });

    it('should reactivate inactive share price', () => {
      window.DB.sharePrices = [
        { name: 'TCS', price: 3000, currency: 'INR', active: false, lastUpdated: '2024-01-01' }
      ];

      Investments.updateSharePrice('TCS', 3200, 'INR');

      expect(window.DB.sharePrices[0].active).toBe(true);
    });
  });

  describe('markSharePriceInactive', () => {
    it('should mark share price as inactive', () => {
      window.DB.sharePrices = [
        { name: 'TCS', price: 3000, currency: 'INR', active: true }
      ];

      Investments.markSharePriceInactive('TCS');

      expect(window.DB.sharePrices[0].active).toBe(false);
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('should do nothing if share not found', () => {
      window.DB.sharePrices = [];

      Investments.markSharePriceInactive('NonExistent');

      expect(window.Storage.save).not.toHaveBeenCalled();
    });
  });

  describe('markSharePriceActive', () => {
    it('should mark share price as active', () => {
      window.DB.sharePrices = [
        { name: 'TCS', price: 3000, currency: 'INR', active: false }
      ];

      Investments.markSharePriceActive('TCS');

      expect(window.DB.sharePrices[0].active).toBe(true);
      expect(window.Storage.save).toHaveBeenCalled();
    });
  });

  describe('getLatestSharePrice', () => {
    it('should return latest active share price', () => {
      window.DB.sharePrices = [
        { name: 'TCS', price: 3000, currency: 'INR', active: true },
        { name: 'Infosys', price: 1500, currency: 'INR', active: true }
      ];

      const price = Investments.getLatestSharePrice('TCS');

      expect(price).toEqual({ name: 'TCS', price: 3000, currency: 'INR', active: true });
    });

    it('should return undefined if not found', () => {
      window.DB.sharePrices = [];

      const price = Investments.getLatestSharePrice('NonExistent');

      expect(price).toBeUndefined();
    });

    it('should not return inactive share price', () => {
      window.DB.sharePrices = [
        { name: 'TCS', price: 3000, currency: 'INR', active: false }
      ];

      const price = Investments.getLatestSharePrice('TCS');

      expect(price).toBeUndefined();
    });
  });

  describe('applyDateFilterToInvestments', () => {
    let originalDate;

    beforeEach(() => {
      // Mock Date constructor to return a fixed date (2024-06-15)
      // This avoids issues with vi.useFakeTimers() breaking Date.now()
      originalDate = global.Date;
      const mockDate = new originalDate('2024-06-15T00:00:00.000Z');

      global.Date = class extends originalDate {
        constructor(...args) {
          if (args.length === 0) {
            super(mockDate);
          } else {
            super(...args);
          }
        }

        static now() {
          return mockDate.getTime();
        }
      };
    });

    afterEach(() => {
      global.Date = originalDate;
    });

    it('should filter investments for thisMonth', () => {
      Investments.dateFilter = 'thisMonth';
      const investments = [
        { id: 1, incomeMonth: 6, incomeYear: 2024 },
        { id: 2, incomeMonth: 5, incomeYear: 2024 },
        { id: 3, incomeMonth: 6, incomeYear: 2024 }
      ];

      const filtered = Investments.applyDateFilterToInvestments(investments);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe(1);
      expect(filtered[1].id).toBe(3);
    });

    it('should filter investments for thisYear', () => {
      Investments.dateFilter = 'thisYear';
      const investments = [
        { id: 1, incomeMonth: 1, incomeYear: 2024 },
        { id: 2, incomeMonth: 12, incomeYear: 2023 },
        { id: 3, incomeMonth: 6, incomeYear: 2024 }
      ];

      const filtered = Investments.applyDateFilterToInvestments(investments);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe(1);
      expect(filtered[1].id).toBe(3);
    });

    it('should return all investments for allTime', () => {
      Investments.dateFilter = 'allTime';
      const investments = [
        { id: 1, incomeMonth: 1, incomeYear: 2023 },
        { id: 2, incomeMonth: 6, incomeYear: 2024 }
      ];

      const filtered = Investments.applyDateFilterToInvestments(investments);

      expect(filtered).toHaveLength(2);
    });
  });

  describe('validateField', () => {
    beforeEach(() => {
      document.getElementById = vi.fn((id) => {
        const elements = {
          'investment-type': { value: 'SHARES' },
          'investment-quantity': { value: '10' },
          'investment-price': { value: '100' },
          'investment-amount': { value: '5000' },
          'investment-tenure': { value: '12' },
          'investment-interest-rate': { value: '6.5' },
          'investment-end-date': { value: '2025-01-01' }
        };
        return elements[id] || null;
      });
    });

    it('should validate quantity field - valid', () => {
      const isValid = Investments.validateField('quantity');

      expect(isValid).toBe(true);
    });

    it('should validate quantity field - invalid', () => {
      document.getElementById = vi.fn((id) => {
        if (id === 'investment-quantity') return { value: '0' };
        if (id === 'investment-type') return { value: 'SHARES' };
        return null;
      });

      const isValid = Investments.validateField('quantity');

      expect(isValid).toBe(false);
    });

    it('should validate price field - valid', () => {
      const isValid = Investments.validateField('price');

      expect(isValid).toBe(true);
    });

    it('should validate amount field - valid', () => {
      document.getElementById = vi.fn((id) => {
        if (id === 'investment-amount') return { value: '50000' };
        if (id === 'investment-type') return { value: 'EPF' };
        return null;
      });

      const isValid = Investments.validateField('amount');

      expect(isValid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // Payment method → credit-card outstanding sync
  // ---------------------------------------------------------------------
  describe('payment method → card outstanding', () => {
    const CC = (id) => ({ type: 'credit_card', id, name: 'Test Card', last4: '1234' });

    beforeEach(() => {
      // Give the module a fresh set of cards + stub showSuccess/render so the
      // flow methods can run headless (they call DOM-driven success/render).
      window.DB.cards = [
        { id: 'c1', cardType: 'credit', outstanding: 0 },
        { id: 'c2', cardType: 'credit', outstanding: 0 }
      ];
      vi.spyOn(Investments, 'showSuccess').mockImplementation(() => {});
      vi.spyOn(Investments, 'render').mockImplementation(() => {});
      vi.spyOn(Investments, 'updateSharePrice').mockImplementation(() => {});
    });

    const card = (id) => window.DB.cards.find(c => c.id === id);

    describe('_investmentChargeAmount', () => {
      it('computes qty × price for INR shares', () => {
        expect(Investments._investmentChargeAmount({ type: 'SHARES', quantity: 10, price: 150, currency: 'INR' })).toBe(1500);
      });

      it('converts USD shares to INR at the stored rate', () => {
        window.DB.exchangeRate = { rate: 80 };
        // 2 × 100 USD = 200 USD × 80 = 16000 INR
        expect(Investments._investmentChargeAmount({ type: 'SHARES', quantity: 2, price: 100, currency: 'USD' })).toBe(16000);
      });

      it('treats MF and GOLD as INR qty × price', () => {
        expect(Investments._investmentChargeAmount({ type: 'MF', quantity: 3, price: 50.5 })).toBe(151.5);
        expect(Investments._investmentChargeAmount({ type: 'GOLD', quantity: 2, price: 7500 })).toBe(15000);
      });

      it('uses flat amount for FD and EPF', () => {
        expect(Investments._investmentChargeAmount({ type: 'FD', amount: 50000 })).toBe(50000);
        expect(Investments._investmentChargeAmount({ type: 'EPF', amount: 1200 })).toBe(1200);
      });

      it('returns 0 for missing / non-positive / null input', () => {
        expect(Investments._investmentChargeAmount(null)).toBe(0);
        expect(Investments._investmentChargeAmount({ type: 'SHARES', quantity: 0, price: 100 })).toBe(0);
        expect(Investments._investmentChargeAmount({ type: 'FD', amount: -5 })).toBe(0);
      });

      it('rounds to paise', () => {
        expect(Investments._investmentChargeAmount({ type: 'MF', quantity: 3, price: 10.333 })).toBe(31);
      });
    });

    describe('_applyCardCharge', () => {
      it('adds to a credit card outstanding and returns the amount', () => {
        const applied = Investments._applyCardCharge(CC('c1'), 500);
        expect(applied).toBe(500);
        expect(card('c1').outstanding).toBe(500);
      });

      it('does nothing for cash / UPI / debit', () => {
        expect(Investments._applyCardCharge({ type: 'cash' }, 500)).toBe(0);
        expect(Investments._applyCardCharge({ type: 'debit_card', id: 'c1' }, 500)).toBe(0);
        expect(card('c1').outstanding).toBe(0);
      });

      it('does nothing when the card no longer exists', () => {
        expect(Investments._applyCardCharge(CC('missing'), 500)).toBe(0);
      });

      it('ignores non-positive charges', () => {
        expect(Investments._applyCardCharge(CC('c1'), 0)).toBe(0);
        expect(Investments._applyCardCharge(CC('c1'), -10)).toBe(0);
        expect(card('c1').outstanding).toBe(0);
      });
    });

    describe('_reverseCardCharge', () => {
      it('subtracts from outstanding', () => {
        card('c1').outstanding = 1000;
        Investments._reverseCardCharge(CC('c1'), 400);
        expect(card('c1').outstanding).toBe(600);
      });

      it('clamps at 0, never negative', () => {
        card('c1').outstanding = 100;
        Investments._reverseCardCharge(CC('c1'), 500);
        expect(card('c1').outstanding).toBe(0);
      });

      it('is a no-op for non-credit-card methods', () => {
        card('c1').outstanding = 100;
        Investments._reverseCardCharge({ type: 'upi', id: 'c1' }, 50);
        expect(card('c1').outstanding).toBe(100);
      });
    });

    describe('_syncCardOnEdit', () => {
      it('same card: keeps snapshot, does not re-charge', () => {
        card('c1').outstanding = 1500;
        const result = Investments._syncCardOnEdit(CC('c1'), 1500, CC('c1'), { type: 'SHARES', quantity: 99, price: 99 });
        expect(result).toBe(1500);
        expect(card('c1').outstanding).toBe(1500); // untouched despite drifted freshData
      });

      it('card swap: moves the historical amount to the new card', () => {
        card('c1').outstanding = 1500;
        const result = Investments._syncCardOnEdit(CC('c1'), 1500, CC('c2'), { type: 'SHARES', quantity: 1, price: 1 });
        expect(card('c1').outstanding).toBe(0);
        expect(card('c2').outstanding).toBe(1500);
        expect(result).toBe(1500);
      });

      it('remove method: reverses and returns undefined', () => {
        card('c1').outstanding = 1500;
        const result = Investments._syncCardOnEdit(CC('c1'), 1500, null, {});
        expect(card('c1').outstanding).toBe(0);
        expect(result).toBeUndefined();
      });

      it('add method fresh: charges the fresh cost', () => {
        const result = Investments._syncCardOnEdit(null, 0, CC('c2'), { type: 'FD', amount: 2000 });
        expect(card('c2').outstanding).toBe(2000);
        expect(result).toBe(2000);
      });
    });

    describe('deleteInvestment reverses the charge (snapshot-based)', () => {
      it('reverses a monthly entry charge', () => {
        card('c1').outstanding = 1500;
        window.DB.monthlyInvestments = [{ id: 1, type: 'SHARES', paymentMethod: CC('c1'), paymentCharge: 1500 }];
        Investments.deleteInvestment(1, true);
        expect(card('c1').outstanding).toBe(0);
        expect(window.DB.monthlyInvestments).toHaveLength(0);
      });

      it('reverses a portfolio entry charge', () => {
        card('c2').outstanding = 800;
        window.DB.portfolioInvestments = [{ id: 5, type: 'GOLD', name: 'Gold', paymentMethod: CC('c2'), paymentCharge: 800 }];
        Investments.deleteInvestment(5, false);
        expect(card('c2').outstanding).toBe(0);
      });

      it('uses the stored snapshot, immune to market drift', () => {
        // Charge was 1000 at purchase; entry price has since drifted up.
        card('c1').outstanding = 1000;
        window.DB.monthlyInvestments = [{ id: 2, type: 'SHARES', quantity: 10, price: 9999, currency: 'INR', paymentMethod: CC('c1'), paymentCharge: 1000 }];
        Investments.deleteInvestment(2, true);
        expect(card('c1').outstanding).toBe(0); // reversed exactly 1000, not 99990
      });

      it('does nothing to cards for a non-card-paid entry', () => {
        card('c1').outstanding = 500;
        window.DB.monthlyInvestments = [{ id: 3, type: 'GOLD', paymentMethod: { type: 'cash' } }];
        Investments.deleteInvestment(3, true);
        expect(card('c1').outstanding).toBe(500);
      });
    });

    describe('syncToPortfolio strips payment fields from the aggregate', () => {
      it('does not copy paymentMethod/paymentCharge into a new portfolio row', () => {
        window.DB.portfolioInvestments = [];
        Investments.syncToPortfolio(
          { type: 'GOLD', name: 'Gold', goal: 'LONG_TERM', quantity: 1, price: 7000, paymentMethod: CC('c1'), paymentCharge: 7000 },
          'Gold_GOLD_LONG_TERM'
        );
        const agg = window.DB.portfolioInvestments[0];
        expect(agg.paymentMethod).toBeUndefined();
        expect(agg.paymentCharge).toBeUndefined();
      });
    });

    describe('overrideExisting reverses old charge then applies new', () => {
      it('moves the charge from old card to new card', () => {
        card('c1').outstanding = 1000;
        const existing = { id: 1, type: 'FD', name: 'FD', goal: 'LONG_TERM', amount: 1000, paymentMethod: CC('c1'), paymentCharge: 1000 };
        window.DB.portfolioInvestments = [existing];
        Investments.overrideExisting(existing, { type: 'FD', name: 'FD', goal: 'LONG_TERM', amount: 2000, paymentMethod: CC('c2') });
        expect(card('c1').outstanding).toBe(0);
        expect(card('c2').outstanding).toBe(2000);
        expect(existing.paymentCharge).toBe(2000);
      });

      it('clears payment fields when the replacement has no method', () => {
        card('c1').outstanding = 1000;
        const existing = { id: 1, type: 'FD', name: 'FD', goal: 'LONG_TERM', amount: 1000, paymentMethod: CC('c1'), paymentCharge: 1000 };
        window.DB.portfolioInvestments = [existing];
        Investments.overrideExisting(existing, { type: 'FD', name: 'FD', goal: 'LONG_TERM', amount: 2000 });
        expect(card('c1').outstanding).toBe(0);
        expect(existing.paymentMethod).toBeUndefined();
        expect(existing.paymentCharge).toBeUndefined();
      });
    });

    describe('addToExisting accumulates only for the same card', () => {
      it('accumulates the snapshot when the same card is reused', () => {
        card('c1').outstanding = 1000;
        const existing = { id: 1, type: 'GOLD', name: 'Gold', goal: 'LONG_TERM', quantity: 1, price: 1000, paymentMethod: CC('c1'), paymentCharge: 1000 };
        Investments.addToExisting(existing, { type: 'GOLD', name: 'Gold', goal: 'LONG_TERM', quantity: 1, price: 500, paymentMethod: CC('c1') });
        expect(card('c1').outstanding).toBe(1500);
        expect(existing.paymentCharge).toBe(1500);
      });

      it('does not corrupt balances when a different card is used', () => {
        card('c1').outstanding = 1000;
        const existing = { id: 1, type: 'GOLD', name: 'Gold', goal: 'LONG_TERM', quantity: 1, price: 1000, paymentMethod: CC('c1'), paymentCharge: 1000 };
        Investments.addToExisting(existing, { type: 'GOLD', name: 'Gold', goal: 'LONG_TERM', quantity: 1, price: 500, paymentMethod: CC('c2') });
        // c1 keeps its real charge; c2 gets the new buy; snapshot tracks only c2.
        expect(card('c1').outstanding).toBe(1000);
        expect(card('c2').outstanding).toBe(500);
        expect(existing.paymentCharge).toBe(500);
        expect(existing.paymentMethod.id).toBe('c2');
      });
    });
  });
});
