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
});
