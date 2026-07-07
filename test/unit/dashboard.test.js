const { loadModule } = require('../helpers/loadModule.js');

/**
 * Tests for the progressive (non-blocking) chart-hydration path added to
 * Dashboard.render(). The dashboard previously built all five Chart.js charts in
 * one synchronous setTimeout burst, which janked low-RAM Android WebViews. Now
 * the KPI cards paint immediately and charts hydrate one-per-frame, guarded by a
 * render-generation token so a rapid re-render cancels stale hydration.
 *
 * jsdom does NOT provide requestAnimationFrame, so _scheduleChartHydration falls
 * back to setTimeout(fn, 16). We install a controllable rAF stub per-test to make
 * the frame pump deterministic.
 */
describe('Dashboard — progressive chart hydration', () => {
  let Dashboard;

  beforeAll(() => {
    Dashboard = loadModule('modules/dashboard.js', 'Dashboard');
  });

  // A manual "animation frame" queue: calling flushFrames() runs pending
  // callbacks one generation at a time, mirroring how rAF batches per frame.
  let frameQueue;
  function installRaf() {
    frameQueue = [];
    global.requestAnimationFrame = (fn) => {
      frameQueue.push(fn);
      return frameQueue.length;
    };
    window.requestAnimationFrame = global.requestAnimationFrame;
  }
  // Drain the whole queue (each callback may enqueue the next frame).
  function drainFrames(maxIters = 100) {
    let iters = 0;
    while (frameQueue.length && iters < maxIters) {
      const batch = frameQueue;
      frameQueue = [];
      batch.forEach((fn) => fn());
      iters += 1;
    }
  }
  // Advance exactly one frame.
  function stepFrame() {
    const batch = frameQueue;
    frameQueue = [];
    batch.forEach((fn) => fn());
  }

  beforeEach(() => {
    installRaf();

    // Minimal DB so any data readers that slip through don't explode.
    window.DB = {
      expenses: [], loans: [], cards: [], cardBills: [], income: {},
      salaries: [], monthlyInvestments: [], portfolioInvestments: [],
      settings: { paySchedule: 'first_week' }, settlementData: {},
    };

    // Chart.js present by default (typeof check in the hydration methods).
    global.Chart = function Chart() {};
    window.Chart = global.Chart;

    // Stub every real chart renderer so tests exercise the scheduler, not
    // Chart.js internals. Each is a spy we can assert call order on.
    Dashboard.renderIncomeExpenseChart = vi.fn();
    Dashboard.renderCategoryChart = vi.fn();
    Dashboard.renderLoansChartIfNeeded = vi.fn();
    Dashboard.renderCreditCardBillsChartIfNeeded = vi.fn();
    Dashboard.renderInvestmentsTrendChart = vi.fn();
    Dashboard.renderLoansChart = vi.fn();
    Dashboard.renderCreditCardBillsChart = vi.fn();

    // Reset the render token to a known state.
    Dashboard._renderGeneration = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.Chart;
    delete global.requestAnimationFrame;
  });

  describe('_chartInitSteps()', () => {
    it('returns the five chart steps in top-to-bottom dashboard order', () => {
      const steps = Dashboard._chartInitSteps();
      expect(steps.map((s) => s.canvas)).toEqual([
        'income-expense-chart',
        'category-chart',
        'loans-chart',
        'credit-card-bills-chart',
        'investments-trend-chart',
      ]);
      steps.forEach((s) => {
        expect(typeof s.run).toBe('function');
        expect(typeof s.label).toBe('string');
      });
    });

    it('loans/CC steps only fire their chart when the <details> is open', () => {
      const steps = Dashboard._chartInitSteps();
      const loans = steps.find((s) => s.canvas === 'loans-chart');
      const cc = steps.find((s) => s.canvas === 'credit-card-bills-chart');

      // No section elements present → guards short-circuit, no render call.
      document.body.innerHTML = '';
      loans.run();
      cc.run();
      expect(Dashboard.renderLoansChartIfNeeded).not.toHaveBeenCalled();
      expect(Dashboard.renderCreditCardBillsChartIfNeeded).not.toHaveBeenCalled();

      // Collapsed <details> → still no render.
      document.body.innerHTML =
        '<details id="loans-section"></details>' +
        '<details id="credit-card-bills-section"></details>';
      loans.run();
      cc.run();
      expect(Dashboard.renderLoansChartIfNeeded).not.toHaveBeenCalled();
      expect(Dashboard.renderCreditCardBillsChartIfNeeded).not.toHaveBeenCalled();

      // Open <details> → render via the IfNeeded flag-guard (not the raw renderer).
      document.body.innerHTML =
        '<details id="loans-section" open></details>' +
        '<details id="credit-card-bills-section" open></details>';
      loans.run();
      cc.run();
      expect(Dashboard.renderLoansChartIfNeeded).toHaveBeenCalledTimes(1);
      expect(Dashboard.renderCreditCardBillsChartIfNeeded).toHaveBeenCalledTimes(1);
      // Must route through the guarded path, never the un-guarded renderer.
      expect(Dashboard.renderLoansChart).not.toHaveBeenCalled();
      expect(Dashboard.renderCreditCardBillsChart).not.toHaveBeenCalled();
    });
  });

  describe('_scheduleChartHydration()', () => {
    it('hydrates exactly one chart per frame (non-blocking)', () => {
      const gen = ++Dashboard._renderGeneration;
      Dashboard._scheduleChartHydration(gen);

      // Nothing runs until the first frame fires.
      expect(Dashboard.renderIncomeExpenseChart).not.toHaveBeenCalled();

      stepFrame(); // frame 1 → income/expense
      expect(Dashboard.renderIncomeExpenseChart).toHaveBeenCalledTimes(1);
      expect(Dashboard.renderCategoryChart).not.toHaveBeenCalled();

      stepFrame(); // frame 2 → category
      expect(Dashboard.renderCategoryChart).toHaveBeenCalledTimes(1);
      expect(Dashboard.renderInvestmentsTrendChart).not.toHaveBeenCalled();

      drainFrames(); // remaining frames
      expect(Dashboard.renderInvestmentsTrendChart).toHaveBeenCalledTimes(1);
    });

    it('runs every step when the generation stays current', () => {
      const gen = ++Dashboard._renderGeneration;
      Dashboard._scheduleChartHydration(gen);
      drainFrames();

      expect(Dashboard.renderIncomeExpenseChart).toHaveBeenCalledTimes(1);
      expect(Dashboard.renderCategoryChart).toHaveBeenCalledTimes(1);
      expect(Dashboard.renderInvestmentsTrendChart).toHaveBeenCalledTimes(1);
    });

    it('aborts mid-flight when a newer render bumps the generation', () => {
      const gen = ++Dashboard._renderGeneration; // gen = 1
      Dashboard._scheduleChartHydration(gen);

      stepFrame(); // frame 1 → income/expense runs
      expect(Dashboard.renderIncomeExpenseChart).toHaveBeenCalledTimes(1);

      // A newer render() starts: generation advances, invalidating the token.
      Dashboard._renderGeneration = 2;

      drainFrames(); // stale pump should see gen mismatch and stop
      expect(Dashboard.renderCategoryChart).not.toHaveBeenCalled();
      expect(Dashboard.renderInvestmentsTrendChart).not.toHaveBeenCalled();
    });

    it('does nothing if Chart.js is not loaded', () => {
      delete global.Chart;
      delete window.Chart;
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const gen = ++Dashboard._renderGeneration;
      Dashboard._scheduleChartHydration(gen);
      drainFrames();

      expect(Dashboard.renderIncomeExpenseChart).not.toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalled();
    });

    it('isolates a throwing chart so later charts still hydrate', () => {
      Dashboard.renderCategoryChart = vi.fn(() => { throw new Error('boom'); });
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const gen = ++Dashboard._renderGeneration;
      Dashboard._scheduleChartHydration(gen);
      drainFrames();

      // The category chart threw, but income/expense (before) and investments
      // (after) both still ran.
      expect(Dashboard.renderIncomeExpenseChart).toHaveBeenCalledTimes(1);
      expect(Dashboard.renderInvestmentsTrendChart).toHaveBeenCalledTimes(1);
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining('category chart'),
        expect.any(Error),
      );
    });

    it('falls back to setTimeout when requestAnimationFrame is absent', () => {
      delete global.requestAnimationFrame;
      delete window.requestAnimationFrame;
      vi.useFakeTimers();

      const gen = ++Dashboard._renderGeneration;
      Dashboard._scheduleChartHydration(gen);
      expect(Dashboard.renderIncomeExpenseChart).not.toHaveBeenCalled();

      vi.runAllTimers();
      expect(Dashboard.renderIncomeExpenseChart).toHaveBeenCalledTimes(1);
      expect(Dashboard.renderInvestmentsTrendChart).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  describe('_runChartStep()', () => {
    it('swallows errors and clears that chart\'s skeleton in finally', () => {
      document.body.innerHTML =
        '<div id="dashboard-content">' +
        '  <div style="position:relative">' +
        '    <canvas id="category-chart"></canvas>' +
        '    <div class="dash-chart-skeleton" data-for="category-chart"></div>' +
        '  </div>' +
        '</div>';
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const step = { label: 'category chart', canvas: 'category-chart', run: () => { throw new Error('x'); } };
      expect(() => Dashboard._runChartStep(step)).not.toThrow();

      // Skeleton for this canvas removed even though the chart threw.
      expect(document.querySelectorAll('.dash-chart-skeleton[data-for="category-chart"]').length).toBe(0);
      expect(errSpy).toHaveBeenCalled();
    });
  });

  describe('chart skeletons', () => {
    beforeEach(() => {
      // A dashboard container with two sized chart boxes.
      document.body.innerHTML =
        '<div id="dashboard-content">' +
        '  <div class="dash-card-secondary"><div style="height:400px"><canvas id="income-expense-chart"></canvas></div></div>' +
        '  <div class="dash-card-secondary"><div style="height:144px"><canvas id="category-chart"></canvas></div></div>' +
        '  <div class="dash-card-secondary"><div style="height:300px"><canvas id="investments-trend-chart"></canvas></div></div>' +
        '</div>';
    });

    it('_injectChartSkeletons adds one overlay per present canvas', () => {
      Dashboard._injectChartSkeletons();
      const skels = document.querySelectorAll('#dashboard-content .dash-chart-skeleton');
      // 3 canvases present (income/expense, category, investments); loans + cc absent.
      expect(skels.length).toBe(3);
      // Each overlay is tagged with the canvas it covers.
      const tagged = Array.from(skels).map((s) => s.dataset.for).sort();
      expect(tagged).toEqual(['category-chart', 'income-expense-chart', 'investments-trend-chart']);
      // Parent box was made a positioning context.
      const box = document.getElementById('income-expense-chart').parentElement;
      expect(box.style.position).toBe('relative');
    });

    it('_injectChartSkeletons is idempotent (no duplicate overlays)', () => {
      Dashboard._injectChartSkeletons();
      Dashboard._injectChartSkeletons();
      expect(document.querySelectorAll('#dashboard-content .dash-chart-skeleton').length).toBe(3);
    });

    it('skips canvases that are not present (collapsed / empty sections)', () => {
      // loans-chart + credit-card-bills-chart intentionally absent from DOM.
      Dashboard._injectChartSkeletons();
      expect(document.querySelector('.dash-chart-skeleton[data-for="loans-chart"]')).toBeNull();
      expect(document.querySelector('.dash-chart-skeleton[data-for="credit-card-bills-chart"]')).toBeNull();
    });

    it('_clearChartSkeleton removes only the targeted overlay', () => {
      Dashboard._injectChartSkeletons();
      Dashboard._clearChartSkeleton('category-chart');
      expect(document.querySelector('.dash-chart-skeleton[data-for="category-chart"]')).toBeNull();
      // Others untouched.
      expect(document.querySelectorAll('#dashboard-content .dash-chart-skeleton').length).toBe(2);
    });

    it('_clearChartSkeletons removes every overlay', () => {
      Dashboard._injectChartSkeletons();
      Dashboard._clearChartSkeletons();
      expect(document.querySelectorAll('#dashboard-content .dash-chart-skeleton').length).toBe(0);
    });

    it('hydration clears each skeleton as its chart mounts', () => {
      Dashboard._injectChartSkeletons();
      expect(document.querySelectorAll('#dashboard-content .dash-chart-skeleton').length).toBe(3);

      const gen = ++Dashboard._renderGeneration;
      Dashboard._scheduleChartHydration(gen);

      stepFrame(); // income/expense mounts → its skeleton clears
      expect(document.querySelector('.dash-chart-skeleton[data-for="income-expense-chart"]')).toBeNull();
      expect(document.querySelectorAll('#dashboard-content .dash-chart-skeleton').length).toBe(2);

      drainFrames(); // all mount → all skeletons cleared
      expect(document.querySelectorAll('#dashboard-content .dash-chart-skeleton').length).toBe(0);
    });
  });

  describe('initializeCharts() — synchronous fallback', () => {
    it('runs all steps synchronously and shares the step list', () => {
      Dashboard.initializeCharts();
      expect(Dashboard.renderIncomeExpenseChart).toHaveBeenCalledTimes(1);
      expect(Dashboard.renderCategoryChart).toHaveBeenCalledTimes(1);
      expect(Dashboard.renderInvestmentsTrendChart).toHaveBeenCalledTimes(1);
    });

    it('bails without error when Chart.js is missing', () => {
      delete global.Chart;
      delete window.Chart;
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => Dashboard.initializeCharts()).not.toThrow();
      expect(Dashboard.renderIncomeExpenseChart).not.toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalled();
    });
  });

  // ---- Regression guards for the adversarial-review findings ----------------

  describe('already-mounted canvas guard (toggle-during-hydration race)', () => {
    beforeEach(() => {
      // Give Chart.getChart teeth: report a live chart for canvases in this set.
      const live = new Set();
      global.Chart.getChart = (el) => (el && live.has(el.id) ? {} : undefined);
      global.Chart._live = live; // test handle
    });

    it('skips a pump step whose canvas already has a live chart', () => {
      document.body.innerHTML =
        '<div id="dashboard-content">' +
        '  <div style="height:220px"><canvas id="credit-card-bills-chart"></canvas></div>' +
        '  <details id="credit-card-bills-section" open></details>' +
        '</div>';
      // Simulate: user toggled CC view first, so a live chart already owns the canvas.
      global.Chart._live.add('credit-card-bills-chart');

      const gen = ++Dashboard._renderGeneration;
      Dashboard._scheduleChartHydration(gen);
      drainFrames();

      // The pump reached the CC step but saw a live chart and skipped re-init.
      expect(Dashboard.renderCreditCardBillsChartIfNeeded).not.toHaveBeenCalled();
      // Other charts (no live instance) still hydrated normally.
      expect(Dashboard.renderIncomeExpenseChart).toHaveBeenCalledTimes(1);
      expect(Dashboard.renderInvestmentsTrendChart).toHaveBeenCalledTimes(1);
    });

    it('still clears the skeleton for a skipped (already-live) chart', () => {
      document.body.innerHTML =
        '<div id="dashboard-content">' +
        '  <div style="height:300px"><canvas id="investments-trend-chart"></canvas>' +
        '    <div class="dash-chart-skeleton" data-for="investments-trend-chart"></div>' +
        '  </div>' +
        '</div>';
      global.Chart._live.add('investments-trend-chart');

      const step = Dashboard._chartInitSteps().find((s) => s.canvas === 'investments-trend-chart');
      Dashboard._runChartStep(step);

      expect(Dashboard.renderInvestmentsTrendChart).not.toHaveBeenCalled(); // skipped
      expect(document.querySelector('.dash-chart-skeleton[data-for="investments-trend-chart"]')).toBeNull(); // but cleared
    });
  });

  describe('entry-animation suppression during bulk hydration', () => {
    it('_isBulkHydrating is true only while the current generation is pumping', () => {
      expect(Dashboard._isBulkHydrating()).toBe(false); // idle

      const gen = ++Dashboard._renderGeneration;
      Dashboard._scheduleChartHydration(gen);
      // Flag is stamped synchronously when hydration is scheduled.
      expect(Dashboard._isBulkHydrating()).toBe(true);

      drainFrames(); // sequence completes
      expect(Dashboard._isBulkHydrating()).toBe(false); // re-enabled
    });

    it('_chartAnimation returns 0 duration while bulk-hydrating, 800ms otherwise', () => {
      Dashboard._prefersReducedMotion = vi.fn(() => false);

      const gen = ++Dashboard._renderGeneration;
      Dashboard._scheduleChartHydration(gen);
      expect(Dashboard._chartAnimation()).toEqual({ duration: 0 }); // suppressed on load

      drainFrames();
      expect(Dashboard._chartAnimation()).toEqual({ duration: 800, easing: 'easeOutQuart' }); // animates for user re-renders
    });

    it('a superseding render self-expires the stale suppression stamp', () => {
      const gen = ++Dashboard._renderGeneration; // gen 1
      Dashboard._scheduleChartHydration(gen);
      expect(Dashboard._isBulkHydrating()).toBe(true);

      // A newer render starts (bumps generation) — the old stamp no longer matches.
      Dashboard._renderGeneration = 2;
      expect(Dashboard._isBulkHydrating()).toBe(false);

      // Draining the stale pump must not resurrect suppression or run steps.
      drainFrames();
      expect(Dashboard._isBulkHydrating()).toBe(false);
    });

    it('_prefersReducedMotion still forces 0 duration regardless of hydration', () => {
      Dashboard._prefersReducedMotion = vi.fn(() => true);
      expect(Dashboard._chartAnimation()).toEqual({ duration: 0 });
    });
  });

  describe('renderCreditCardBillsChart — self-healing destroy-at-top', () => {
    it('destroys an existing instance before creating a new chart', () => {
      // Use the REAL renderer (undo the beforeEach stub) with a minimal canvas
      // and a fake live instance, so we prove the destroy-before-create parity
      // fix without needing full Chart.js.
      delete Dashboard.renderCreditCardBillsChart; // drop the vi.fn stub → prototype method
      const RealDashboard = loadModule('modules/dashboard.js', 'Dashboard');

      document.body.innerHTML =
        '<div id="dashboard-content"><canvas id="credit-card-bills-chart"></canvas></div>';
      // jsdom canvas has no 2d context; stub getContext so the renderer proceeds.
      document.getElementById('credit-card-bills-chart').getContext = () => ({});

      const destroy = vi.fn();
      RealDashboard.creditCardBillsChartInstance = { destroy };
      RealDashboard.creditCardChartView = 'total';
      window.DB = { cardBills: [], cards: [], settlementData: {} };

      // A constructable Chart stub so `new Chart(...)` succeeds.
      global.Chart = function Chart() {};
      window.Chart = global.Chart;

      try {
        RealDashboard.renderCreditCardBillsChart();
      } catch (e) {
        // Downstream chart-config code may still throw on the bare stub; the
        // destroy-at-top runs first, which is what we're asserting.
      }

      expect(destroy).toHaveBeenCalledTimes(1);
      expect(RealDashboard.creditCardBillsChartInstance === null
        || RealDashboard.creditCardBillsChartInstance instanceof global.Chart).toBe(true);
    });
  });
});
