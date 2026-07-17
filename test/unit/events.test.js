const { loadModule } = require('../helpers/loadModule.js');

describe('Events Module', () => {
  let Events;
  let Expenses;

  beforeAll(() => {
    // Events delegates date-range membership to Expenses.isExpenseInRange, so both
    // modules must be loaded. Expenses first, then Events.
    Expenses = loadModule('modules/expenses.js', 'Expenses');
    Events = loadModule('modules/events.js', 'Events');
  });

  beforeEach(() => {
    window.DB = {
      expenses: [],
      cards: [],
      loans: [],
      recurringExpenses: [],
      dismissedRecurringExpenses: []
    };
    window.Expenses = Expenses;
    window.Storage = { save: vi.fn(), flush: vi.fn() };
    window.Utils = {
      generateId: (() => { let c = 0; return vi.fn(() => 'test-id-' + (++c)); })(),
      getCurrentTimestamp: vi.fn(() => '2024-01-01T00:00:00.000Z'),
      formatIndianNumber: vi.fn(n => String(n)),
      formatCurrency: vi.fn(n => `₹${n}`),
      escapeHtml: vi.fn(s => String(s ?? '')),
      formatDate: vi.fn(d => d),
      // Mirror the real Utils.escapeJsAttr: JS-string-escape, then HTML-escape,
      // so the XSS-defense assertions exercise realistic behavior (a naive
      // pass-through mock would let raw markup leak into the onclick attribute).
      escapeJsAttr: vi.fn(s => {
        if (s === null || s === undefined) return '';
        return String(s)
          .replace(/\\/g, '\\\\').replace(/'/g, "\\'")
          .replace(/\r/g, '\\r').replace(/\n/g, '\\n')
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }),
      showError: vi.fn(),
      showSuccess: vi.fn()
    };
    window.ExpenseCategories = {
      getByName: vi.fn(() => null),
      getById: vi.fn(() => null),
      getCategoryOrDefault: vi.fn((name) => ({
        id: 'other',
        name: name || 'Other',
        icon: '📦',
        color: 'from-gray-400 to-gray-600'
      }))
    };
    // Reset drill-down state between tests
    Events.expandedEvents = new Set();
    Events.expandedTitles = new Map();

    document.getElementById = vi.fn(() => null);
    document.querySelector = vi.fn(() => null);
    document.querySelectorAll = vi.fn(() => []);
  });

  const seedEvents = () => {
    // Birthday Party spans Jan 2024; Team Outing in Feb 2024; Trip in Jul 2026
    Expenses.add('Dinner', 2000, 'Food', '2024-01-10', 'Restaurant', null, 'Birthday Party');
    Expenses.add('Cake', 1500, 'Food', '2024-01-11', 'Bakery', null, 'Birthday Party');
    Expenses.add('Lunch', 1000, 'Food', '2024-02-05', 'Restaurant', null, 'Team Outing');
    Expenses.add('Hotel', 8000, 'Travel', '2026-07-10', 'Beach resort', null, 'Goa Trip');
  };

  describe('getEventSummary() — contract (all-time default)', () => {
    beforeEach(seedEvents);

    it('should default to all-time and return every event', () => {
      const summary = Events.getEventSummary();
      expect(summary).toHaveLength(3);
      expect(summary.some(e => e.name === 'Birthday Party')).toBe(true);
      expect(summary.some(e => e.name === 'Team Outing')).toBe(true);
      expect(summary.some(e => e.name === 'Goa Trip')).toBe(true);
    });

    it('should compute totals and sort by total (highest first)', () => {
      const summary = Events.getEventSummary();
      expect(summary[0].name).toBe('Goa Trip'); // 8000
      const birthday = summary.find(e => e.name === 'Birthday Party');
      expect(birthday.total).toBe(3500);
      expect(birthday.expenseCount).toBe(2);
    });

    it('should ignore expenses without an event tag', () => {
      Expenses.add('Groceries', 500, 'Food', '2024-01-12'); // no event
      const summary = Events.getEventSummary();
      expect(summary).toHaveLength(3);
    });

    it('should preserve the byTitle → expenses drilldown structure', () => {
      const summary = Events.getEventSummary();
      const birthday = summary.find(e => e.name === 'Birthday Party');
      expect(birthday.byTitle.length).toBeGreaterThan(0);
      const first = birthday.byTitle[0];
      expect(first).toHaveProperty('title');
      expect(first).toHaveProperty('total');
      expect(first).toHaveProperty('count');
      expect(first.expenses[0]).toHaveProperty('id');
      expect(first.expenses[0]).toHaveProperty('category');
    });
  });

  describe('getEventSummary() — date-filter aware', () => {
    beforeEach(seedEvents);

    it('should include only events within a month-based range', () => {
      const summary = Events.getEventSummary('', '2024-01-01', '2024-01-31');
      expect(summary).toHaveLength(1);
      expect(summary[0].name).toBe('Birthday Party');
    });

    it('should exclude events outside the range', () => {
      const summary = Events.getEventSummary('', '2024-02-01', '2024-02-29');
      expect(summary).toHaveLength(1);
      expect(summary[0].name).toBe('Team Outing');
    });

    it('should return empty when no events fall in the range', () => {
      const summary = Events.getEventSummary('', '2025-01-01', '2025-01-31');
      expect(summary).toHaveLength(0);
    });

    it('should honor budgetMonth remapping via Expenses.isExpenseInRange', () => {
      // Paid Jan 2024 but budget-tracked in Feb 2024 → should appear in Feb range
      const e = Expenses.add('Advance', 500, 'Food', '2024-01-20', '', null, 'Team Outing');
      e.budgetMonth = 2;
      e.budgetYear = 2024;

      const febSummary = Events.getEventSummary('', '2024-02-01', '2024-02-29');
      const outing = febSummary.find(ev => ev.name === 'Team Outing');
      expect(outing).toBeDefined();
      expect(outing.total).toBe(1500); // 1000 (Feb 5) + 500 (remapped)
    });

    it('should combine search term with date range', () => {
      const summary = Events.getEventSummary('cake', '2024-01-01', '2024-01-31');
      expect(summary).toHaveLength(1);
      expect(summary[0].name).toBe('Birthday Party');
      // Only the matching title survives the search
      expect(summary[0].byTitle.every(t => t.title.toLowerCase().includes('cake'))).toBe(true);
    });

    it('should still search by event name within a range', () => {
      const summary = Events.getEventSummary('birthday', '2024-01-01', '2024-01-31');
      expect(summary).toHaveLength(1);
      expect(summary[0].name).toBe('Birthday Party');
    });
  });

  describe('renderInExpensesList()', () => {
    it('should show the onboarding empty state when there are no events at all (all-time)', () => {
      const container = { innerHTML: '' };
      Events.renderInExpensesList(container, '', null, null);
      expect(container.innerHTML).toContain('No Events Yet');
    });

    it('should show a range-scoped empty state (not onboarding) when none in range', () => {
      seedEvents();
      const container = { innerHTML: '' };
      Events.renderInExpensesList(container, '', '2025-01-01', '2025-01-31');
      expect(container.innerHTML).toContain('No events in this period');
      expect(container.innerHTML).toContain('View all events');
    });

    it('should render a range note with an "All time" escape when filtered', () => {
      seedEvents();
      const container = { innerHTML: '' };
      Events.renderInExpensesList(container, '', '2024-01-01', '2024-01-31');
      expect(container.innerHTML).toContain('Birthday Party');
      expect(container.innerHTML).toContain('All time');
      expect(container.innerHTML).toContain('toggleEventsAllTime');
    });

    it('should render a "Use date filter" escape when all-time', () => {
      seedEvents();
      const container = { innerHTML: '' };
      Events.renderInExpensesList(container, '', null, null);
      expect(container.innerHTML).toContain('Showing all events');
      expect(container.innerHTML).toContain('Use date filter');
    });

    it('should escape HTML in event names (XSS defense)', () => {
      // Real escapeHtml behavior for this assertion
      window.Utils.escapeHtml = (s) => String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
      Expenses.add('Gift', 100, 'Shopping', '2024-01-10', '', null, '<img src=x onerror=alert(1)>');

      const container = { innerHTML: '' };
      Events.renderInExpensesList(container, '', null, null);
      expect(container.innerHTML).not.toContain('<img src=x');
      expect(container.innerHTML).toContain('&lt;img');
    });
  });

  describe('toggle drill-down state', () => {
    beforeEach(seedEvents);

    it('toggleEventExpand should add/remove from expandedEvents', () => {
      Events.toggleEventExpand('Birthday Party');
      expect(Events.expandedEvents.has('Birthday Party')).toBe(true);
      Events.toggleEventExpand('Birthday Party');
      expect(Events.expandedEvents.has('Birthday Party')).toBe(false);
    });

    it('toggleTitleExpand should add/remove title within an event', () => {
      Events.toggleTitleExpand('Birthday Party', 'Cake');
      expect(Events.expandedTitles.get('Birthday Party').has('Cake')).toBe(true);
      Events.toggleTitleExpand('Birthday Party', 'Cake');
      expect(Events.expandedTitles.get('Birthday Party').has('Cake')).toBe(false);
    });
  });
});
