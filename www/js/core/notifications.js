/**
 * Notifications Module
 * Thin wrapper around @capacitor/local-notifications for Schedule reminders.
 *
 * DESIGN: every method is a safe no-op when the plugin is unavailable (web
 * browser, jsdom tests, or a native build where the plugin failed to load), so
 * callers never need to guard. The one piece of real logic — turning an event
 * occurrence into the exact instant a reminder should fire — is the PURE,
 * dependency-free `computeFireTime()` so it can be unit-tested without Capacitor.
 */

const Notifications = {
    /**
     * Get the LocalNotifications plugin, or null if unavailable.
     * Guards against: web (no Capacitor), native without the plugin installed,
     * and the test environment.
     */
    _plugin() {
        try {
            if (typeof window === 'undefined') return null;
            const cap = window.Capacitor;
            if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) {
                return null;
            }
            return (cap.Plugins && cap.Plugins.LocalNotifications) || null;
        } catch (e) {
            return null;
        }
    },

    /**
     * Whether local notifications can actually be scheduled on this platform.
     */
    isAvailable() {
        return this._plugin() !== null;
    },

    /**
     * Derive a stable 32-bit-positive integer notification id from an event id
     * and occurrence index. Capacitor requires notification ids to fit in a Java
     * int; our event ids are 13-digit Date.now() values that overflow it. A small
     * deterministic hash keeps ids stable across app launches (so we can cancel
     * the right ones) while staying inside the int range.
     * @param {number|string} eventId
     * @param {number} occurrenceIndex
     * @param {number} offsetMinutes  the reminder offset, so multiple reminders on
     *        the same occurrence (e.g. 1 day + 30 min before) get distinct ids
     * @returns {number} positive integer < 2^31
     */
    notificationId(eventId, occurrenceIndex = 0, offsetMinutes = 0) {
        const str = `${eventId}#${occurrenceIndex}#${offsetMinutes}`;
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            // djb2; & 0x7fffffff keeps it a positive 31-bit int every step.
            hash = ((hash * 33) ^ str.charCodeAt(i)) & 0x7fffffff;
        }
        // Avoid 0 (some platforms treat it specially).
        return hash === 0 ? 1 : hash;
    },

    /**
     * Extract the list of "minutes before" offsets from a reminder, tolerating
     * both the multi-value shape ({ offsets: [...] } / { minutesBefore: [...] })
     * and the legacy scalar ({ minutesBefore: 30 }). Returns a de-duped, sorted
     * array of non-negative integers (may be empty).
     */
    _reminderOffsets(reminder) {
        if (!reminder) return [];
        let list = [];
        if (Array.isArray(reminder.offsets)) list = reminder.offsets;
        else if (Array.isArray(reminder.minutesBefore)) list = reminder.minutesBefore;
        // Legacy scalar: honour an explicit enabled:false (matches Schedule's
        // _normalizeReminder so both layers agree on every input shape).
        else if (reminder.minutesBefore != null && reminder.enabled !== false) list = [reminder.minutesBefore];
        return Array.from(new Set(
            list.map(v => parseInt(v, 10)).filter(n => Number.isFinite(n) && n >= 0)
        )).sort((a, b) => a - b);
    },

    /**
     * PURE: the instant a reminder should fire for one occurrence.
     *
     * @param {string} date       'YYYY-MM-DD' of the occurrence
     * @param {string|null} startTime 'HH:MM' start, or null for an all-day event
     * @param {boolean} allDay
     * @param {number} minutesBefore  how many minutes before the start to remind
     * @returns {Date|null} the fire instant, or null if inputs are unusable
     *
     * All-day events have no start time, so they anchor at 09:00 local on the
     * event day and `minutesBefore` is measured from there (e.g. 1440 → 09:00 the
     * day before). Timed events fire at start − minutesBefore.
     */
    computeFireTime(date, startTime, allDay, minutesBefore) {
        if (!date || typeof date !== 'string') return null;
        const parts = date.split('-').map(Number);
        if (parts.length !== 3 || parts.some(isNaN)) return null;
        const [year, month, day] = parts;

        let hours = 9;
        let mins = 0;
        if (!allDay) {
            if (!startTime || typeof startTime !== 'string') return null;
            const tParts = startTime.split(':').map(Number);
            if (tParts.length < 2 || tParts.some(isNaN)) return null;
            hours = tParts[0];
            mins = tParts[1];
        }

        // Construct in LOCAL time (matches how the user entered date/time).
        const start = new Date(year, month - 1, day, hours, mins, 0, 0);
        if (isNaN(start.getTime())) return null;

        const offset = Number(minutesBefore) || 0;
        return new Date(start.getTime() - offset * 60000);
    },

    /**
     * Request notification permission (idempotent, safe on web).
     * @returns {Promise<boolean>} true if granted
     */
    async requestPermission() {
        const plugin = this._plugin();
        if (!plugin) return false;
        try {
            const result = await plugin.requestPermissions();
            return result && (result.display === 'granted');
        } catch (e) {
            console.warn('Notification permission request failed:', e);
            return false;
        }
    },

    /**
     * Schedule reminders for a set of future occurrence dates of an event.
     *
     * @param {object} event  a scheduleEvents record (reads title/type/reminder/
     *        allDay/startTime/location)
     * @param {string[]} occurrenceDates  'YYYY-MM-DD' dates from the Schedule
     *        module's recurrence engine (already limited to a horizon). Each date
     *        is turned into a fire instant here via computeFireTime(), so the
     *        all-day 09:00 anchor and minutesBefore offset live in one tested spot.
     * @returns {Promise<number[]>} the integer notification ids actually scheduled
     *
     * Returns [] (and does nothing) when notifications are unavailable, the
     * reminder is disabled, or nothing lies in the future. The caller persists
     * the returned ids on the event so they can be cancelled later.
     */
    async scheduleForEvent(event, occurrenceDates) {
        const plugin = this._plugin();
        if (!plugin || !event || !event.reminder) return [];
        if (!Array.isArray(occurrenceDates) || occurrenceDates.length === 0) return [];

        // A reminder may carry MULTIPLE offsets (e.g. "1 day before" AND "30 min
        // before"). Schedule one notification per (occurrence × offset) pair. The
        // offsets list is the source of truth for whether a reminder is active —
        // an explicit enabled:false with a non-empty list still won't reach here in
        // practice because _normalize keeps them consistent, but tolerate either.
        const offsets = event.reminder.enabled === false ? [] : this._reminderOffsets(event.reminder);
        if (offsets.length === 0) return [];

        const now = Date.now();
        const notifications = [];

        occurrenceDates.forEach((date, index) => {
            offsets.forEach(minutesBefore => {
                const fireAt = this.computeFireTime(date, event.startTime, event.allDay, minutesBefore);
                if (!fireAt || fireAt.getTime() <= now) return; // skip bad input / past fires

                // The occurrence's start instant (fireAt + the offset back) drives
                // the title's displayed time.
                const start = new Date(fireAt.getTime() + minutesBefore * 60000);
                notifications.push({
                    id: this.notificationId(event.id, index, minutesBefore),
                    // Line 1 (bold): "{title} at {time}". Line 2 (smaller/lighter):
                    // the notes. Android renders `title` in regular weight and
                    // `body` in a smaller, lighter style, matching the requested look.
                    title: this._notificationTitle(event, start, fireAt),
                    body: this._notificationBody(event),
                    schedule: { at: fireAt, allowWhileIdle: true }
                });
            });
        });

        if (notifications.length === 0) return [];

        try {
            await this.requestPermission();
            await plugin.schedule({ notifications });
            return notifications.map(n => n.id);
        } catch (e) {
            console.warn('Failed to schedule notifications for event', event.id, e);
            return [];
        }
    },

    /**
     * Cancel any pending notifications previously scheduled for an event.
     * @param {number[]} notificationIds  ids stored on the event
     */
    async cancelForEvent(notificationIds) {
        const plugin = this._plugin();
        if (!plugin || !Array.isArray(notificationIds) || notificationIds.length === 0) return;
        try {
            await plugin.cancel({ notifications: notificationIds.map(id => ({ id })) });
        } catch (e) {
            console.warn('Failed to cancel notifications:', e);
        }
    },

    /** 24h Date → friendly '9:05 AM' for the notification title. */
    _fmtTime(d) {
        let h = d.getHours();
        const m = d.getMinutes();
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12; if (h === 0) h = 12;
        return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
    },

    /** Type → emoji icon, prefixed inline before the title on Line 1. Prefers
     * Schedule's alias-aware config (single source of truth on-device) and falls
     * back to a local mirror off-device / in tests. */
    _TYPE_ICONS: { personal: '🧘', health: '💊', finance: '💰', social: '🎉', travel: '✈️', other: '📌' },
    _typeIcon(type) {
        try {
            if (typeof window !== 'undefined' && window.Schedule && typeof window.Schedule._typeConfig === 'function') {
                const cfg = window.Schedule._typeConfig(type);
                if (cfg && cfg.icon) return cfg.icon;
            }
        } catch (e) { /* fall through to local map */ }
        return this._TYPE_ICONS[type] || this._TYPE_ICONS.other;
    },

    /**
     * Calendar-day difference between two dates → a friendly relative label.
     * 0 → "Today", 1 → "Tomorrow", -1 → "Yesterday", else a short date
     * ("Mon, Oct 5"). `from` defaults to the moment the notification fires.
     */
    _relativeDayLabel(target, from) {
        const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const days = Math.round((startOfDay(target) - startOfDay(from)) / 86400000);
        if (days === 0) return 'Today';
        if (days === 1) return 'Tomorrow';
        if (days === -1) return 'Yesterday';
        const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][target.getDay()];
        const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][target.getMonth()];
        return `${wd}, ${mo} ${target.getDate()}`;
    },

    /**
     * Notification title (Line 1, regular text): "{icon} {title} at {time}".
     * The type icon is prefixed inline so it sits at the title's text size.
     * All-day events read "{icon} {title} · {relative day}" (e.g. "· Today",
     * "· Tomorrow") — relative to when the reminder fires — since there's no
     * clock time. This is Android's bold headline line.
     * @param {object} event
     * @param {Date} start  the occurrence's start instant
     * @param {Date} [fireAt]  when the reminder fires (for the relative-day label)
     */
    _notificationTitle(event, start, fireAt) {
        const icon = this._typeIcon(event.type);
        const title = `${icon} ${event.title || 'Event'}`;
        if (event.allDay || !(start instanceof Date) || isNaN(start.getTime())) {
            if (!event.allDay) return title;
            const when = (fireAt instanceof Date && !isNaN(fireAt.getTime())) ? fireAt : start;
            return `${title} · ${this._relativeDayLabel(start, when)}`;
        }
        return `${title} at ${this._fmtTime(start)}`;
    },

    /**
     * Notification body (Line 2, smaller/lighter text): the event's notes.
     * Android styles the content-text line in a smaller, lighter weight than the
     * title, which is exactly the requested look. Empty when there are no notes.
     */
    _notificationBody(event) {
        return (event.notes || '').trim();
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Notifications = Notifications;
}

// CommonJS export so tests can require() this file directly if desired.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Notifications;
}
