const { loadModule } = require('../helpers/loadModule.js');

describe('RecurringExpenses Module', () => {
  let RecurringExpenses;
  let idCounter = 0;

  beforeEach(() => {
    // Reset counter for generateId
    idCounter = 0;

    // Set up clean environment
    window.DB = {
      recurringExpenses: [],
      expenses: [],
      cards: [],
      dismissedRecurringExpenses: []
    };
    window.Storage = { save: vi.fn() };
    window.Utils = {
      formatIndianNumber: vi.fn(n => String(n)),
      formatCompactNumber: vi.fn(n => String(n)),
      escapeHtml: vi.fn(s => String(s ?? '')),
      formatLocalDate: vi.fn(d => {
        const date = new Date(d);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      }),
      generateId: vi.fn(() => 'id' + (++idCounter)),
      getCurrentTimestamp: vi.fn(() => '2026-07-17T00:00:00'),
      showSuccess: vi.fn(),
      showError: vi.fn(),
      confirm: vi.fn(async () => true)
    };
    window.ExpenseCategories = {
      getCategoryOrDefault: vi.fn((name) => ({
        name,
        icon: '📦',
        color: 'from-green-500 to-emerald-600'
      })),
      getByName: vi.fn(() => null),
      getAll: vi.fn(() => [])
    };
    window.Expenses = {
      add: vi.fn((name, amount, category, date, description) => ({
        id: 'exp' + (++idCounter),
        title: name,
        amount,
        category,
        date,
        description
      })),
      isDismissed: vi.fn(() => false)
    };

    // Set up render container
    document.body.innerHTML = '<div id="recurring-expenses-list"></div>';

    // Load the module fresh each time
    RecurringExpenses = loadModule('modules/recurringExpenses.js', 'RecurringExpenses');
  });

  describe('_frequencyText()', () => {
    it('should format monthly frequency correctly', () => {
      const recurring = { frequency: 'monthly', day: 5 };
      const result = RecurringExpenses._frequencyText(recurring);
      expect(result).toBe('Monthly · 5th');
    });

    it('should format yearly frequency correctly', () => {
      const recurring = { frequency: 'yearly', months: [3], day: 15 };
      const result = RecurringExpenses._frequencyText(recurring);
      expect(result).toBe('Yearly · Mar 15');
    });

    it('should format custom frequency correctly', () => {
      const recurring = { frequency: 'custom', months: [1, 4, 7], day: 10 };
      const result = RecurringExpenses._frequencyText(recurring);
      expect(result).toBe('Jan, Apr, Jul · 10th');
    });

    it('should use ordinal suffix for day numbers', () => {
      const r1 = { frequency: 'monthly', day: 1 };
      const r2 = { frequency: 'monthly', day: 2 };
      const r3 = { frequency: 'monthly', day: 3 };
      const r11 = { frequency: 'monthly', day: 11 };
      const r21 = { frequency: 'monthly', day: 21 };

      expect(RecurringExpenses._frequencyText(r1)).toBe('Monthly · 1st');
      expect(RecurringExpenses._frequencyText(r2)).toBe('Monthly · 2nd');
      expect(RecurringExpenses._frequencyText(r3)).toBe('Monthly · 3rd');
      expect(RecurringExpenses._frequencyText(r11)).toBe('Monthly · 11th');
      expect(RecurringExpenses._frequencyText(r21)).toBe('Monthly · 21st');
    });
  });

  describe('isDueInMonth()', () => {
    it('should return true for monthly frequency in any month', () => {
      const recurring = { frequency: 'monthly', day: 15 };
      expect(RecurringExpenses.isDueInMonth(recurring, 2026, 1)).toBe(true);
      expect(RecurringExpenses.isDueInMonth(recurring, 2026, 7)).toBe(true);
      expect(RecurringExpenses.isDueInMonth(recurring, 2026, 12)).toBe(true);
    });

    it('should return true for yearly frequency only in specified month', () => {
      const recurring = { frequency: 'yearly', months: [3], day: 15 };
      expect(RecurringExpenses.isDueInMonth(recurring, 2026, 3)).toBe(true);
      expect(RecurringExpenses.isDueInMonth(recurring, 2026, 4)).toBe(false);
    });

    it('should return true for custom frequency only in specified months', () => {
      const recurring = { frequency: 'custom', months: [1, 4, 7], day: 10 };
      expect(RecurringExpenses.isDueInMonth(recurring, 2026, 1)).toBe(true);
      expect(RecurringExpenses.isDueInMonth(recurring, 2026, 4)).toBe(true);
      expect(RecurringExpenses.isDueInMonth(recurring, 2026, 7)).toBe(true);
      expect(RecurringExpenses.isDueInMonth(recurring, 2026, 2)).toBe(false);
    });
  });

  describe('effectiveDay()', () => {
    it('should clamp day 31 to Feb 28 in non-leap year', () => {
      const result = RecurringExpenses.effectiveDay(31, 2026, 2);
      expect(result).toBe(28);
    });

    it('should clamp day 31 to Apr 30', () => {
      const result = RecurringExpenses.effectiveDay(31, 2026, 4);
      expect(result).toBe(30);
    });

    it('should return day 15 unchanged in any month', () => {
      const result = RecurringExpenses.effectiveDay(15, 2026, 2);
      expect(result).toBe(15);
    });

    it('should handle leap year Feb', () => {
      const result = RecurringExpenses.effectiveDay(31, 2024, 2);
      expect(result).toBe(29);
    });
  });

  describe('getMonthlyTotal()', () => {
    it('should sum active monthly items', () => {
      window.DB.recurringExpenses = [
        { frequency: 'monthly', day: 5, amount: 100, isActive: true },
        { frequency: 'monthly', day: 15, amount: 200, isActive: true }
      ];
      const total = RecurringExpenses.getMonthlyTotal(2026, 7);
      expect(total).toBe(300);
    });

    it('should exclude suspended items', () => {
      window.DB.recurringExpenses = [
        { frequency: 'monthly', day: 5, amount: 100, isActive: true },
        { frequency: 'monthly', day: 15, amount: 200, isActive: true, suspended: true }
      ];
      const total = RecurringExpenses.getMonthlyTotal(2026, 7);
      expect(total).toBe(100);
    });

    it('should only count items due in the specified month', () => {
      window.DB.recurringExpenses = [
        { frequency: 'monthly', day: 5, amount: 100, isActive: true },
        { frequency: 'yearly', months: [7], day: 15, amount: 200, isActive: true },
        { frequency: 'yearly', months: [8], day: 20, amount: 300, isActive: true }
      ];
      const total = RecurringExpenses.getMonthlyTotal(2026, 7);
      expect(total).toBe(300); // monthly + yearly-july
    });
  });

  describe('isEffectivelyActive()', () => {
    it('should return false when suspended', () => {
      const recurring = { isActive: true, suspended: true };
      expect(RecurringExpenses.isEffectivelyActive(recurring)).toBe(false);
    });

    it('should return false when isActive is false', () => {
      const recurring = { isActive: false };
      expect(RecurringExpenses.isEffectivelyActive(recurring)).toBe(false);
    });

    it('should return true when active and not suspended', () => {
      const recurring = { isActive: true, suspended: false };
      expect(RecurringExpenses.isEffectivelyActive(recurring)).toBe(true);
    });

    it('should auto-resume if suspendedUntil date has passed', () => {
      const recurring = {
        isActive: true,
        suspended: true,
        suspendedUntil: '2026-07-01',
        suspendedFrom: '2026-06-01'
      };
      const result = RecurringExpenses.isEffectivelyActive(recurring);
      expect(result).toBe(true);
      expect(recurring.suspended).toBe(false);
      expect(window.Storage.save).toHaveBeenCalled();
    });
  });

  describe('suspend()', () => {
    it('should set suspended to true', () => {
      const recurring = RecurringExpenses.add('Test', 'Food', 100, 'monthly', 15);
      RecurringExpenses.suspend(recurring.id);

      expect(recurring.suspended).toBe(true);
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('should set suspendedUntil when resumeDate provided', () => {
      const recurring = RecurringExpenses.add('Test', 'Food', 100, 'monthly', 15);
      RecurringExpenses.suspend(recurring.id, '2026-08-01');

      expect(recurring.suspendedUntil).toBe('2026-08-01');
    });

    it('should record suspendedFrom as today', () => {
      // Derive "today" the same way the source does (new Date()), so this stays
      // green on any calendar day rather than a hardcoded date.
      const t = new Date();
      const todayStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      const recurring = RecurringExpenses.add('Test', 'Food', 100, 'monthly', 15);
      RecurringExpenses.suspend(recurring.id);

      expect(recurring.suspendedFrom).toBe(todayStr);
    });
  });

  describe('resume()', () => {
    it('should set suspended to false', () => {
      const recurring = RecurringExpenses.add('Test', 'Food', 100, 'monthly', 15);
      recurring.suspended = true;
      recurring.suspendedFrom = '2026-06-01';

      RecurringExpenses.resume(recurring.id);

      expect(recurring.suspended).toBe(false);
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('should record a suspensionPeriod', () => {
      // "to" is stamped with today's date by resume(); compute it the same way.
      const t = new Date();
      const todayStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      const recurring = RecurringExpenses.add('Test', 'Food', 100, 'monthly', 15);
      recurring.suspended = true;
      recurring.suspendedFrom = '2026-06-01';

      RecurringExpenses.resume(recurring.id);

      expect(recurring.suspensionPeriods).toHaveLength(1);
      expect(recurring.suspensionPeriods[0].from).toBe('2026-06-01');
      expect(recurring.suspensionPeriods[0].to).toBe(todayStr);
    });
  });

  describe('getOrdinalSuffix()', () => {
    it('should return st for 1', () => {
      expect(RecurringExpenses.getOrdinalSuffix(1)).toBe('st');
    });

    it('should return nd for 2', () => {
      expect(RecurringExpenses.getOrdinalSuffix(2)).toBe('nd');
    });

    it('should return rd for 3', () => {
      expect(RecurringExpenses.getOrdinalSuffix(3)).toBe('rd');
    });

    it('should return th for 11-13', () => {
      expect(RecurringExpenses.getOrdinalSuffix(11)).toBe('th');
      expect(RecurringExpenses.getOrdinalSuffix(12)).toBe('th');
      expect(RecurringExpenses.getOrdinalSuffix(13)).toBe('th');
    });

    it('should return st for 21', () => {
      expect(RecurringExpenses.getOrdinalSuffix(21)).toBe('st');
    });

    it('should return nd for 22', () => {
      expect(RecurringExpenses.getOrdinalSuffix(22)).toBe('nd');
    });
  });

  describe('render() - Empty state', () => {
    it('should show empty state when no recurring expenses exist', () => {
      RecurringExpenses.render();

      const container = document.getElementById('recurring-expenses-list');
      const content = container.textContent || container.innerText;
      expect(content).toContain('No recurring expenses yet');
    });
  });

  describe('render() - Default view is calendar', () => {
    it('should render calendar view by default', () => {
      RecurringExpenses.add('Netflix', 'Entertainment', 499, 'monthly', 15);
      RecurringExpenses.render();

      expect(RecurringExpenses.viewMode).toBe('calendar');
      const container = document.getElementById('recurring-expenses-list');
      const content = container.textContent || container.innerText;
      // Calendar renders the current month — derive it rather than hardcode,
      // so this test is not brittle across month/year boundaries.
      const now = new Date();
      const monthName = now.toLocaleString('en-US', { month: 'long' });
      expect(content).toContain(monthName);
      expect(content).toContain(String(now.getFullYear()));
    });
  });

  describe('showList() and setListFilter()', () => {
    it('should switch to list view', () => {
      RecurringExpenses.add('Netflix', 'Entertainment', 499, 'monthly', 15);
      RecurringExpenses.showList('all');

      expect(RecurringExpenses.viewMode).toBe('list');
      expect(RecurringExpenses.listFilter).toBe('all');
      const container = document.getElementById('recurring-expenses-list');
      const content = container.textContent || container.innerText;
      expect(content).toContain('Netflix');
    });

    it('should show filter pills with counts', () => {
      RecurringExpenses.add('Active1', 'Food', 100, 'monthly', 5);
      RecurringExpenses.add('Active2', 'Shopping', 200, 'monthly', 15);
      const suspended = RecurringExpenses.add('Suspended', 'Entertainment', 300, 'monthly', 25);
      suspended.suspended = true;

      RecurringExpenses.showList('all');

      const container = document.getElementById('recurring-expenses-list');
      const content = container.textContent || container.innerText;
      expect(content).toContain('All');
      expect(content).toContain('3'); // all count
      expect(content).toContain('Active');
      expect(content).toContain('2'); // active count
      expect(content).toContain('Suspended');
      expect(content).toContain('1'); // suspended count
    });

    it('should filter to show only suspended items', () => {
      RecurringExpenses.add('Active1', 'Food', 100, 'monthly', 5);
      const suspended = RecurringExpenses.add('Suspended', 'Entertainment', 300, 'monthly', 25);
      suspended.suspended = true;

      RecurringExpenses.showList('suspended');

      const container = document.getElementById('recurring-expenses-list');
      const content = container.textContent || container.innerText;
      expect(content).toContain('Suspended');
      expect(content).not.toContain('Active1');
    });
  });

  describe('State persistence across render()', () => {
    it('should preserve viewMode and listFilter on re-render', () => {
      RecurringExpenses.add('Test', 'Food', 100, 'monthly', 15);

      RecurringExpenses.showList('active');
      expect(RecurringExpenses.viewMode).toBe('list');
      expect(RecurringExpenses.listFilter).toBe('active');

      // Re-render without changing state
      RecurringExpenses.render();

      expect(RecurringExpenses.viewMode).toBe('list');
      expect(RecurringExpenses.listFilter).toBe('active');
    });
  });

  describe('Month navigation', () => {
    it('should advance month with calNextMonth', () => {
      RecurringExpenses.calYear = 2026;
      RecurringExpenses.calMonth = 7;

      RecurringExpenses.calNextMonth();

      expect(RecurringExpenses.calMonth).toBe(8);
      expect(RecurringExpenses.calYear).toBe(2026);
    });

    it('should roll over year when advancing from December', () => {
      RecurringExpenses.calYear = 2026;
      RecurringExpenses.calMonth = 12;

      RecurringExpenses.calNextMonth();

      expect(RecurringExpenses.calMonth).toBe(1);
      expect(RecurringExpenses.calYear).toBe(2027);
    });

    it('should go back month with calPrevMonth', () => {
      RecurringExpenses.calYear = 2026;
      RecurringExpenses.calMonth = 7;

      RecurringExpenses.calPrevMonth();

      expect(RecurringExpenses.calMonth).toBe(6);
      expect(RecurringExpenses.calYear).toBe(2026);
    });

    it('should roll back year when going back from January', () => {
      RecurringExpenses.calYear = 2026;
      RecurringExpenses.calMonth = 1;

      RecurringExpenses.calPrevMonth();

      expect(RecurringExpenses.calMonth).toBe(12);
      expect(RecurringExpenses.calYear).toBe(2025);
    });

    it('should reset to today with calToday', () => {
      RecurringExpenses.calYear = 2025;
      RecurringExpenses.calMonth = 1;
      RecurringExpenses.calSelectedDay = 1;

      RecurringExpenses.calToday();

      const today = new Date();
      expect(RecurringExpenses.calYear).toBe(today.getFullYear());
      expect(RecurringExpenses.calMonth).toBe(today.getMonth() + 1);
      expect(RecurringExpenses.calSelectedDay).toBe(today.getDate());
    });
  });

  describe('Category fallback', () => {
    it('should not throw when ExpenseCategories is undefined', () => {
      window.ExpenseCategories = undefined;
      RecurringExpenses.add('Test', 'Food', 100, 'monthly', 15);

      expect(() => {
        RecurringExpenses.render();
      }).not.toThrow();

      const container = document.getElementById('recurring-expenses-list');
      expect(container.textContent || container.innerText).not.toBe('');
    });

    it('should use fallback icon and color when category lookup fails', () => {
      window.ExpenseCategories = undefined;
      const cat = RecurringExpenses._getCategoryInfo('Unknown');

      expect(cat.icon).toBe('📦');
      expect(cat.color).toBe('from-gray-400 to-gray-600');
    });
  });

  describe('XSS/escaping', () => {
    it('should depend on Utils.escapeHtml for name rendering', () => {
      const xssName = '<img src=x onerror=alert(1)>';
      // Proof: if escapeHtml returns raw input, XSS would appear in rendered HTML.
      // Our mock returns the string as-is (String(s)), so the test passes if render
      // calls escapeHtml and trusts its output. The real impl escapes correctly.
      RecurringExpenses.add(xssName, 'Food', 100, 'monthly', 15);

      // Mock escapeHtml to return a safe marker so we know it was called
      const originalEscape = window.Utils.escapeHtml;
      window.Utils.escapeHtml = vi.fn(s => s ? `[ESCAPED:${s}]` : '');

      // Show list view where names are definitely rendered
      RecurringExpenses.showList('all');

      const container = document.getElementById('recurring-expenses-list');
      const htmlContent = container.innerHTML;

      // If render() calls escapeHtml for the name, we'll see the marker
      expect(htmlContent).toContain('[ESCAPED:');
      expect(window.Utils.escapeHtml).toHaveBeenCalled();

      // Restore
      window.Utils.escapeHtml = originalEscape;
    });
  });

  describe('add()', () => {
    it('should add a new recurring expense with required fields', () => {
      const recurring = RecurringExpenses.add('Netflix', 'Entertainment', 499, 'monthly', 15);

      expect(recurring).toBeDefined();
      expect(recurring.name).toBe('Netflix');
      expect(recurring.category).toBe('Entertainment');
      expect(recurring.amount).toBe(499);
      expect(recurring.frequency).toBe('monthly');
      expect(recurring.day).toBe(15);
      expect(recurring.isActive).toBe(true);
      expect(window.DB.recurringExpenses).toHaveLength(1);
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('should throw error if required fields are missing', () => {
      expect(() => {
        RecurringExpenses.add('', 'Food', 100, 'monthly', 15);
      }).toThrow('Please fill in all required fields');
    });
  });

  describe('update()', () => {
    it('should update recurring expense fields', () => {
      const recurring = RecurringExpenses.add('Old Name', 'Food', 100, 'monthly', 15);

      RecurringExpenses.update(recurring.id, 'New Name', 'Shopping', 200, 'monthly', 20, [], 'Updated');

      expect(recurring.name).toBe('New Name');
      expect(recurring.category).toBe('Shopping');
      expect(recurring.amount).toBe(200);
      expect(recurring.day).toBe(20);
      expect(window.Storage.save).toHaveBeenCalled();
    });
  });

  describe('delete()', () => {
    it('should remove recurring expense from array', () => {
      const recurring = RecurringExpenses.add('Test', 'Food', 100, 'monthly', 15);

      RecurringExpenses.delete(recurring.id);

      expect(window.DB.recurringExpenses).toHaveLength(0);
      expect(window.Storage.save).toHaveBeenCalled();
    });
  });

  describe('Calendar day selection', () => {
    it('should update selected day with calSelectDay', () => {
      RecurringExpenses.calSelectedDay = 1;

      RecurringExpenses.calSelectDay(15);

      expect(RecurringExpenses.calSelectedDay).toBe(15);
    });
  });

  describe('Integration: calendar view with due items', () => {
    it('should show due items on calendar day cells', () => {
      RecurringExpenses.add('Netflix', 'Entertainment', 499, 'monthly', 15);
      RecurringExpenses.render();

      const container = document.getElementById('recurring-expenses-list');
      const htmlContent = container.innerHTML;
      // Calendar renders the current month — derive it rather than hardcode.
      const monthName = new Date().toLocaleString('en-US', { month: 'long' });
      expect(htmlContent).toContain(monthName);
      // Check for calendar day button structure
      expect(htmlContent).toContain('onclick="RecurringExpenses.calSelectDay');
    });
  });

  describe('Integration: list view filtering', () => {
    it('should show all items in all filter', () => {
      RecurringExpenses.add('Active1', 'Food', 100, 'monthly', 5);
      const suspended = RecurringExpenses.add('Suspended1', 'Entertainment', 200, 'monthly', 15);
      suspended.suspended = true;

      RecurringExpenses.showList('all');

      const container = document.getElementById('recurring-expenses-list');
      const content = container.textContent || container.innerText;
      expect(content).toContain('Active1');
      expect(content).toContain('Suspended1');
    });

    it('should show only active items in active filter', () => {
      RecurringExpenses.add('Active1', 'Food', 100, 'monthly', 5);
      const suspended = RecurringExpenses.add('Suspended1', 'Entertainment', 200, 'monthly', 15);
      suspended.suspended = true;

      RecurringExpenses.showList('active');

      const container = document.getElementById('recurring-expenses-list');
      const content = container.textContent || container.innerText;
      expect(content).toContain('Active1');
      expect(content).not.toContain('Suspended1');
    });
  });

  describe('_categoryAvatar()', () => {
    it('should render category icon with gradient', () => {
      const html = RecurringExpenses._categoryAvatar('Food');
      expect(html).toContain('📦');
      expect(html).toContain('bg-gradient-to-br');
      expect(html).toContain('from-green-500 to-emerald-600');
    });
  });

  describe('showCalendar()', () => {
    it('should switch viewMode to calendar', () => {
      RecurringExpenses.viewMode = 'list';
      RecurringExpenses.showCalendar();
      expect(RecurringExpenses.viewMode).toBe('calendar');
    });
  });

  describe('View toggle in render', () => {
    it('should render calendar when viewMode is calendar', () => {
      RecurringExpenses.add('Test', 'Food', 100, 'monthly', 15);
      RecurringExpenses.viewMode = 'calendar';
      RecurringExpenses.render();

      const container = document.getElementById('recurring-expenses-list');
      const content = container.textContent || container.innerText;
      // Calendar renders the current month — derive it rather than hardcode.
      const monthName = new Date().toLocaleString('en-US', { month: 'long' });
      expect(content).toContain(monthName);
      expect(content).toContain('S'); // day name initial
    });

    it('should render list when viewMode is list', () => {
      RecurringExpenses.add('TestItem', 'Food', 100, 'monthly', 15);
      RecurringExpenses.viewMode = 'list';
      RecurringExpenses.render();

      const container = document.getElementById('recurring-expenses-list');
      const content = container.textContent || container.innerText;
      expect(content).toContain('All');
      expect(content).toContain('TestItem');
    });
  });

  describe('getPaymentMethodLabel() - XSS safety', () => {
    it('should escape a user-controlled credit card name', () => {
      const label = RecurringExpenses.getPaymentMethodLabel({
        type: 'credit_card',
        name: '<img src=x onerror=alert(1)>',
        last4: '1234'
      });
      // The card name is user-editable → must pass through escapeHtml.
      expect(window.Utils.escapeHtml).toHaveBeenCalledWith('<img src=x onerror=alert(1)>');
      // last4 is also escaped (defensive) and both parts survive in the label.
      expect(window.Utils.escapeHtml).toHaveBeenCalledWith('1234');
      expect(label).toContain('••1234');
    });

    it('should escape a user-controlled debit card name', () => {
      RecurringExpenses.getPaymentMethodLabel({
        type: 'debit_card',
        name: '"><script>evil()</script>',
        last4: '9999'
      });
      expect(window.Utils.escapeHtml).toHaveBeenCalledWith('"><script>evil()</script>');
    });

    it('should not break on cards without a name or last4', () => {
      expect(RecurringExpenses.getPaymentMethodLabel({ type: 'credit_card' })).toBe('Credit Card');
      expect(RecurringExpenses.getPaymentMethodLabel({ type: 'debit_card' })).toBe('Debit Card');
    });

    it('should leave hardcoded UPI/cash labels untouched', () => {
      expect(RecurringExpenses.getPaymentMethodLabel({ type: 'cash' })).toBe('Cash');
      expect(RecurringExpenses.getPaymentMethodLabel({ type: 'upi', id: 'gpay' })).toBe('Google Pay');
      expect(RecurringExpenses.getPaymentMethodLabel(null)).toBe('');
    });
  });

  describe('Accessibility: aria-pressed on view toggle and filters', () => {
    it('should mark the active view toggle and filter with aria-pressed=true', () => {
      RecurringExpenses.add('AccItem', 'Food', 100, 'monthly', 15);
      RecurringExpenses.viewMode = 'list';
      RecurringExpenses.listFilter = 'active';
      RecurringExpenses.render();

      const html = document.getElementById('recurring-expenses-list').innerHTML;
      // List toggle button is the active view.
      expect(html).toContain('aria-pressed="true"');
      // Both false and true states are present (calendar toggle + non-selected filters).
      expect(html).toContain('aria-pressed="false"');
    });
  });

  describe('autoAddToExpenses — duplicate-id regression', () => {
    /**
     * USER-REPORTED BUG: Two recurring expenses ("amma" 10k, "wife" 10k) both due
     * on the 1st created two expenses in the same millisecond, giving them the
     * SAME id (old Date.now() collision). Then find(e => e.id === id) returned the
     * 1st expense for BOTH lookups, so editing/deleting the 2nd expense affected
     * the 1st instead.
     *
     * This test reproduces the end-to-end flow with the REAL Utils.generateId
     * (monotonic fix) and a realistic Expenses.add that pushes into DB.expenses,
     * then asserts:
     *   1. Two distinct expense ids (no collision)
     *   2. Looking up the 2nd expense's id returns the 2nd expense (correct title)
     */
    it('should assign distinct ids to multiple recurring expenses auto-added in the same tick', () => {
      // Load the REAL Utils module to get the fixed monotonic generateId.
      const RealUtils = loadModule('core/utils.js', 'Utils');
      window.Utils.generateId = RealUtils.generateId.bind(RealUtils);

      // Wire a realistic Expenses.add that pushes into DB.expenses and assigns
      // ids using the real generateId strategy (the core of the fix).
      window.Expenses.add = vi.fn((title, amount, category, date, description) => {
        const expense = {
          id: window.Utils.generateId(),
          title,
          amount,
          category,
          date,
          description
        };
        window.DB.expenses.push(expense);
        return expense;
      });

      // Clear DB to start fresh for this specific test
      window.DB.recurringExpenses = [];
      window.DB.expenses = [];

      // Set up TWO recurring templates both due on day 1, monthly, created just
      // before the current test date (2026-07-17, per beforeEach mock) so only
      // one billing cycle (July) is processed. This ensures we get exactly 2
      // expenses added, both in the same tick, reproducing the collision scenario.
      const pastDate = '2026-07-01T00:00:00';
      const amma = RecurringExpenses.add('sending money to amma', 'Family', 10000, 'monthly', 1, [], 'Family support');
      amma.createdAt = pastDate;
      const wife = RecurringExpenses.add('sending money to wife', 'Family', 10000, 'monthly', 1, [], 'Family support');
      wife.createdAt = pastDate;

      // Sanity check: both templates exist and are active.
      expect(window.DB.recurringExpenses).toHaveLength(2);

      // Run the auto-add loop. It will process both templates in sequence for
      // July (the current test date, from beforeEach's getCurrentTimestamp mock).
      // Both are due on day 1 (which has passed by the 17th), so both get added
      // in rapid succession — the exact scenario that caused the collision bug.
      const added = RecurringExpenses.autoAddToExpenses();

      // The core test: multiple expenses were added in rapid succession (same tick).
      // The exact count may vary based on which months get processed (July, August, etc.),
      // but what matters is that we have AT LEAST 2 expenses (from the 2 templates),
      // and that ALL of them have DISTINCT ids (no collisions).
      expect(added).toBeGreaterThanOrEqual(2);
      expect(window.DB.expenses.length).toBeGreaterThanOrEqual(2);

      // Find the expenses for our two templates (by title, which is unique).
      const ammaExpenses = window.DB.expenses.filter(e => e.title === 'sending money to amma');
      const wifeExpenses = window.DB.expenses.filter(e => e.title === 'sending money to wife');

      // Each template should have generated at least one expense.
      expect(ammaExpenses.length).toBeGreaterThanOrEqual(1);
      expect(wifeExpenses.length).toBeGreaterThanOrEqual(1);

      // Pick the first expense from each template for the core assertions.
      const exp1 = ammaExpenses[0];
      const exp2 = wifeExpenses[0];

      // CORE ASSERTION #1: The two expenses have DIFFERENT ids (no collision).
      // This fails under the old Date.now() implementation when both are created
      // in the same millisecond, and passes with the monotonic fix.
      expect(exp1.id).not.toBe(exp2.id);

      // CORE ASSERTION #2: ALL expenses in DB have UNIQUE ids (no collisions anywhere).
      // This is the strongest form of the assertion: every id should be distinct.
      const allIds = window.DB.expenses.map(e => e.id);
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);

      // CORE ASSERTION #3: Looking up the 2nd expense's id returns the CORRECT
      // expense (matching the 2nd template's title 'wife'), NOT the 1st.
      // This is the exact symptom the user reported: edit/delete on the 2nd
      // expense acted on the 1st because find() returned the first match.
      const foundExp2 = window.DB.expenses.find(e => e.id === exp2.id);
      expect(foundExp2).toBe(exp2);
      expect(foundExp2.title).toBe('sending money to wife');

      // Also verify the 1st expense lookup is correct (symmetry check).
      const foundExp1 = window.DB.expenses.find(e => e.id === exp1.id);
      expect(foundExp1).toBe(exp1);
      expect(foundExp1.title).toBe('sending money to amma');

      // Both expenses should have the recurring metadata stamped.
      expect(exp1.recurringId).toBe(amma.id);
      expect(exp1.isRecurring).toBe(true);
      expect(exp2.recurringId).toBe(wife.id);
      expect(exp2.isRecurring).toBe(true);
    });
  });
});
