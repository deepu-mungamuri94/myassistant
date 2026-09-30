/**
 * Tests for the Schedule (calendar) module.
 *
 * Covers CRUD, the recurrence engine (occursOn across all frequencies with
 * interval / daysOfWeek / endDate / exceptions), event bucketing + sorting,
 * the overlap column-layout algorithm, the time helpers, and day-view render.
 *
 * Notifications are stubbed unavailable so reminder sync is an inert no-op.
 */

const { loadModule } = require('../helpers/loadModule.js');

const pad = n => String(n).padStart(2, '0');
const dstr = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

describe('Schedule Module', () => {
  let Schedule;
  let idCounter = 0;

  beforeEach(() => {
    idCounter = 0;

    window.DB = { scheduleEvents: [] };
    window.Storage = { save: vi.fn() };
    window.Utils = {
      escapeHtml: vi.fn(s => String(s ?? '')),
      escapeJsAttr: vi.fn(s => String(s ?? '')),
      generateId: vi.fn(() => 'id' + (++idCounter)),
      getCurrentTimestamp: vi.fn(() => '2026-09-30T00:00:00'),
      formatLocalDate: vi.fn(d => {
        const date = new Date(d);
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      }),
      showSuccess: vi.fn(),
      showError: vi.fn(),
      confirm: vi.fn(async () => true)
    };
    // Reminders unavailable in tests → syncEventNotifications is a no-op.
    window.Notifications = {
      isAvailable: vi.fn(() => false),
      scheduleForEvent: vi.fn(async () => []),
      cancelForEvent: vi.fn(async () => {})
    };

    document.body.innerHTML = '<div id="schedule-content"></div>';

    Schedule = loadModule('modules/schedule.js', 'Schedule');
  });

  // ==================== CRUD ====================

  describe('add()', () => {
    it('creates an event with id, createdAt and defaults, and persists', () => {
      const ev = Schedule.add({ title: 'Flu Vaccine', type: 'health', date: '2026-10-01', startTime: '09:00' });
      expect(ev.id).toBe('id1');
      expect(ev.title).toBe('Flu Vaccine');
      expect(ev.type).toBe('health');
      expect(ev.createdAt).toBe('2026-09-30T00:00:00');
      expect(ev.recurrence.frequency).toBe('none');
      expect(ev.reminder.enabled).toBe(false);
      expect(ev.notificationIds).toEqual([]);
      expect(window.DB.scheduleEvents).toHaveLength(1);
      expect(window.Storage.save).toHaveBeenCalled();
    });

    it('trims the title and falls back to type "other" for unknown types', () => {
      const ev = Schedule.add({ title: '  Meeting  ', type: 'nonsense', date: '2026-10-01', startTime: '10:00' });
      expect(ev.title).toBe('Meeting');
      expect(ev.type).toBe('other');
    });

    it('migrates legacy type ids to their new life-domain home', () => {
      expect(Schedule.add({ title: 'A', type: 'routine', date: '2026-10-01', startTime: '09:00' }).type).toBe('personal');
      expect(Schedule.add({ title: 'B', type: 'appointment', date: '2026-10-01', startTime: '09:00' }).type).toBe('health');
      expect(Schedule.add({ title: 'C', type: 'meetup', date: '2026-10-01', startTime: '09:00' }).type).toBe('social');
      expect(Schedule.add({ title: 'D', type: 'event', date: '2026-10-01', startTime: '09:00' }).type).toBe('social');
      expect(Schedule.add({ title: 'E', type: 'reminder', date: '2026-10-01', startTime: '09:00' }).type).toBe('other');
    });

    it('nulls out times for all-day events', () => {
      const ev = Schedule.add({ title: 'Holiday', type: 'event', date: '2026-10-01', allDay: true, startTime: '09:00', endTime: '10:00' });
      expect(ev.allDay).toBe(true);
      expect(ev.startTime).toBeNull();
      expect(ev.endTime).toBeNull();
    });

    it('throws without a title or date', () => {
      expect(() => Schedule.add({ type: 'event', date: '2026-10-01' })).toThrow();
      expect(() => Schedule.add({ title: 'X', type: 'event' })).toThrow();
    });

    it('defaults weekly daysOfWeek to the start date weekday', () => {
      const ev = Schedule.add({ title: 'Gym', type: 'routine', date: '2026-01-05', startTime: '07:00', recurrence: { frequency: 'weekly' } });
      const weekday = new Date(2026, 0, 5).getDay();
      expect(ev.recurrence.daysOfWeek).toEqual([weekday]);
    });

    it('normalizes a multi-value reminder into sorted, de-duped offsets', () => {
      const ev = Schedule.add({ title: 'Bill', type: 'finance', date: '2026-10-01', startTime: '15:00', reminder: { offsets: [1440, 30, 30, 60] } });
      expect(ev.reminder.enabled).toBe(true);
      expect(ev.reminder.offsets).toEqual([30, 60, 1440]);
      expect(ev.reminder.minutesBefore).toBe(30); // legacy mirror = earliest offset
    });

    it('accepts a legacy scalar reminder ({ enabled, minutesBefore })', () => {
      const ev = Schedule.add({ title: 'Call', type: 'other', date: '2026-10-01', startTime: '15:00', reminder: { enabled: true, minutesBefore: 30 } });
      expect(ev.reminder.offsets).toEqual([30]);
      expect(ev.reminder.enabled).toBe(true);
    });

    it('treats an empty / absent reminder as disabled with no offsets', () => {
      const ev = Schedule.add({ title: 'X', type: 'other', date: '2026-10-01', startTime: '15:00' });
      expect(ev.reminder.enabled).toBe(false);
      expect(ev.reminder.offsets).toEqual([]);
    });
  });

  describe('getById()', () => {
    it('finds by string or numeric id (string comparison)', () => {
      window.Utils.generateId = vi.fn(() => 12345);
      const ev = Schedule.add({ title: 'X', type: 'event', date: '2026-10-01', startTime: '09:00' });
      expect(Schedule.getById(12345)).toBe(ev);
      expect(Schedule.getById('12345')).toBe(ev);
      expect(Schedule.getById('nope')).toBeUndefined();
    });
  });

  describe('update()', () => {
    it('mutates in place, preserves id/createdAt, and persists', () => {
      const ev = Schedule.add({ title: 'Old', type: 'event', date: '2026-10-01', startTime: '09:00' });
      const updated = Schedule.update(ev.id, { title: 'New', type: 'social', date: '2026-10-02', startTime: '11:00' });
      expect(updated.id).toBe(ev.id);
      expect(updated.createdAt).toBe(ev.createdAt);
      expect(updated.title).toBe('New');
      expect(updated.type).toBe('social');
      expect(window.DB.scheduleEvents).toHaveLength(1);
    });

    it('throws for a missing event', () => {
      expect(() => Schedule.update('ghost', { title: 'X', date: '2026-10-01' })).toThrow('Event not found');
    });
  });

  describe('delete()', () => {
    it('removes the event and persists', () => {
      const a = Schedule.add({ title: 'A', type: 'event', date: '2026-10-01', startTime: '09:00' });
      const b = Schedule.add({ title: 'B', type: 'event', date: '2026-10-01', startTime: '10:00' });
      Schedule.delete(a.id);
      expect(window.DB.scheduleEvents).toHaveLength(1);
      expect(window.DB.scheduleEvents[0].id).toBe(b.id);
    });
  });

  // ==================== RECURRENCE ENGINE ====================

  describe('occursOn() — none', () => {
    it('matches only the exact date', () => {
      const ev = { date: '2026-10-01', recurrence: { frequency: 'none' } };
      expect(Schedule.occursOn(ev, '2026-10-01')).toBe(true);
      expect(Schedule.occursOn(ev, '2026-10-02')).toBe(false);
      expect(Schedule.occursOn(ev, '2026-09-30')).toBe(false);
    });
  });

  describe('occursOn() — daily', () => {
    it('every day for interval 1', () => {
      const ev = { date: '2026-10-01', recurrence: { frequency: 'daily', interval: 1 } };
      expect(Schedule.occursOn(ev, '2026-10-01')).toBe(true);
      expect(Schedule.occursOn(ev, '2026-10-02')).toBe(true);
      expect(Schedule.occursOn(ev, '2026-10-15')).toBe(true);
    });

    it('never before the start date', () => {
      const ev = { date: '2026-10-01', recurrence: { frequency: 'daily', interval: 1 } };
      expect(Schedule.occursOn(ev, '2026-09-30')).toBe(false);
    });

    it('every Nth day for interval > 1', () => {
      const ev = { date: '2026-10-01', recurrence: { frequency: 'daily', interval: 2 } };
      expect(Schedule.occursOn(ev, '2026-10-01')).toBe(true);
      expect(Schedule.occursOn(ev, '2026-10-02')).toBe(false);
      expect(Schedule.occursOn(ev, '2026-10-03')).toBe(true);
    });
  });

  describe('occursOn() — weekly', () => {
    it('same weekday every week (default daysOfWeek)', () => {
      const ev = { date: '2026-01-01', recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [] } };
      expect(Schedule.occursOn(ev, '2026-01-01')).toBe(true);
      expect(Schedule.occursOn(ev, '2026-01-08')).toBe(true);
      expect(Schedule.occursOn(ev, '2026-01-15')).toBe(true);
      for (let d = 2; d <= 7; d++) {
        expect(Schedule.occursOn(ev, dstr(2026, 1, d))).toBe(false);
      }
    });

    it('honours an explicit daysOfWeek set', () => {
      const days = [1, 4]; // Monday, Thursday
      const ev = { date: '2026-01-05', recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: days } };
      for (let d = 5; d <= 11; d++) {
        const weekday = new Date(2026, 0, d).getDay();
        expect(Schedule.occursOn(ev, dstr(2026, 1, d))).toBe(days.includes(weekday));
      }
    });

    it('skips weeks for interval 2', () => {
      const ev = { date: '2026-01-01', recurrence: { frequency: 'weekly', interval: 2, daysOfWeek: [] } };
      expect(Schedule.occursOn(ev, '2026-01-08')).toBe(false); // +1 week
      expect(Schedule.occursOn(ev, '2026-01-15')).toBe(true);  // +2 weeks
    });
  });

  describe('occursOn() — monthly', () => {
    it('same day-of-month each month', () => {
      const ev = { date: '2026-01-15', recurrence: { frequency: 'monthly', interval: 1 } };
      expect(Schedule.occursOn(ev, '2026-02-15')).toBe(true);
      expect(Schedule.occursOn(ev, '2026-03-15')).toBe(true);
      expect(Schedule.occursOn(ev, '2026-02-14')).toBe(false);
    });

    it('skips months that lack the day (no clamping)', () => {
      const ev = { date: '2026-01-31', recurrence: { frequency: 'monthly', interval: 1 } };
      expect(Schedule.occursOn(ev, '2026-02-28')).toBe(false);
      expect(Schedule.occursOn(ev, '2026-03-31')).toBe(true);
    });

    it('respects interval', () => {
      const ev = { date: '2026-01-10', recurrence: { frequency: 'monthly', interval: 3 } };
      expect(Schedule.occursOn(ev, '2026-04-10')).toBe(true);
      expect(Schedule.occursOn(ev, '2026-02-10')).toBe(false);
    });
  });

  describe('occursOn() — yearly', () => {
    it('same month/day each year', () => {
      const ev = { date: '2024-03-15', recurrence: { frequency: 'yearly', interval: 1 } };
      expect(Schedule.occursOn(ev, '2026-03-15')).toBe(true);
      expect(Schedule.occursOn(ev, '2026-03-16')).toBe(false);
      expect(Schedule.occursOn(ev, '2026-04-15')).toBe(false);
    });
  });

  describe('occursOn() — endDate & exceptions', () => {
    it('stops after endDate', () => {
      const ev = { date: '2026-01-01', recurrence: { frequency: 'daily', interval: 1, endDate: '2026-01-03' } };
      expect(Schedule.occursOn(ev, '2026-01-03')).toBe(true);
      expect(Schedule.occursOn(ev, '2026-01-04')).toBe(false);
    });

    it('skips exception dates', () => {
      const ev = { date: '2026-01-01', recurrence: { frequency: 'daily', interval: 1, exceptions: ['2026-01-02'] } };
      expect(Schedule.occursOn(ev, '2026-01-01')).toBe(true);
      expect(Schedule.occursOn(ev, '2026-01-02')).toBe(false);
      expect(Schedule.occursOn(ev, '2026-01-03')).toBe(true);
    });
  });

  // ==================== BUCKETING ====================

  describe('eventsForDate()', () => {
    it('splits all-day vs timed and sorts timed by start', () => {
      Schedule.add({ title: 'All Day', type: 'event', date: '2026-10-01', allDay: true });
      Schedule.add({ title: 'Late', type: 'event', date: '2026-10-01', startTime: '15:00' });
      Schedule.add({ title: 'Early', type: 'event', date: '2026-10-01', startTime: '08:00' });
      const { allDay, timed } = Schedule.eventsForDate('2026-10-01');
      expect(allDay.map(e => e.title)).toEqual(['All Day']);
      expect(timed.map(e => e.title)).toEqual(['Early', 'Late']);
    });

    it('treats a timed event with no startTime as all-day', () => {
      window.DB.scheduleEvents = [
        { id: 1, title: 'No time', type: 'event', date: '2026-10-01', allDay: false, startTime: null, recurrence: { frequency: 'none' } }
      ];
      const { allDay, timed } = Schedule.eventsForDate('2026-10-01');
      expect(allDay).toHaveLength(1);
      expect(timed).toHaveLength(0);
    });

    it('includes recurring occurrences', () => {
      Schedule.add({ title: 'Daily standup', type: 'meetup', date: '2026-09-01', startTime: '09:30', recurrence: { frequency: 'daily' } });
      const { timed } = Schedule.eventsForDate('2026-10-01');
      expect(timed).toHaveLength(1);
      expect(timed[0].title).toBe('Daily standup');
    });
  });

  // ==================== LAYOUT ====================

  describe('_layoutColumns()', () => {
    const mk = (start, end) => ({ startTime: start, endTime: end });

    it('gives non-overlapping events a single column', () => {
      const laid = Schedule._layoutColumns([mk('09:00', '10:00'), mk('10:00', '11:00')]);
      expect(laid).toHaveLength(2);
      laid.forEach(item => {
        expect(item.cols).toBe(1);
        expect(item.col).toBe(0);
      });
    });

    it('splits two overlapping events into two columns', () => {
      const laid = Schedule._layoutColumns([mk('09:00', '10:00'), mk('09:30', '10:30')]);
      expect(laid).toHaveLength(2);
      laid.forEach(item => expect(item.cols).toBe(2));
      expect(new Set(laid.map(i => i.col))).toEqual(new Set([0, 1]));
    });

    it('reuses a freed column after an event ends', () => {
      // A 9-9:30, B 9:15-10, C 9:45-10:30. A and C don't overlap → share col 0;
      // B must sit in col 1. Assert the actual assignment, not just the count.
      const A = mk('09:00', '09:30'), B = mk('09:15', '10:00'), C = mk('09:45', '10:30');
      const laid = Schedule._layoutColumns([A, B, C]);
      expect(laid).toHaveLength(3);
      laid.forEach(item => expect(item.cols).toBe(2));
      const colOf = ref => laid.find(i => i.event === ref).col;
      expect(colOf(A)).toBe(0);
      expect(colOf(C)).toBe(0); // reused A's freed column
      expect(colOf(B)).toBe(1);
    });

    it('defaults a missing end time to a 30-minute block', () => {
      const laid = Schedule._layoutColumns([mk('09:00', null), mk('09:15', null)]);
      // 9:00-9:30 overlaps 9:15-9:45 → two columns
      expect(laid.every(i => i.cols === 2)).toBe(true);
    });
  });

  // ==================== TIME HELPERS ====================

  describe('time helpers', () => {
    it('_timeToMin()', () => {
      expect(Schedule._timeToMin('00:00')).toBe(0);
      expect(Schedule._timeToMin('09:30')).toBe(570);
      expect(Schedule._timeToMin('23:59')).toBe(1439);
      expect(Schedule._timeToMin(null)).toBe(0);
    });

    it('_fmtTime()', () => {
      expect(Schedule._fmtTime('00:00')).toBe('12:00 AM');
      expect(Schedule._fmtTime('09:05')).toBe('9:05 AM');
      expect(Schedule._fmtTime('12:00')).toBe('12:00 PM');
      expect(Schedule._fmtTime('13:30')).toBe('1:30 PM');
      expect(Schedule._fmtTime('23:59')).toBe('11:59 PM');
    });

    it('_addMinutesToTime() wraps past midnight', () => {
      expect(Schedule._addMinutesToTime('09:00', 30)).toBe('09:30');
      expect(Schedule._addMinutesToTime('23:45', 30)).toBe('00:15');
    });
  });

  // ==================== OCCURRENCE DATES ====================

  describe('getOccurrenceDates()', () => {
    it('returns nothing for a one-off event in the past', () => {
      const ev = { id: 1, date: '2020-01-01', allDay: false, startTime: '09:00', recurrence: { frequency: 'none' } };
      expect(Schedule.getOccurrenceDates(ev)).toEqual([]);
    });

    it('caps a daily event at maxCount future date strings', () => {
      const ev = { id: 1, date: '2020-01-01', allDay: false, startTime: '09:00', recurrence: { frequency: 'daily', interval: 1 } };
      const dates = Schedule.getOccurrenceDates(ev, 60, 30);
      expect(dates).toHaveLength(30);
      dates.forEach(d => expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/));
    });
  });

  // ==================== NAVIGATION ====================

  describe('day navigation', () => {
    it('_shiftDay() moves forward and backward across month boundaries', () => {
      expect(Schedule._shiftDay('2026-01-31', 1)).toBe('2026-02-01');
      expect(Schedule._shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    });

    it('selectDay() sets curDate and re-renders', () => {
      Schedule.selectDay('2026-10-01');
      expect(Schedule.curDate).toBe('2026-10-01');
      expect(document.getElementById('schedule-content').textContent).not.toBe('');
    });

    it('_shiftMonth() steps whole months and clamps to month length', () => {
      expect(Schedule._shiftMonth('2026-01-15', 1)).toBe('2026-02-15');
      expect(Schedule._shiftMonth('2026-12-10', 1)).toBe('2027-01-10'); // year rollover
      expect(Schedule._shiftMonth('2026-03-31', -1)).toBe('2026-02-28'); // clamp Jan31→Feb
      expect(Schedule._shiftMonth('2028-01-31', 1)).toBe('2028-02-29');  // leap year clamp
    });

    it('prevMonth()/nextMonth() move curDate by a month', () => {
      Schedule.curDate = '2026-06-15';
      Schedule.nextMonth();
      expect(Schedule.curDate).toBe('2026-07-15');
      Schedule.prevMonth();
      expect(Schedule.curDate).toBe('2026-06-15');
    });

    it('prevWeek()/nextWeek() move curDate by 7 days', () => {
      Schedule.curDate = '2026-06-15';
      Schedule.nextWeek();
      expect(Schedule.curDate).toBe('2026-06-22');
      Schedule.prevWeek();
      expect(Schedule.curDate).toBe('2026-06-15');
    });

    it('pickerYear() steps a whole year and goToMonth() jumps within it', () => {
      Schedule.curDate = '2026-06-15';
      Schedule.pickerYear(1);
      expect(Schedule.curDate).toBe('2027-06-15');
      Schedule.goToMonth(0); // January
      expect(Schedule.curDate).toBe('2027-01-15');
      expect(Schedule._pickerOpen).toBe(false); // selecting a month closes the picker
    });

    it('toggleMonthPicker() flips the picker open/closed', () => {
      Schedule._pickerOpen = false;
      Schedule.toggleMonthPicker();
      expect(Schedule._pickerOpen).toBe(true);
      Schedule.toggleMonthPicker();
      expect(Schedule._pickerOpen).toBe(false);
    });
  });

  // ==================== RENDER ====================

  describe('render()', () => {
    beforeEach(() => {
      Schedule.curDate = '2026-10-01';
    });

    it('renders the date strip and hourly grid into #schedule-content', () => {
      Schedule.add({ title: 'Team Sync', type: 'meetup', date: '2026-10-01', startTime: '10:00', endTime: '11:00' });
      Schedule.render();
      const html = document.getElementById('schedule-content').innerHTML;
      expect(html).toContain('Team Sync');
      expect(html).toContain('12 PM');            // hour label present
      expect(html).toContain('schedule-timeline-scroll');
      expect(html).toContain('schedule-date-strip'); // horizontal date strip
      expect(html).toContain('October 2026');     // month button label
    });

    it('lays out bottom-anchored: calendar space, then date strip, then month button', () => {
      Schedule.render();
      const html = document.getElementById('schedule-content').innerHTML;
      const timelinePos = html.indexOf('schedule-timeline-scroll');
      const stripPos = html.indexOf('schedule-date-strip');
      const monthBtnPos = html.indexOf('Jump to month or year');
      expect(timelinePos).toBeGreaterThan(-1);
      expect(stripPos).toBeGreaterThan(timelinePos);   // date strip below the calendar
      expect(monthBtnPos).toBeGreaterThan(stripPos);   // month button at the very bottom
    });

    it('renders every day of the month in the date strip', () => {
      Schedule.curDate = '2026-02-15'; // 28-day month
      Schedule.render();
      const strip = document.querySelector('.schedule-date-strip');
      expect(strip).not.toBeNull();
      expect(strip.querySelectorAll('button').length).toBe(28);
      // The selected day is flagged for the smooth-centering scroll.
      expect(strip.querySelector('[data-selected="true"]').textContent).toContain('15');
    });

    it('the + button sits inside the calendar space, above the date strip', () => {
      Schedule.render();
      const html = document.getElementById('schedule-content').innerHTML;
      const addBtnPos = html.indexOf('aria-label="Add Event"');
      const stripPos = html.indexOf('schedule-date-strip');
      expect(addBtnPos).toBeGreaterThan(-1);
      expect(addBtnPos).toBeLessThan(stripPos); // + button rendered within the calendar space
    });

    it('scrollDateStrip() rolls into the previous/next month at the edges', () => {
      // jsdom has no layout, so scrollLeft/clientWidth are 0 → treated as "at start".
      Schedule.curDate = '2026-10-10';
      Schedule.render();
      Schedule.scrollDateStrip(-1); // at start → previous month
      expect(Schedule.curDate).toBe('2026-09-10');
    });

    it('renders an all-day chip row when an all-day event exists', () => {
      Schedule.add({ title: 'Diwali', type: 'event', date: '2026-10-01', allDay: true });
      Schedule.render();
      const html = document.getElementById('schedule-content').innerHTML;
      expect(html).toContain('All-day');
      expect(html).toContain('Diwali');
    });

    it('leaves the grid empty (no placeholder hint) when there are no timed events', () => {
      Schedule.render();
      const html = document.getElementById('schedule-content').innerHTML;
      expect(html).not.toContain('No timed events');
      expect(html).not.toContain('Tap a time slot');
    });

    it('does nothing when the container is absent', () => {
      document.body.textContent = '';
      expect(() => Schedule.render()).not.toThrow();
    });
  });

  // ==================== FORM / SAVE ====================

  describe('openForm() + save()', () => {
    beforeEach(() => {
      Schedule.curDate = '2026-10-01';
    });

    it('opens an add modal prefilled with curDate', () => {
      Schedule.openForm();
      const modal = document.getElementById('schedule-modal');
      expect(modal).not.toBeNull();
      expect(document.getElementById('schedule-ev-date').value).toBe('2026-10-01');
      expect(document.getElementById('schedule-ev-id').value).toBe('');
    });

    it('openFormAt() presets the start hour', () => {
      Schedule.openFormAt(14);
      expect(document.getElementById('schedule-ev-start').value).toBe('14:00');
    });

    it('save() reads the form, creates the event, and closes the modal', async () => {
      Schedule.openForm();
      document.getElementById('schedule-ev-title').value = 'Dentist';
      document.getElementById('schedule-ev-type').value = 'health';
      document.getElementById('schedule-ev-date').value = '2026-10-05';
      document.getElementById('schedule-ev-start').value = '16:00';
      document.getElementById('schedule-ev-end').value = '16:30';
      document.getElementById('schedule-ev-repeat').value = 'none';
      // Reminder chips write a CSV of minute offsets to the hidden field.
      document.getElementById('schedule-ev-remind').value = '30,1440';
      await Schedule.save();

      expect(document.getElementById('schedule-modal')).toBeNull();
      const ev = window.DB.scheduleEvents[0];
      expect(ev.title).toBe('Dentist');
      expect(ev.type).toBe('health');
      expect(ev.reminder.enabled).toBe(true);
      // "At time" (0) is mandatory, so it's always merged in alongside the extras.
      expect(ev.reminder.offsets).toEqual([0, 30, 1440]);
      expect(Schedule.curDate).toBe('2026-10-05'); // view jumps to the new event
    });

    it('save() always includes the mandatory "At time" reminder', async () => {
      Schedule.openForm();
      document.getElementById('schedule-ev-title').value = 'Standup';
      document.getElementById('schedule-ev-date').value = '2026-10-05';
      document.getElementById('schedule-ev-start').value = '09:00';
      // Even if the hidden field is somehow emptied, 0 is enforced.
      document.getElementById('schedule-ev-remind').value = '';
      await Schedule.save();
      const ev = window.DB.scheduleEvents[0];
      expect(ev.reminder.offsets).toEqual([0]);
      expect(ev.reminder.enabled).toBe(true);
    });

    it('openForm() pre-selects the mandatory "At time" reminder for new events', () => {
      Schedule.openForm();
      const field = document.getElementById('schedule-ev-remind');
      expect(Schedule._parseOffsets(field.value)).toEqual([0]);
    });

    it('_toggleReminder() flips optional offsets but keeps "At time" locked on', () => {
      Schedule.openForm();
      const field = document.getElementById('schedule-ev-remind');
      Schedule._toggleReminder(30);
      Schedule._toggleReminder(1440);
      expect(Schedule._parseOffsets(field.value).sort((a, b) => a - b)).toEqual([0, 30, 1440]);
      Schedule._toggleReminder(30); // toggle off an optional one
      expect(Schedule._parseOffsets(field.value).sort((a, b) => a - b)).toEqual([0, 1440]);
      Schedule._toggleReminder(0); // mandatory — no-op
      expect(Schedule._parseOffsets(field.value).sort((a, b) => a - b)).toEqual([0, 1440]);
    });

    it('_toggleReminder() keeps the grid and summary line in sync', () => {
      Schedule.openForm();
      Schedule._toggleReminder(30);
      Schedule._toggleReminder(1440);
      const summary = document.getElementById('schedule-remind-summary').textContent;
      expect(summary).toBe('At time · 30 min before · 1 day before');
      // The toggled chips report their pressed state for a11y + styling.
      const grid = document.getElementById('schedule-remind-grid');
      expect(grid.querySelector('[data-offset="30"]').getAttribute('aria-pressed')).toBe('true');
      expect(grid.querySelector('[data-offset="60"]').getAttribute('aria-pressed')).toBe('false');
      // The mandatory chip is always pressed and disabled (locked).
      const atTime = grid.querySelector('[data-offset="0"]');
      expect(atTime.getAttribute('aria-pressed')).toBe('true');
      expect(atTime.disabled).toBe(true);
    });

    it('_reminderSummaryText() always leads with "At time" (mandatory)', () => {
      expect(Schedule._reminderSummaryText([])).toBe('At time');
      expect(Schedule._reminderSummaryText([1440])).toBe('At time · 1 day before');
      expect(Schedule._reminderSummaryText([1440, 0])).toBe('At time · 1 day before');
    });

    it('_withMandatoryReminder() injects 0 and de-dupes/sorts', () => {
      expect(Schedule._withMandatoryReminder([])).toEqual([0]);
      expect(Schedule._withMandatoryReminder([1440, 30])).toEqual([0, 30, 1440]);
      expect(Schedule._withMandatoryReminder([0, 0, 30])).toEqual([0, 30]);
    });

    it('save() blocks an empty title', () => {
      Schedule.openForm();
      document.getElementById('schedule-ev-title').value = '';
      Schedule.save();
      expect(window.Utils.showError).toHaveBeenCalled();
      expect(window.DB.scheduleEvents).toHaveLength(0);
    });

    it('save() drops an end time that is before the start', () => {
      Schedule.openForm();
      document.getElementById('schedule-ev-title').value = 'Backwards';
      document.getElementById('schedule-ev-start').value = '10:00';
      document.getElementById('schedule-ev-end').value = '09:00';
      Schedule.save();
      expect(window.DB.scheduleEvents[0].endTime).toBeNull();
    });

    it('editing an existing event prefills its fields', () => {
      const ev = Schedule.add({ title: 'Existing', type: 'routine', date: '2026-10-02', startTime: '07:00' });
      Schedule.openForm(ev.id);
      expect(document.getElementById('schedule-ev-id').value).toBe(String(ev.id));
      expect(document.getElementById('schedule-ev-title').value).toBe('Existing');
      expect(document.getElementById('schedule-ev-date').value).toBe('2026-10-02');
    });

    it('preserves rich recurrence (interval, multi-day, endDate, exceptions) the form cannot edit, when editing all events', async () => {
      // Simulate an event with rich recurrence the form has no controls for.
      const ev = Schedule.add({
        title: 'Biweekly Mon+Thu', type: 'routine', date: '2026-01-05', startTime: '07:00',
        recurrence: { frequency: 'weekly', interval: 2, daysOfWeek: [1, 4], endDate: '2026-06-30', exceptions: ['2026-02-16'] }
      });

      // Recurring → scope prompt appears; choose "all events" (in-place update).
      Schedule._promptRecurringScope = vi.fn(async () => 'all');
      Schedule.openForm(ev.id);
      document.getElementById('schedule-ev-title').value = 'Renamed';
      document.getElementById('schedule-ev-repeat').value = 'weekly';
      await Schedule.save();

      const saved = window.DB.scheduleEvents[0];
      expect(saved.title).toBe('Renamed');
      expect(saved.recurrence.frequency).toBe('weekly');
      expect(saved.recurrence.interval).toBe(2);          // NOT reset to 1
      expect(saved.recurrence.daysOfWeek).toEqual([1, 4]); // NOT collapsed to one weekday
      expect(saved.recurrence.endDate).toBe('2026-06-30');
      expect(saved.recurrence.exceptions).toEqual(['2026-02-16']);
    });

    it('re-derives a single-day weekly set from the (possibly changed) start date when editing all events', async () => {
      // A weekly event whose daysOfWeek was auto-derived (length 1) SHOULD re-anchor
      // when the start date changes — only multi-day sets are preserved verbatim.
      const ev = Schedule.add({ title: 'Weekly', type: 'routine', date: '2026-01-05', startTime: '07:00', recurrence: { frequency: 'weekly' } });
      expect(ev.recurrence.daysOfWeek).toEqual([new Date(2026, 0, 5).getDay()]); // Monday = 1

      Schedule._promptRecurringScope = vi.fn(async () => 'all');
      Schedule.openForm(ev.id);
      document.getElementById('schedule-ev-date').value = '2026-01-07'; // Wednesday
      document.getElementById('schedule-ev-repeat').value = 'weekly';
      await Schedule.save();

      const saved = window.DB.scheduleEvents[0];
      expect(saved.recurrence.daysOfWeek).toEqual([new Date(2026, 0, 7).getDay()]); // Wednesday = 3
    });

    it('new events created with a repeat frequency default interval to 1', () => {
      Schedule.openForm();
      document.getElementById('schedule-ev-title').value = 'Daily thing';
      document.getElementById('schedule-ev-start').value = '08:00';
      document.getElementById('schedule-ev-repeat').value = 'daily';
      Schedule.save();
      const saved = window.DB.scheduleEvents[0];
      expect(saved.recurrence.frequency).toBe('daily');
      expect(saved.recurrence.interval).toBe(1);
    });
  });

  // ==================== "THIS & FOLLOWING" SERIES SPLIT ====================

  describe('updateThisAndFuture() / deleteThisAndFuture()', () => {
    // These operate relative to "today" (the boundary is clamped so the past is
    // always frozen). Compute dates off the module's own today so the tests are
    // deterministic regardless of the calendar date they run on.
    let today, todayStr;

    const iso = d => Utils.formatLocalDate(d);
    const addDays = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };

    beforeEach(() => {
      todayStr = Schedule._todayStr();
      today = Schedule._parseDate(todayStr);
    });

    describe('helpers', () => {
      it('isRecurring() distinguishes repeating from one-off', () => {
        expect(Schedule.isRecurring({ recurrence: { frequency: 'daily' } })).toBe(true);
        expect(Schedule.isRecurring({ recurrence: { frequency: 'none' } })).toBe(false);
        expect(Schedule.isRecurring({})).toBe(false);
        expect(Schedule.isRecurring(null)).toBe(false);
      });

      it('_firstOccurrenceOnOrAfter() lands on the next on-pattern date', () => {
        // Weekly Monday starting a Monday; from a Wednesday → next Monday.
        const ev = { date: '2026-01-05', recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [1] } };
        expect(Schedule._firstOccurrenceOnOrAfter(ev, '2026-01-07')).toBe('2026-01-12');
        expect(Schedule._firstOccurrenceOnOrAfter(ev, '2026-01-05')).toBe('2026-01-05'); // already on-pattern
      });

      it('_firstOccurrenceOnOrAfter() returns null past a series endDate', () => {
        const ev = { date: '2026-01-05', recurrence: { frequency: 'daily', interval: 1, endDate: '2026-01-10' } };
        expect(Schedule._firstOccurrenceOnOrAfter(ev, '2026-01-20', 30)).toBeNull();
      });
    });

    describe('updateThisAndFuture', () => {
      it('caps the original series and creates a forward series (past frozen)', () => {
        // Daily event that started well before today.
        const startStr = iso(addDays(today, -10));
        const ev = Schedule.add({ title: 'Standup', type: 'meetup', date: startStr, startTime: '09:00', recurrence: { frequency: 'daily' } });

        const boundaryStr = iso(addDays(today, 2)); // split 2 days out
        const created = Schedule.updateThisAndFuture(ev.id, {
          title: 'Standup (new room)', type: 'meetup', date: startStr, startTime: '09:30',
          recurrence: { frequency: 'daily', interval: 1, daysOfWeek: [], exceptions: [] },
          reminder: { enabled: false, minutesBefore: 0 }
        }, boundaryStr);

        expect(created).not.toBeNull();
        expect(window.DB.scheduleEvents).toHaveLength(2);

        // Original capped to the day before the boundary; still 'Standup', 09:00.
        const original = Schedule.getById(ev.id);
        expect(original.title).toBe('Standup');
        expect(original.startTime).toBe('09:00');
        expect(original.recurrence.endDate).toBe(Schedule._shiftDay(boundaryStr, -1));

        // New series anchored at the boundary with the edited values.
        expect(created.date).toBe(boundaryStr);
        expect(created.title).toBe('Standup (new room)');
        expect(created.startTime).toBe('09:30');
        expect(created.recurrence.frequency).toBe('daily');
      });

      it('no day is double-booked or lost across the split boundary', () => {
        const startStr = iso(addDays(today, -5));
        const ev = Schedule.add({ title: 'Daily', type: 'routine', date: startStr, startTime: '08:00', recurrence: { frequency: 'daily' } });
        const boundaryStr = iso(addDays(today, 3));

        Schedule.updateThisAndFuture(ev.id, {
          title: 'Daily v2', type: 'routine', date: startStr, startTime: '08:00',
          recurrence: { frequency: 'daily', interval: 1, daysOfWeek: [], exceptions: [] },
          reminder: { enabled: false, minutesBefore: 0 }
        }, boundaryStr);

        // Every day from start to boundary+3 has exactly one occurrence.
        for (let i = -5; i <= 6; i++) {
          const ds = iso(addDays(today, i));
          const hits = window.DB.scheduleEvents.filter(e => Schedule.occursOn(e, ds));
          expect(hits).toHaveLength(1);
          // Before the boundary → old title; on/after → new title.
          expect(hits[0].title).toBe(ds < boundaryStr ? 'Daily' : 'Daily v2');
        }
      });

      it('clamps a past boundary to today (never rewrites history)', () => {
        const startStr = iso(addDays(today, -10));
        const ev = Schedule.add({ title: 'Daily', type: 'routine', date: startStr, startTime: '08:00', recurrence: { frequency: 'daily' } });

        // Ask to split 3 days in the PAST — should clamp to today.
        const created = Schedule.updateThisAndFuture(ev.id, {
          title: 'Daily v2', type: 'routine', date: startStr, startTime: '08:00',
          recurrence: { frequency: 'daily', interval: 1, daysOfWeek: [], exceptions: [] },
          reminder: { enabled: false, minutesBefore: 0 }
        }, iso(addDays(today, -3)));

        expect(created.date).toBe(todayStr);
        expect(Schedule.getById(ev.id).recurrence.endDate).toBe(Schedule._shiftDay(todayStr, -1));
      });

      it('does a plain in-place update when the boundary is the series start (no empty past)', () => {
        // Series starting today; splitting from today has no past to preserve.
        const ev = Schedule.add({ title: 'Daily', type: 'routine', date: todayStr, startTime: '08:00', recurrence: { frequency: 'daily' } });
        const created = Schedule.updateThisAndFuture(ev.id, {
          title: 'Renamed', type: 'routine', date: todayStr, startTime: '08:00',
          recurrence: { frequency: 'daily', interval: 1, daysOfWeek: [], exceptions: [] },
          reminder: { enabled: false, minutesBefore: 0 }
        }, todayStr);

        expect(window.DB.scheduleEvents).toHaveLength(1); // no split
        expect(created.title).toBe('Renamed');
        expect(created.id).toBe(ev.id); // same record, updated in place
      });

      it('preserves the series hard endDate on the forward record', () => {
        const startStr = iso(addDays(today, -10));
        const endStr = iso(addDays(today, 20));
        const ev = Schedule.add({ title: 'Bounded', type: 'routine', date: startStr, startTime: '08:00', recurrence: { frequency: 'daily', endDate: endStr } });
        const boundaryStr = iso(addDays(today, 2));

        const created = Schedule.updateThisAndFuture(ev.id, {
          title: 'Bounded v2', type: 'routine', date: startStr, startTime: '08:00',
          recurrence: { frequency: 'daily', interval: 1, daysOfWeek: [], exceptions: [] },
          reminder: { enabled: false, minutesBefore: 0 }
        }, boundaryStr);

        expect(created.recurrence.endDate).toBe(endStr); // forward series still ends when the original would
        expect(Schedule.getById(ev.id).recurrence.endDate).toBe(Schedule._shiftDay(boundaryStr, -1));
      });

      it('honours a changed repeat frequency on the forward series (daily → weekly)', () => {
        // Regression: "this & following" used to force the ORIGINAL frequency onto
        // the forward series, silently dropping the user's cadence change.
        const startStr = iso(addDays(today, -10));
        const ev = Schedule.add({ title: 'Daily', type: 'routine', date: startStr, startTime: '08:00', recurrence: { frequency: 'daily' } });
        const boundaryStr = iso(addDays(today, 2));

        const created = Schedule.updateThisAndFuture(ev.id, {
          title: 'Now weekly', type: 'routine', date: startStr, startTime: '08:00',
          recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [], exceptions: [] },
          reminder: { enabled: false, minutesBefore: 0 }
        }, boundaryStr);

        expect(created.recurrence.frequency).toBe('weekly'); // change honoured, not reverted to daily
        expect(Schedule.getById(ev.id).recurrence.frequency).toBe('daily'); // past keeps its cadence
      });

      it('splits a WEEKLY series onto the next on-pattern occurrence (keeps the weekday)', () => {
        // Weekly-Monday starting a past Monday; the forward series must anchor on a
        // real Monday (cadence preserved), not the raw mid-week boundary.
        const startStr = iso(addDays(today, -21));
        const ev = Schedule.add({ title: 'Weekly Mon', type: 'routine', date: startStr, startTime: '08:00', recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [1] } });

        const boundary = Schedule._laterDate(iso(addDays(today, 1)), Schedule._todayStr());
        const expectedAnchor = Schedule._firstOccurrenceOnOrAfter(ev, boundary);
        const created = Schedule.updateThisAndFuture(ev.id, {
          title: 'Weekly Mon v2', type: 'routine', date: startStr, startTime: '08:00',
          recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [1], exceptions: [] },
          reminder: { enabled: false, minutesBefore: 0 }
        }, iso(addDays(today, 1)));

        expect(created).not.toBeNull();
        expect(created.date).toBe(expectedAnchor);
        expect(Schedule._parseDate(created.date).getDay()).toBe(1); // still a Monday
        // No double-book at the seam: original is capped before the anchor.
        expect(Schedule.occursOn(Schedule.getById(ev.id), created.date)).toBe(false);
        expect(Schedule.occursOn(created, created.date)).toBe(true);
      });

      it('returns null (never rewrites the frozen past) when the series has already ended', () => {
        // C2 regression: an already-ended series has no occurrence at/after today,
        // so the split can't anchor. It must return null WITHOUT touching the past
        // and WITHOUT creating a forward record.
        const startStr = iso(addDays(today, -30));
        const endStr = iso(addDays(today, -5)); // ended before today
        const ev = Schedule.add({ title: 'Ended', type: 'routine', date: startStr, startTime: '08:00', recurrence: { frequency: 'daily', endDate: endStr } });

        const result = Schedule.updateThisAndFuture(ev.id, {
          title: 'Should not apply', type: 'routine', date: startStr, startTime: '08:00',
          recurrence: { frequency: 'daily', interval: 1, daysOfWeek: [], exceptions: [] },
          reminder: { enabled: false, minutesBefore: 0 }
        }, iso(addDays(today, 3)));

        expect(result).toBeNull();
        const untouched = Schedule.getById(ev.id);
        expect(untouched.title).toBe('Ended'); // past NOT rewritten
        expect(untouched.recurrence.endDate).toBe(endStr);
        expect(window.DB.scheduleEvents).toHaveLength(1); // no forward record created
      });
    });

    describe('deleteThisAndFuture', () => {
      it('caps the series so future occurrences stop but the past remains', () => {
        const startStr = iso(addDays(today, -10));
        const ev = Schedule.add({ title: 'Daily', type: 'routine', date: startStr, startTime: '08:00', recurrence: { frequency: 'daily' } });
        const boundaryStr = iso(addDays(today, 2));

        Schedule.deleteThisAndFuture(ev.id, boundaryStr);

        expect(window.DB.scheduleEvents).toHaveLength(1); // still there, just capped
        const kept = Schedule.getById(ev.id);
        expect(kept.recurrence.endDate).toBe(Schedule._shiftDay(boundaryStr, -1));
        // Past occurs, boundary+ does not.
        expect(Schedule.occursOn(kept, iso(addDays(today, -1)))).toBe(true);
        expect(Schedule.occursOn(kept, boundaryStr)).toBe(false);
      });

      it('removes the whole record when the boundary is at/before the series start', () => {
        const ev = Schedule.add({ title: 'Daily', type: 'routine', date: todayStr, startTime: '08:00', recurrence: { frequency: 'daily' } });
        Schedule.deleteThisAndFuture(ev.id, todayStr);
        expect(window.DB.scheduleEvents).toHaveLength(0);
      });

      it('keeps the frozen past intact when the series has already ended (no wholesale delete)', () => {
        // C1 regression: an already-ended series has no occurrence at/after today,
        // so there is no future to cut — but the PAST must survive. Deleting
        // "this & following" here should be a no-op on the record, not remove it.
        const startStr = iso(addDays(today, -30));
        const endStr = iso(addDays(today, -5));
        const ev = Schedule.add({ title: 'Ended', type: 'routine', date: startStr, startTime: '08:00', recurrence: { frequency: 'daily', endDate: endStr } });

        Schedule.deleteThisAndFuture(ev.id, iso(addDays(today, 3)));

        expect(window.DB.scheduleEvents).toHaveLength(1); // NOT deleted
        const kept = Schedule.getById(ev.id);
        expect(Schedule.occursOn(kept, iso(addDays(today, -10)))).toBe(true); // past still occurs
        // endDate never pushed later than it already was.
        expect(kept.recurrence.endDate <= endStr).toBe(true);
      });
    });

    describe('save()/‑delete scope routing', () => {
      it('save() with "future" scope splits the series', async () => {
        const startStr = iso(addDays(today, -7));
        const ev = Schedule.add({ title: 'Gym', type: 'routine', date: startStr, startTime: '07:00', recurrence: { frequency: 'daily' } });
        Schedule.curDate = iso(addDays(today, 1)); // viewing tomorrow's occurrence
        Schedule._promptRecurringScope = vi.fn(async () => 'future');

        Schedule.openForm(ev.id);
        document.getElementById('schedule-ev-title').value = 'Gym (evening)';
        document.getElementById('schedule-ev-start').value = '19:00';
        document.getElementById('schedule-ev-repeat').value = 'daily';
        await Schedule.save();

        expect(Schedule._promptRecurringScope).toHaveBeenCalledWith('edit');
        expect(window.DB.scheduleEvents).toHaveLength(2);
        const original = Schedule.getById(ev.id);
        expect(original.title).toBe('Gym'); // past unchanged
        const future = window.DB.scheduleEvents.find(e => e.id !== ev.id);
        expect(future.title).toBe('Gym (evening)');
        expect(future.startTime).toBe('19:00');
      });

      it('save() with "all" scope updates in place (no split)', async () => {
        const ev = Schedule.add({ title: 'Gym', type: 'routine', date: iso(addDays(today, -7)), startTime: '07:00', recurrence: { frequency: 'daily' } });
        Schedule._promptRecurringScope = vi.fn(async () => 'all');

        Schedule.openForm(ev.id);
        document.getElementById('schedule-ev-title').value = 'Gym renamed';
        document.getElementById('schedule-ev-repeat').value = 'daily';
        await Schedule.save();

        expect(window.DB.scheduleEvents).toHaveLength(1);
        expect(Schedule.getById(ev.id).title).toBe('Gym renamed');
      });

      it('save() cancelled scope leaves everything untouched', async () => {
        const ev = Schedule.add({ title: 'Gym', type: 'routine', date: iso(addDays(today, -7)), startTime: '07:00', recurrence: { frequency: 'daily' } });
        Schedule._promptRecurringScope = vi.fn(async () => null);

        Schedule.openForm(ev.id);
        document.getElementById('schedule-ev-title').value = 'Should not stick';
        await Schedule.save();

        expect(window.DB.scheduleEvents).toHaveLength(1);
        expect(Schedule.getById(ev.id).title).toBe('Gym'); // unchanged
      });

      it('editing a NON-recurring event never prompts for scope', async () => {
        const ev = Schedule.add({ title: 'One-off', type: 'event', date: todayStr, startTime: '10:00' });
        Schedule._promptRecurringScope = vi.fn(async () => 'all');

        Schedule.openForm(ev.id);
        document.getElementById('schedule-ev-title').value = 'One-off edited';
        await Schedule.save();

        expect(Schedule._promptRecurringScope).not.toHaveBeenCalled();
        expect(Schedule.getById(ev.id).title).toBe('One-off edited');
      });

      it('_deleteFromForm() with "future" scope caps the series', async () => {
        const ev = Schedule.add({ title: 'Daily', type: 'routine', date: iso(addDays(today, -7)), startTime: '08:00', recurrence: { frequency: 'daily' } });
        Schedule.curDate = iso(addDays(today, 1));
        Schedule._promptRecurringScope = vi.fn(async () => 'future');

        await Schedule._deleteFromForm(ev.id);

        expect(Schedule._promptRecurringScope).toHaveBeenCalledWith('delete');
        expect(window.DB.scheduleEvents).toHaveLength(1); // capped, not removed
        expect(Schedule.getById(ev.id).recurrence.endDate).toBeTruthy();
      });

      it('_deleteFromForm() with "all" scope removes the whole series', async () => {
        const ev = Schedule.add({ title: 'Daily', type: 'routine', date: iso(addDays(today, -7)), startTime: '08:00', recurrence: { frequency: 'daily' } });
        Schedule._promptRecurringScope = vi.fn(async () => 'all');

        await Schedule._deleteFromForm(ev.id);

        expect(window.DB.scheduleEvents).toHaveLength(0);
      });

      it('deleting a NON-recurring event uses a plain confirm, not the scope prompt', async () => {
        const ev = Schedule.add({ title: 'One-off', type: 'event', date: todayStr, startTime: '10:00' });
        Schedule._promptRecurringScope = vi.fn(async () => 'all');
        window.Utils.confirm = vi.fn(async () => true);

        await Schedule._deleteFromForm(ev.id);

        expect(Schedule._promptRecurringScope).not.toHaveBeenCalled();
        expect(window.Utils.confirm).toHaveBeenCalled();
        expect(window.DB.scheduleEvents).toHaveLength(0);
      });
    });
  });
});
