/**
 * Tests for the Notifications module (Schedule reminders).
 *
 * The module is a thin wrapper around @capacitor/local-notifications that is a
 * safe no-op off-device. In jsdom there is no window.Capacitor, so every
 * plugin-backed method should degrade gracefully. The genuinely testable logic
 * is the pure computeFireTime() and the deterministic notificationId() hash.
 */

const { loadModule } = require('../helpers/loadModule.js');

describe('Notifications Module', () => {
  let Notifications;

  beforeEach(() => {
    // Ensure no Capacitor is present — this is the web/test path.
    delete window.Capacitor;
    Notifications = loadModule('core/notifications.js', 'Notifications');
  });

  describe('availability (no Capacitor)', () => {
    it('isAvailable() is false without Capacitor', () => {
      expect(Notifications.isAvailable()).toBe(false);
    });

    it('isAvailable() is false when not a native platform', () => {
      window.Capacitor = { isNativePlatform: () => false, Plugins: {} };
      expect(Notifications.isAvailable()).toBe(false);
    });

    it('isAvailable() is false on native without the plugin', () => {
      window.Capacitor = { isNativePlatform: () => true, Plugins: {} };
      expect(Notifications.isAvailable()).toBe(false);
    });

    it('isAvailable() is true on native with the plugin', () => {
      window.Capacitor = { isNativePlatform: () => true, Plugins: { LocalNotifications: {} } };
      expect(Notifications.isAvailable()).toBe(true);
    });
  });

  describe('computeFireTime()', () => {
    it('fires minutesBefore a timed event start', () => {
      const t = Notifications.computeFireTime('2026-10-01', '09:00', false, 30);
      expect(t).toBeInstanceOf(Date);
      expect(t.getFullYear()).toBe(2026);
      expect(t.getMonth()).toBe(9); // October (0-indexed)
      expect(t.getDate()).toBe(1);
      expect(t.getHours()).toBe(8);
      expect(t.getMinutes()).toBe(30);
    });

    it('fires exactly at start when minutesBefore is 0', () => {
      const t = Notifications.computeFireTime('2026-10-01', '14:15', false, 0);
      expect(t.getHours()).toBe(14);
      expect(t.getMinutes()).toBe(15);
    });

    it('crosses midnight backwards when the offset exceeds the start time', () => {
      const t = Notifications.computeFireTime('2026-10-01', '00:15', false, 30);
      expect(t.getDate()).toBe(30); // previous day
      expect(t.getMonth()).toBe(8); // September
      expect(t.getHours()).toBe(23);
      expect(t.getMinutes()).toBe(45);
    });

    it('anchors all-day events at 09:00 local', () => {
      const t = Notifications.computeFireTime('2026-10-01', null, true, 0);
      expect(t.getHours()).toBe(9);
      expect(t.getMinutes()).toBe(0);
      expect(t.getDate()).toBe(1);
    });

    it('all-day "1 day before" fires 09:00 the previous day', () => {
      const t = Notifications.computeFireTime('2026-10-01', null, true, 1440);
      expect(t.getDate()).toBe(30);
      expect(t.getMonth()).toBe(8);
      expect(t.getHours()).toBe(9);
      expect(t.getMinutes()).toBe(0);
    });

    it('returns null for a missing/invalid date', () => {
      expect(Notifications.computeFireTime(null, '09:00', false, 0)).toBeNull();
      expect(Notifications.computeFireTime('not-a-date', '09:00', false, 0)).toBeNull();
      expect(Notifications.computeFireTime('2026-13', '09:00', false, 0)).toBeNull();
    });

    it('returns null for a timed event with no/invalid start time', () => {
      expect(Notifications.computeFireTime('2026-10-01', null, false, 0)).toBeNull();
      expect(Notifications.computeFireTime('2026-10-01', 'xx:yy', false, 0)).toBeNull();
    });
  });

  describe('notificationId()', () => {
    it('is a positive 31-bit integer', () => {
      const id = Notifications.notificationId(1727654400000, 0);
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThan(0);
      expect(id).toBeLessThan(2 ** 31);
    });

    it('stays in range even for very large 13-digit event ids', () => {
      for (const eventId of [1000000000000, 9999999999999, 1727654400123]) {
        for (let occ = 0; occ < 5; occ++) {
          const id = Notifications.notificationId(eventId, occ);
          expect(id).toBeGreaterThan(0);
          expect(id).toBeLessThan(2 ** 31);
        }
      }
    });

    it('is deterministic (same inputs → same id)', () => {
      expect(Notifications.notificationId(123, 2)).toBe(Notifications.notificationId(123, 2));
      expect(Notifications.notificationId('abc', 0)).toBe(Notifications.notificationId('abc', 0));
    });

    it('differs across occurrence indices for the same event', () => {
      const ids = [0, 1, 2, 3, 4].map(i => Notifications.notificationId(555, i));
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('differs across events for the same occurrence index', () => {
      expect(Notifications.notificationId(100, 0)).not.toBe(Notifications.notificationId(200, 0));
    });

    it('differs across reminder offsets on the same occurrence', () => {
      // Multiple reminders on one occurrence (30 min + 1 day before) must get
      // distinct ids so they can be scheduled/cancelled independently.
      const a = Notifications.notificationId(555, 0, 30);
      const b = Notifications.notificationId(555, 0, 1440);
      expect(a).not.toBe(b);
      expect(a).toBeGreaterThan(0);
      expect(b).toBeLessThan(2 ** 31);
    });
  });

  describe('plugin-backed methods are safe no-ops without Capacitor', () => {
    it('requestPermission() resolves false', async () => {
      await expect(Notifications.requestPermission()).resolves.toBe(false);
    });

    it('scheduleForEvent() resolves to [] ', async () => {
      const event = { id: 1, title: 'X', type: 'event', startTime: '09:00', reminder: { enabled: true, minutesBefore: 30 } };
      await expect(Notifications.scheduleForEvent(event, ['2026-10-01'])).resolves.toEqual([]);
    });

    it('cancelForEvent() resolves without throwing', async () => {
      await expect(Notifications.cancelForEvent([1, 2, 3])).resolves.toBeUndefined();
    });
  });

  describe('scheduleForEvent() on native', () => {
    let scheduled;
    beforeEach(() => {
      scheduled = [];
      window.Capacitor = {
        isNativePlatform: () => true,
        Plugins: {
          LocalNotifications: {
            requestPermissions: async () => ({ display: 'granted' }),
            schedule: async ({ notifications }) => { scheduled = notifications; },
            cancel: async () => {}
          }
        }
      };
      Notifications = loadModule('core/notifications.js', 'Notifications');
    });

    it('does nothing when the reminder is disabled', async () => {
      const event = { id: 1, title: 'X', type: 'event', startTime: '09:00', reminder: { enabled: false, minutesBefore: 0 } };
      const ids = await Notifications.scheduleForEvent(event, ['2126-01-01']);
      expect(ids).toEqual([]);
      expect(scheduled).toEqual([]);
    });

    it('skips occurrences in the past and schedules future ones (index preserved)', async () => {
      const event = { id: 7, title: 'Vaccine', type: 'health', allDay: false, startTime: '09:00', reminder: { enabled: true, minutesBefore: 0 } };
      const ids = await Notifications.scheduleForEvent(event, ['2000-01-01', '2126-01-01']);
      expect(ids.length).toBe(1);
      expect(scheduled.length).toBe(1);
      expect(scheduled[0].id).toBe(Notifications.notificationId(7, 1)); // index 1 = the future one
      expect(scheduled[0].title).toContain('Vaccine');
    });

    it('routes through computeFireTime for all-day events (fires 09:00 the day before for "1 day before")', async () => {
      const event = { id: 9, title: 'Anniversary', type: 'social', allDay: true, startTime: null, reminder: { enabled: true, minutesBefore: 1440 } };
      const ids = await Notifications.scheduleForEvent(event, ['2126-06-15']);
      expect(ids.length).toBe(1);
      const fireAt = scheduled[0].schedule.at;
      expect(fireAt.getDate()).toBe(14);   // day before
      expect(fireAt.getMonth()).toBe(5);   // June
      expect(fireAt.getHours()).toBe(9);   // all-day anchor
      // All-day events read "{icon} {title} · {relative day}". Firing the day
      // before the event → the event is "Tomorrow" relative to the fire time.
      expect(scheduled[0].title).toContain('Tomorrow');
      expect(scheduled[0].title).toContain('Anniversary');
      expect(scheduled[0].title).toContain('🎉'); // social type icon, inline
    });

    it('formats the title as "{title} at {time}" and the body as the notes', async () => {
      const event = { id: 11, title: 'Flu Vaccine', type: 'health', allDay: false, startTime: '09:00', notes: 'Bring insurance card', location: 'City Clinic', reminder: { enabled: true, offsets: [0] } };
      await Notifications.scheduleForEvent(event, ['2126-01-01']);
      expect(scheduled.length).toBe(1);
      // Line 1 (title): "{type icon} {title} at {time}" — icon inline at title size.
      expect(scheduled[0].title).toBe('💊 Flu Vaccine at 9:00 AM');
      // Line 2 (body): just the notes, rendered smaller/lighter by Android.
      expect(scheduled[0].body).toBe('Bring insurance card');
    });

    it('uses an empty body when there are no notes', async () => {
      const event = { id: 12, title: 'Standup', type: 'personal', allDay: false, startTime: '14:30', reminder: { enabled: true, offsets: [0] } };
      await Notifications.scheduleForEvent(event, ['2126-01-01']);
      expect(scheduled[0].title).toBe('🧘 Standup at 2:30 PM');
      expect(scheduled[0].body).toBe('');
    });

    it('schedules one notification per (occurrence × offset) with distinct ids', async () => {
      // Multi-value reminder: 30 min AND 1 day before, over two future occurrences
      // → 4 notifications, all with unique ids.
      const event = { id: 42, title: 'Pills', type: 'health', allDay: false, startTime: '09:00', reminder: { enabled: true, offsets: [30, 1440] } };
      const ids = await Notifications.scheduleForEvent(event, ['2126-01-01', '2126-01-08']);
      expect(ids.length).toBe(4);
      expect(new Set(ids).size).toBe(4); // no collisions across occurrence×offset
      expect(scheduled.length).toBe(4);
      // Each occurrence contributes a 30-min-before and a 1-day-before fire time.
      const hours = scheduled.map(n => n.schedule.at.getHours()).sort();
      expect(hours).toEqual([8, 8, 9, 9]); // 08:30 (30 min before) ×2, 09:00-prev-day (1 day before) ×2
    });

    it('accepts the offsets array shape as enabled even without an explicit enabled flag', async () => {
      const event = { id: 43, title: 'Bill', type: 'finance', allDay: false, startTime: '10:00', reminder: { offsets: [15] } };
      const ids = await Notifications.scheduleForEvent(event, ['2126-03-01']);
      expect(ids.length).toBe(1);
    });

    it('prefixes the type icon inline for finance events', async () => {
      const event = { id: 44, title: 'Rent', type: 'finance', allDay: false, startTime: '10:00', reminder: { offsets: [0] } };
      await Notifications.scheduleForEvent(event, ['2126-03-01']);
      expect(scheduled[0].title).toBe('💰 Rent at 10:00 AM');
    });

    it('all-day reminder fired ON the day reads "· Today"', async () => {
      // "At time" (offset 0) on an all-day event fires 09:00 that same day.
      const event = { id: 45, title: 'Holiday', type: 'personal', allDay: true, startTime: null, reminder: { offsets: [0] } };
      await Notifications.scheduleForEvent(event, ['2126-07-04']);
      expect(scheduled[0].title).toBe('🧘 Holiday · Today');
    });

    it('two distinct events at the same instant get separate, non-colliding notifications', async () => {
      // Collision policy: notification id is hashed from event.id, so different
      // events firing at the same time keep distinct ids → Android STACKS them as
      // two separate notifications (neither overrides nor merges the other).
      const a = { id: 100, title: 'Standup', type: 'personal', allDay: false, startTime: '09:00', reminder: { offsets: [0] } };
      const b = { id: 200, title: 'Yoga',    type: 'health',   allDay: false, startTime: '09:00', reminder: { offsets: [0] } };
      const idsA = await Notifications.scheduleForEvent(a, ['2126-05-01']);
      const idsB = await Notifications.scheduleForEvent(b, ['2126-05-01']);
      expect(idsA.length).toBe(1);
      expect(idsB.length).toBe(1);
      expect(idsA[0]).not.toBe(idsB[0]); // no override — independent notifications
    });
  });

  describe('_relativeDayLabel()', () => {
    it('labels same day / next day / previous day', () => {
      const base = new Date(2026, 6, 4, 9, 0); // Jul 4 2026, 09:00
      expect(Notifications._relativeDayLabel(new Date(2026, 6, 4), base)).toBe('Today');
      expect(Notifications._relativeDayLabel(new Date(2026, 6, 5), base)).toBe('Tomorrow');
      expect(Notifications._relativeDayLabel(new Date(2026, 6, 3), base)).toBe('Yesterday');
    });

    it('falls back to a short weekday+date for far-off days', () => {
      const base = new Date(2026, 6, 4, 9, 0);
      expect(Notifications._relativeDayLabel(new Date(2026, 6, 10), base)).toBe('Fri, Jul 10');
    });
  });
});
