/**
 * Schedule Module (Calendar)
 * Google-Calendar-style planner for anything time-based — routines, health,
 * finances, social plans, travel — each event tagged by life-domain type and
 * able to carry one or more reminders.
 *
 * v1 surface: a single DAY view — a vertical hourly grid (12 AM → 11 PM) with a
 * live "now" line, side-by-side layout for overlapping events, a swipeable week
 * strip, and an add/edit modal with recurrence + reminders.
 *
 * Data lives in window.DB.scheduleEvents (see database.js for the record shape).
 * This is DISTINCT from the `Events` module, which merely tags expenses with an
 * event name — no relation.
 *
 * Reminders are delegated to window.Notifications, which is a safe no-op on web /
 * in tests, so this module runs fine without the native plugin.
 */

const Schedule = {
    // Pixels per hour in the day grid. 56px keeps hour rows touch-friendly while
    // the whole 24h column (1344px) stays comfortably scrollable.
    HOUR_PX: 56,

    // Currently-viewed day, 'YYYY-MM-DD'. Initialized lazily in render()/init().
    curDate: null,

    /**
     * Event types → display config, organized by LIFE-DOMAIN (not activity) so
     * every event has one obvious home and there's no overlap. Reminders are NOT a
     * type — any event of any type can carry one or more reminders (see `reminder`).
     * Colors reuse the app's Tailwind gradient vocabulary; Play CDN resolves these
     * dynamic classes at runtime.
     *   Personal → routines, grooming, self-care, pills, chores
     *   Health   → vaccinations, doctor visits, medical
     *   Finance  → bills, recharges, EMIs, payments
     *   Social   → birthdays, functions, meetups, lunch, movies, parties
     *   Travel   → trips, vacations
     *   Other    → general / anything that doesn't fit
     */
    TYPES: [
        { id: 'personal', label: 'Personal', icon: '🧘', grad: 'from-green-500 to-emerald-600', chip: 'bg-green-100 text-green-700',   ring: 'ring-green-200',  soft: 'bg-emerald-50 border-emerald-400 text-emerald-800', softSub: 'text-emerald-600' },
        { id: 'health',   label: 'Health',   icon: '💊', grad: 'from-rose-500 to-pink-600',     chip: 'bg-rose-100 text-rose-700',     ring: 'ring-rose-200',   soft: 'bg-rose-50 border-rose-400 text-rose-800',          softSub: 'text-rose-600' },
        { id: 'finance',  label: 'Finance',  icon: '💰', grad: 'from-amber-500 to-orange-600',  chip: 'bg-amber-100 text-amber-700',   ring: 'ring-amber-200',  soft: 'bg-amber-50 border-amber-400 text-amber-800',       softSub: 'text-amber-600' },
        { id: 'social',   label: 'Social',   icon: '🎉', grad: 'from-sky-500 to-blue-600',      chip: 'bg-sky-100 text-sky-700',       ring: 'ring-sky-200',    soft: 'bg-sky-50 border-sky-400 text-sky-800',             softSub: 'text-sky-600' },
        { id: 'travel',   label: 'Travel',   icon: '✈️', grad: 'from-violet-500 to-purple-600', chip: 'bg-violet-100 text-violet-700', ring: 'ring-violet-200', soft: 'bg-violet-50 border-violet-400 text-violet-800',    softSub: 'text-violet-600' },
        { id: 'other',    label: 'Other',    icon: '📌', grad: 'from-slate-500 to-gray-600',    chip: 'bg-slate-100 text-slate-700',   ring: 'ring-slate-200',  soft: 'bg-slate-50 border-slate-400 text-slate-800',       softSub: 'text-slate-600' }
    ],

    // Legacy type ids (pre-taxonomy-cleanup) → their new home. Applied in
    // _normalize so events saved under the old scheme migrate on next write.
    _TYPE_ALIASES: {
        routine: 'personal', grooming: 'personal',
        appointment: 'health',
        meetup: 'social', event: 'social',
        reminder: 'other'
    },

    // Reminder presets shown in the form: minutes before start → label. Selectable
    // in ANY combination (a user can pick "1 day before" AND "30 minutes before"),
    // so this drives a multi-select — there's no explicit "none" (pick nothing).
    // `short` is the compact label shown on the grid chip (keeps every chip the
    // same width for a tidy grid); `label` is the full phrase used in the live
    // summary line and for accessibility.
    REMINDER_OPTIONS: [
        { value: 0,    short: 'At time', label: 'At time' },
        { value: 5,    short: '5 min',   label: '5 min before' },
        { value: 15,   short: '15 min',  label: '15 min before' },
        { value: 30,   short: '30 min',  label: '30 min before' },
        { value: 60,   short: '1 hour',  label: '1 hour before' },
        { value: 120,  short: '2 hours', label: '2 hours before' },
        { value: 1440, short: '1 day',   label: '1 day before' },
        { value: 2880, short: '2 days',  label: '2 days before' },
        { value: 10080, short: '1 week', label: '1 week before' }
    ],

    // "At time" (fire exactly at the event's start) is ALWAYS on — every event
    // gets at least this reminder. The other offsets are optional extras layered
    // on top. Enforced in openForm()/save() and locked in the picker UI.
    MANDATORY_REMINDER: 0,

    /**
     * Ensure the mandatory "At time" (0) offset is present, returning a sorted,
     * de-duped copy. Used everywhere reminder offsets are read/written so the
     * guarantee holds for new events, edits, and legacy events alike.
     */
    _withMandatoryReminder(offsets) {
        const set = new Set(Array.isArray(offsets) ? offsets : []);
        set.add(this.MANDATORY_REMINDER);
        return Array.from(set).sort((a, b) => a - b);
    },

    /**
     * One-time init: seed the current day and (re)schedule reminders.
     * Called from App.init(). Safe if the plugin/DB aren't ready.
     */
    init() {
        if (!this.curDate) this.curDate = this._todayStr();
        // Reschedule reminders in the background; never block startup.
        try {
            this.syncAllNotifications();
        } catch (e) {
            console.warn('Schedule.init notification sync failed:', e);
        }
    },

    // ==================== DATA / CRUD ====================

    getAll() {
        if (!window.DB.scheduleEvents) window.DB.scheduleEvents = [];
        return window.DB.scheduleEvents;
    },

    getById(id) {
        const searchId = String(id);
        return this.getAll().find(e => String(e.id) === searchId);
    },

    /**
     * Create an event.
     * @param {object} data { title, type, date, startTime, endTime, allDay,
     *   location, notes, recurrence, reminder }
     * @returns {object} the created record
     */
    add(data) {
        if (!data || !data.title || !data.date) {
            throw new Error('Please enter a title and date');
        }
        const event = this._normalize(data, {
            id: Utils.generateId(),
            createdAt: Utils.getCurrentTimestamp(),
            notificationIds: []
        });
        this.getAll().push(event);
        window.Storage.save();
        this.syncEventNotifications(event);
        return event;
    },

    /**
     * Update an existing event in place.
     */
    update(id, data) {
        const event = this.getById(id);
        if (!event) throw new Error('Event not found');
        if (!data || !data.title || !data.date) {
            throw new Error('Please enter a title and date');
        }
        // Cancel old reminders before the schedule changes; new ones scheduled below.
        this._cancelNotifications(event);
        Object.assign(event, this._normalize(data, { id: event.id, createdAt: event.createdAt, notificationIds: [] }));
        window.Storage.save();
        this.syncEventNotifications(event);
        return event;
    },

    /**
     * Delete an event and cancel its reminders.
     */
    delete(id) {
        const event = this.getById(id);
        if (event) this._cancelNotifications(event);
        window.DB.scheduleEvents = this.getAll().filter(e => String(e.id) !== String(id));
        window.Storage.save();
    },

    /**
     * Edit a recurring event from a boundary date FORWARD, leaving past
     * occurrences untouched (Google Calendar's "This and following events").
     *
     * Implemented as a series split:
     *   1. The original record is capped with endDate = the day before the first
     *      on-pattern occurrence at/after the boundary — its past occurrences keep
     *      their old values verbatim.
     *   2. A NEW record carries the edited values, anchored at that first
     *      occurrence, and inherits the frequency/interval/daysOfWeek so the
     *      cadence continues unbroken.
     *
     * @param {string|number} id       the recurring event being edited
     * @param {object} data            new form values (same shape as update())
     * @param {string} boundaryStr     'YYYY-MM-DD' from which changes apply
     * @returns {object|null} the new (future) event record, or null if the split
     *          couldn't be anchored (caller should fall back to a plain update)
     */
    updateThisAndFuture(id, data, boundaryStr) {
        const original = this.getById(id);
        if (!original) throw new Error('Event not found');

        // Never let the boundary reach into the past — freeze everything before today.
        const boundary = this._laterDate(boundaryStr, this._todayStr());

        // Anchor the new series on the first REAL occurrence at/after the boundary.
        const anchor = this._firstOccurrenceOnOrAfter(original, boundary);
        if (!anchor) return null; // nothing left in the series to change

        // If the anchor is the very first occurrence, there is no "past" to keep —
        // a plain in-place update is equivalent and avoids an empty leading series.
        // It also honours the user's edits verbatim (including a changed repeat
        // frequency), matching the "All events" path.
        if (anchor === original.date) {
            return this.update(id, data);
        }

        // Capture the series' own hard end (if any) BEFORE we overwrite endDate
        // with the cap below — the forward series must inherit the real end, not
        // the cap.
        const seriesHardEnd = original.recurrence.endDate || null;

        // 1) Cap the original series to end the day before the anchor. Respect any
        //    pre-existing endDate (don't extend a series that already ended earlier).
        const cap = this._shiftDay(anchor, -1);
        const originalEnd = seriesHardEnd ? this._earlierDate(seriesHardEnd, cap) : cap;
        this._cancelNotifications(original);
        original.recurrence = { ...original.recurrence, endDate: originalEnd };
        original.notificationIds = [];

        // 2) Build the new forward series from the edited data, anchored at the
        //    split. It honours the user's chosen frequency (so switching e.g.
        //    daily→weekly from here forward works, like Google Calendar), falling
        //    back to the original cadence only if the form didn't set one. The
        //    original frequency was used only to LOCATE the anchor above.
        const forwardFreq = (data.recurrence && this.isRecurring({ recurrence: data.recurrence }))
            ? data.recurrence.frequency : original.recurrence.frequency;
        const newRec = {
            ...data.recurrence,
            frequency: forwardFreq,
            endDate: seriesHardEnd, // carry the series' own hard end, if any
            exceptions: (data.recurrence && Array.isArray(data.recurrence.exceptions))
                ? data.recurrence.exceptions.filter(ex => ex >= anchor) // drop past exceptions
                : []
        };
        const created = this.add({ ...data, date: anchor, recurrence: newRec });

        // Persist the capped original (add() already saved; this captures the cap
        // + reschedules the original's now-shortened reminder window).
        window.Storage.save();
        this.syncEventNotifications(original);
        return created;
    },

    /**
     * Stop a recurring series from a boundary date FORWARD, keeping past
     * occurrences ("This and following events" for delete). Implemented by
     * capping the series' endDate to the day before the first occurrence
     * at/after the boundary. If that removes the entire series (boundary at/before
     * the first occurrence), the record is deleted outright.
     *
     * @param {string|number} id
     * @param {string} boundaryStr 'YYYY-MM-DD'
     */
    deleteThisAndFuture(id, boundaryStr) {
        const event = this.getById(id);
        if (!event) return;

        const boundary = this._laterDate(boundaryStr, this._todayStr());
        const anchor = this._firstOccurrenceOnOrAfter(event, boundary);

        // The series is cut from the first occurrence at/after the boundary — or,
        // if none remains within the horizon (series already ended, or its next
        // instance is beyond the horizon), from the boundary itself. Either way we
        // must NEVER touch occurrences before the cut: the user's whole point is to
        // keep the past.
        const cutFrom = anchor || boundary;

        // If nothing precedes the cut (the whole series is at/after the boundary),
        // there is no past to keep → remove the record outright.
        if (cutFrom <= event.date) {
            this.delete(id);
            return;
        }

        const cap = this._shiftDay(cutFrom, -1);
        this._cancelNotifications(event);
        event.recurrence = {
            ...event.recurrence,
            endDate: event.recurrence.endDate ? this._earlierDate(event.recurrence.endDate, cap) : cap
        };
        event.notificationIds = [];
        window.Storage.save();
        this.syncEventNotifications(event);
    },

    /**
     * Coerce raw form data into a clean, fully-populated event record.
     * @param {object} data
     * @param {object} base  fields to preserve/assign (id, createdAt, ...)
     */
    _normalize(data, base) {
        const allDay = !!data.allDay;
        // Accept a current type as-is; migrate a known legacy id to its new home;
        // otherwise fall back to the neutral 'other'.
        const rawType = data.type;
        const type = this.TYPES.some(t => t.id === rawType)
            ? rawType
            : (this._TYPE_ALIASES[rawType] || 'other');

        // Recurrence defaults to a one-off.
        const rawRec = data.recurrence || {};
        const frequency = ['none', 'daily', 'weekly', 'monthly', 'yearly'].includes(rawRec.frequency)
            ? rawRec.frequency : 'none';
        const recurrence = {
            frequency,
            interval: Math.max(1, parseInt(rawRec.interval) || 1),
            daysOfWeek: Array.isArray(rawRec.daysOfWeek) ? rawRec.daysOfWeek.slice() : [],
            endDate: rawRec.endDate || null,
            exceptions: Array.isArray(rawRec.exceptions) ? rawRec.exceptions.slice() : []
        };
        // Weekly with no explicit weekdays → anchor on the start date's weekday.
        if (frequency === 'weekly' && recurrence.daysOfWeek.length === 0) {
            recurrence.daysOfWeek = [this._parseDate(data.date).getDay()];
        }

        // Reminders are multi-value: a sorted, de-duped list of "minutes before"
        // offsets. Tolerates both the new array shape and a legacy scalar so old
        // saved events keep working. `enabled` is derived (non-empty ⇒ enabled).
        const reminder = this._normalizeReminder(data.reminder);

        return {
            ...base,
            title: String(data.title).trim(),
            type,
            date: data.date,
            allDay,
            startTime: allDay ? null : (data.startTime || null),
            endTime: allDay ? null : (data.endTime || null),
            location: (data.location || '').trim(),
            notes: (data.notes || '').trim(),
            recurrence,
            reminder
        };
    },

    /**
     * Canonicalize a reminder into { enabled, offsets: number[] } where offsets is
     * a sorted, de-duped list of "minutes before start". Backwards compatible:
     *   - new shape:    { offsets: [30, 1440] }  or  { minutesBefore: [30, 1440] }
     *   - legacy scalar:{ enabled: true, minutesBefore: 30 }  → offsets: [30]
     *   - disabled/empty:                                     → offsets: []
     * `enabled` is always derived from whether any offset survived, so the two
     * fields can never disagree. `minutesBefore` is kept as a mirror of offsets
     * for any older reader still looking at it.
     */
    _normalizeReminder(raw) {
        raw = raw || {};
        let list = [];
        if (Array.isArray(raw.offsets)) list = raw.offsets;
        else if (Array.isArray(raw.minutesBefore)) list = raw.minutesBefore;
        else if (raw.minutesBefore != null && raw.enabled !== false) list = [raw.minutesBefore];

        const offsets = Array.from(new Set(
            list.map(v => parseInt(v, 10)).filter(n => Number.isFinite(n) && n >= 0)
        )).sort((a, b) => a - b);

        return {
            enabled: offsets.length > 0,
            offsets,
            // Mirror for legacy readers: the earliest offset (closest to start).
            minutesBefore: offsets.length ? offsets[0] : 0
        };
    },

    // ==================== RECURRENCE ENGINE ====================

    /**
     * Parse 'YYYY-MM-DD' into a Date at LOCAL midnight (avoids UTC drift that
     * would shift the day for users east/west of GMT).
     */
    _parseDate(str) {
        const [y, m, d] = String(str).split('-').map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
    },

    _todayStr() {
        return Utils.formatLocalDate(new Date());
    },

    /**
     * Whole-day difference between two local-midnight dates.
     */
    _dayDiff(a, b) {
        return Math.round((b.getTime() - a.getTime()) / 86400000);
    },

    /**
     * Does `event` occur on the given 'YYYY-MM-DD' date?
     * Honours frequency, interval, weekly day-of-week set, an optional end date,
     * and an exceptions list. Never occurs before the event's own start date.
     */
    occursOn(event, dateStr) {
        if (!event || !event.date) return false;
        const target = this._parseDate(dateStr);
        const start = this._parseDate(event.date);
        if (target < start) return false;

        const rec = event.recurrence || { frequency: 'none' };

        // Respect an end date and per-date exceptions regardless of frequency.
        if (rec.endDate && target > this._parseDate(rec.endDate)) return false;
        if (Array.isArray(rec.exceptions) && rec.exceptions.includes(dateStr)) return false;

        const interval = Math.max(1, parseInt(rec.interval) || 1);

        switch (rec.frequency) {
            case 'daily': {
                const diff = this._dayDiff(start, target);
                return diff >= 0 && diff % interval === 0;
            }
            case 'weekly': {
                const days = (rec.daysOfWeek && rec.daysOfWeek.length) ? rec.daysOfWeek : [start.getDay()];
                if (!days.includes(target.getDay())) return false;
                if (interval === 1) return true;
                // Compare Sunday-anchored week indices so interval counts whole weeks.
                const startWeek = new Date(start); startWeek.setDate(start.getDate() - start.getDay());
                const targetWeek = new Date(target); targetWeek.setDate(target.getDate() - target.getDay());
                const weeks = Math.round(this._dayDiff(startWeek, targetWeek) / 7);
                return weeks >= 0 && weeks % interval === 0;
            }
            case 'monthly': {
                if (target.getDate() !== start.getDate()) return false;
                const months = (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth());
                return months >= 0 && months % interval === 0;
            }
            case 'yearly': {
                if (target.getMonth() !== start.getMonth() || target.getDate() !== start.getDate()) return false;
                const years = target.getFullYear() - start.getFullYear();
                return years >= 0 && years % interval === 0;
            }
            case 'none':
            default:
                return dateStr === event.date;
        }
    },

    /**
     * Whether an event actually repeats (has a real recurring frequency).
     */
    isRecurring(event) {
        return !!(event && event.recurrence && event.recurrence.frequency &&
                  event.recurrence.frequency !== 'none');
    },

    /** Later of two 'YYYY-MM-DD' strings (lexicographic works for ISO dates). */
    _laterDate(a, b) { return a > b ? a : b; },

    /** Earlier of two 'YYYY-MM-DD' strings. */
    _earlierDate(a, b) { return a < b ? a : b; },

    /**
     * First date ON OR AFTER `fromStr` on which `event` actually occurs.
     * Walks day-by-day up to a bounded horizon so the new (split) series anchors
     * on a real on-pattern occurrence — e.g. a weekly-Monday event splits to the
     * next Monday, not literally "today". Returns null if none within the horizon
     * (e.g. the series' endDate already passed).
     */
    _firstOccurrenceOnOrAfter(event, fromStr, horizonDays = 800) {
        let d = this._parseDate(fromStr);
        for (let i = 0; i <= horizonDays; i++) {
            const ds = Utils.formatLocalDate(d);
            if (this.occursOn(event, ds)) return ds;
            d.setDate(d.getDate() + 1);
        }
        return null;
    },

    /**
     * All events occurring on a date, split and sorted for rendering.
     * @returns {{allDay: object[], timed: object[]}}
     */
    eventsForDate(dateStr) {
        const all = this.getAll().filter(e => this.occursOn(e, dateStr));
        const allDay = all.filter(e => e.allDay || !e.startTime);
        const timed = all
            .filter(e => !e.allDay && e.startTime)
            .sort((a, b) => this._timeToMin(a.startTime) - this._timeToMin(b.startTime));
        return { allDay, timed };
    },

    /**
     * Future occurrence dates ('YYYY-MM-DD') of an event within a horizon — used
     * to schedule reminders. Capped by both a day horizon and a max count.
     *
     * Returns plain date strings, not instants: turning a date + the event's
     * start time into the exact fire instant (including the all-day 09:00 anchor)
     * is Notifications.computeFireTime()'s job, so that logic lives in one tested
     * place rather than being duplicated here.
     */
    getOccurrenceDates(event, horizonDays = 60, maxCount = 30) {
        const out = [];
        const today = new Date(); today.setHours(0, 0, 0, 0);
        for (let i = 0; i <= horizonDays && out.length < maxCount; i++) {
            const d = new Date(today); d.setDate(today.getDate() + i);
            const ds = Utils.formatLocalDate(d);
            if (this.occursOn(event, ds)) out.push(ds);
        }
        return out;
    },

    // ==================== TIME HELPERS ====================

    _timeToMin(hhmm) {
        if (!hhmm) return 0;
        const [h, m] = String(hhmm).split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    },

    /** 24h 'HH:MM' → friendly '9:05 AM'. */
    _fmtTime(hhmm) {
        const min = this._timeToMin(hhmm);
        let h = Math.floor(min / 60);
        const m = min % 60;
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12; if (h === 0) h = 12;
        return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
    },

    _typeConfig(typeId) {
        // Resolve legacy type ids to their new home so events saved under the old
        // taxonomy render with the right color/icon even before they're re-saved.
        const resolved = this.TYPES.some(t => t.id === typeId) ? typeId : (this._TYPE_ALIASES[typeId] || 'other');
        return this.TYPES.find(t => t.id === resolved) || this.TYPES[5]; // default: other
    },

    // ==================== DAY NAVIGATION ====================

    _shiftDay(dateStr, delta) {
        const d = this._parseDate(dateStr);
        d.setDate(d.getDate() + delta);
        return Utils.formatLocalDate(d);
    },

    /**
     * Shift a date by whole months, clamping the day to the target month's length
     * (e.g. Jan 31 + 1 month → Feb 28/29, not an overflow into March).
     */
    _shiftMonth(dateStr, delta) {
        const d = this._parseDate(dateStr);
        const targetDay = d.getDate();
        d.setDate(1);
        d.setMonth(d.getMonth() + delta);
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(targetDay, lastDay));
        return Utils.formatLocalDate(d);
    },

    prevDay() { this.curDate = this._shiftDay(this.curDate, -1); this.render(); },
    nextDay() { this.curDate = this._shiftDay(this.curDate, 1); this.render(); },
    prevWeek() { this.curDate = this._shiftDay(this.curDate, -7); this.render(); },
    nextWeek() { this.curDate = this._shiftDay(this.curDate, 7); this.render(); },
    prevMonth() { this.curDate = this._shiftMonth(this.curDate, -1); this.render(); },
    nextMonth() { this.curDate = this._shiftMonth(this.curDate, 1); this.render(); },
    goToday() { this._pickerOpen = false; this.curDate = this._todayStr(); this.render(); },
    selectDay(dateStr) { this.curDate = dateStr; this.render(); },

    /** Toggle the month/year quick-jump picker open/closed and re-render. */
    toggleMonthPicker() { this._pickerOpen = !this._pickerOpen; this.render(); },

    /** Step the picker's displayed year without leaving it open. */
    pickerYear(delta) {
        this.curDate = this._shiftMonth(this.curDate, delta * 12);
        this.render();
    },

    /**
     * Jump to a specific month (0-indexed) in the currently-viewed year, keeping
     * the picker's context, then collapse it so the week strip returns.
     */
    goToMonth(monthIndex) {
        const d = this._parseDate(this.curDate);
        const targetDay = d.getDate();
        const target = new Date(d.getFullYear(), monthIndex, 1);
        const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
        target.setDate(Math.min(targetDay, lastDay));
        this.curDate = Utils.formatLocalDate(target);
        this._pickerOpen = false;
        this.render();
    },

    // ==================== RENDER ====================

    render() {
        const container = document.getElementById('schedule-content');
        if (!container) return;
        if (!this.curDate) this.curDate = this._todayStr();

        const { allDay, timed } = this.eventsForDate(this.curDate);

        // Bottom-anchored layout (top → bottom):
        //   1. calendar space  — all-day row + hourly timeline grid (flex-1, scrolls),
        //                         with the + button floating at its bottom-right
        //   2. date strip       — horizontal, scrollable month of days
        //   3. month button     — opens the month/year quick-jump picker
        // When the picker is open it replaces the calendar space + date strip with
        // the focused "jump anywhere" surface, month button still at the bottom.
        container.innerHTML = this._pickerOpen
            ? `
                ${this._renderMonthPicker()}
                ${this._renderMonthButton()}
            `
            : `
                ${this._renderCalendarSpace(allDay, timed)}
                ${this._renderDateStrip()}
                ${this._renderMonthButton()}
            `;

        if (this._pickerOpen) return; // no timeline / date strip to position in picker mode

        // Center the selected day in the horizontal date strip (smoothly if this
        // render was triggered by a navigation, instantly on first paint).
        this._scrollDateStripToSelected();

        // Auto-scroll the timeline to "now" (today) or the first event / 7 AM.
        const scroller = container.querySelector('.schedule-timeline-scroll');
        if (scroller) {
            let anchorMin;
            if (this.curDate === this._todayStr()) {
                const now = new Date();
                anchorMin = now.getHours() * 60 + now.getMinutes();
            } else if (timed.length) {
                anchorMin = this._timeToMin(timed[0].startTime);
            } else {
                anchorMin = 7 * 60;
            }
            scroller.scrollTop = Math.max(0, (anchorMin / 60) * this.HOUR_PX - 90);
        }
    },

    /**
     * Center the selected day chip within the horizontal date strip. render()
     * rebuilds the strip each time (scrollLeft resets to 0), so we position it
     * INSTANTLY here — the smooth animation is reserved for the ‹ › nav buttons
     * (scrollDateStrip). The strip's CSS sets `scroll-behavior: smooth`, which
     * also animates a plain scrollLeft assignment, so we briefly force `auto`.
     */
    _scrollDateStripToSelected() {
        const strip = document.querySelector('.schedule-date-strip');
        if (!strip) return;
        const sel = strip.querySelector('[data-selected="true"]');
        if (!sel) return;
        const target = sel.offsetLeft - (strip.clientWidth / 2) + (sel.offsetWidth / 2);
        const prev = strip.style.scrollBehavior;
        strip.style.scrollBehavior = 'auto';
        strip.scrollLeft = Math.max(0, target);
        strip.style.scrollBehavior = prev;
    },

    _monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    _monthAbbr: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],

    /**
     * The calendar space (top of the layout): the all-day chip row + the hourly
     * timeline grid, which scrolls. The floating "+" button lives at this space's
     * bottom-right so it hovers just ABOVE the date strip with no overlap.
     */
    _renderCalendarSpace(allDayEvents, timedEvents) {
        return `
            <div class="relative flex flex-col flex-1 min-h-0">
                ${this._renderAllDayRow(allDayEvents)}
                ${this._renderDayGrid(timedEvents)}
                <button onclick="Schedule.openForm()"
                        class="absolute right-3 bottom-3 z-30 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg hover:shadow-xl transition-all hover:scale-110"
                        title="Add Event" aria-label="Add Event">
                    <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
                    </svg>
                </button>
            </div>`;
    },

    /**
     * Bottom "month button": shows "Month Year" and opens the month/year
     * quick-jump picker. A "Today" pill sits alongside when not already on today.
     * This is the lowest row of the schedule layout.
     */
    _renderMonthButton() {
        const cur = this._parseDate(this.curDate);
        const headline = `${this._monthNames[cur.getMonth()]} ${cur.getFullYear()}`;
        const isToday = this.curDate === this._todayStr();
        const caret = this._pickerOpen
            ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>'
            : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>';

        // Full-bleed bottom bar, styled after the Expenses page's fixed search
        // bar: a tinted strip (#F5FEFD) with a top border and safe-area padding,
        // holding a wide primary (month button, flex-1) + a compact secondary
        // (Today). `-mx-3` bleeds past the container's px-3; inner px-3 re-pads.
        return `
            <div class="-mx-3 mt-3 px-3 pt-3 border-t border-gray-300 flex-shrink-0"
                 style="background-color: #F5FEFD; padding-bottom: max(0.75rem, env(safe-area-inset-bottom));">
                <div class="flex gap-2">
                    <button onclick="Schedule.toggleMonthPicker()"
                            class="flex-1 flex items-center justify-center gap-1.5 p-3 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-sm hover:shadow-md transition-all"
                            aria-label="Jump to month or year" aria-expanded="${this._pickerOpen ? 'true' : 'false'}">
                        <svg class="w-4 h-4 text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        <span class="text-sm font-bold tracking-tight">${headline}</span>
                        <svg class="w-4 h-4 text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">${caret}</svg>
                    </button>
                    ${isToday ? '' : `
                    <button onclick="Schedule.goToday()" class="flex-shrink-0 px-4 py-3 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-800 text-sm font-semibold border-2 border-violet-300 transition-all duration-200" aria-label="Jump to today">Today</button>`}
                </div>
            </div>`;
    },

    /**
     * Horizontal, scrollable strip of every day in the current month. Flanked by
     * ‹ › chevrons that smooth-scroll the strip. Tapping a day selects it (and the
     * strip smooth-centers it on the next render). The event dot marks days that
     * carry events.
     */
    _renderDateStrip() {
        const cur = this._parseDate(this.curDate);
        const todayStr = this._todayStr();
        const year = cur.getFullYear();
        const month = cur.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

        let cells = '';
        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(year, month, day);
            const ds = Utils.formatLocalDate(d);
            const isSel = ds === this.curDate;
            const isToday = ds === todayStr;
            const hasEvents = this.getAll().some(e => this.occursOn(e, ds));

            const base = 'flex flex-col items-center justify-center rounded-xl w-11 flex-shrink-0 py-1.5 transition-all snap-center';
            const cls = isSel
                ? `${base} bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-md`
                : `${base} text-gray-600 hover:bg-violet-50`;
            const dotColor = isSel ? 'bg-white/90' : 'bg-violet-500';

            cells += `
                <button onclick="Schedule.selectDay('${ds}')" data-selected="${isSel}" class="${cls}" aria-label="Select ${ds}" aria-pressed="${isSel}">
                    <span class="text-[10px] font-medium ${isSel ? 'text-white/80' : 'text-gray-400'}">${dayLetters[d.getDay()]}</span>
                    <span class="text-sm font-bold ${isToday && !isSel ? 'text-fuchsia-600' : ''}">${day}</span>
                    <span class="mt-0.5 h-1 w-1 rounded-full ${hasEvents ? dotColor : 'bg-transparent'}"></span>
                </button>`;
        }

        return `
            <div class="flex items-center gap-1 mt-2 flex-shrink-0">
                <button onclick="Schedule.scrollDateStrip(-1)" class="w-7 h-9 rounded-lg hover:bg-violet-100 flex items-center justify-center text-gray-500 flex-shrink-0" aria-label="Scroll dates left">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <div class="schedule-date-strip flex gap-1 overflow-x-auto snap-x flex-1">${cells}</div>
                <button onclick="Schedule.scrollDateStrip(1)" class="w-7 h-9 rounded-lg hover:bg-violet-100 flex items-center justify-center text-gray-500 flex-shrink-0" aria-label="Scroll dates right">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
            </div>`;
    },

    /**
     * Smooth-scroll the horizontal date strip by roughly a week in the given
     * direction (-1 left / +1 right). When already at an edge, roll into the
     * adjacent month so the user can keep surfing days without opening the picker.
     */
    scrollDateStrip(dir) {
        const strip = document.querySelector('.schedule-date-strip');
        if (!strip) return;
        const atStart = strip.scrollLeft <= 1;
        const atEnd = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;

        // At an edge → jump to the adjacent month (re-render lands the selection).
        if (dir < 0 && atStart) { this.prevMonth(); return; }
        if (dir > 0 && atEnd) { this.nextMonth(); return; }

        // Otherwise smooth-scroll ~5 day-chips (chip ≈ 44px + 4px gap).
        strip.scrollBy({ left: dir * 5 * 48, behavior: 'smooth' });
    },

    /**
     * Quick-jump picker: a year stepper over a 3×4 grid of months. Fills the
     * calendar space while open so the user can leap across years/months in two
     * taps, then drops back to the day view on selection. The bottom month button
     * (caret flipped) closes it, so there's no separate "Done" here.
     */
    _renderMonthPicker() {
        const cur = this._parseDate(this.curDate);
        const year = cur.getFullYear();
        const today = new Date();
        const curMonth = cur.getMonth();

        const cells = this._monthAbbr.map((abbr, i) => {
            const isSel = i === curMonth;
            const isCurMonth = i === today.getMonth() && year === today.getFullYear();
            const base = 'py-4 rounded-xl text-sm font-semibold transition-all';
            const cls = isSel
                ? `${base} bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-md`
                : `${base} bg-violet-50 text-gray-700 hover:bg-violet-100 ${isCurMonth ? 'ring-2 ring-fuchsia-400' : ''}`;
            return `<button onclick="Schedule.goToMonth(${i})" class="${cls}" aria-label="${this._monthNames[i]} ${year}" aria-pressed="${isSel}">${abbr}</button>`;
        }).join('');

        return `
            <div class="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col flex-1 min-h-0 overflow-y-auto">
                <div class="flex items-center justify-between mb-4">
                    <button onclick="Schedule.pickerYear(-1)" class="w-9 h-9 rounded-full hover:bg-violet-100 flex items-center justify-center text-gray-600" aria-label="Previous year">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                    </button>
                    <span class="text-xl font-bold text-gray-800">${year}</span>
                    <button onclick="Schedule.pickerYear(1)" class="w-9 h-9 rounded-full hover:bg-violet-100 flex items-center justify-center text-gray-600" aria-label="Next year">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                    </button>
                </div>
                <div class="grid grid-cols-3 gap-2.5">${cells}</div>
            </div>`;
    },

    /**
     * Chips row for all-day / untimed events (shown above the hourly grid).
     */
    _renderAllDayRow(allDayEvents) {
        if (!allDayEvents.length) return '';
        const chips = allDayEvents.map(e => {
            const t = this._typeConfig(e.type);
            return `
                <button onclick="Schedule.openForm('${Utils.escapeJsAttr(String(e.id))}')" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border-l-4 border ${t.soft} text-xs font-semibold shadow-sm max-w-full">
                    <span>${t.icon}</span>
                    <span class="truncate">${Utils.escapeHtml(e.title)}</span>
                    ${e.recurrence && e.recurrence.frequency !== 'none' ? `<span class="opacity-70 ${t.softSub}">🔁</span>` : ''}
                </button>`;
        }).join('');
        return `
            <div class="mb-2">
                <div class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 px-1">All-day</div>
                <div class="flex flex-wrap gap-1.5">${chips}</div>
            </div>`;
    },

    /**
     * The hourly grid: 24 hour rows, a live now-line (today only), and timed
     * event blocks positioned absolutely with side-by-side overlap layout.
     */
    _renderDayGrid(timedEvents) {
        const HOUR_PX = this.HOUR_PX;
        const gridHeight = HOUR_PX * 24;
        const LABEL_W = 52; // px reserved for the hour labels gutter

        // Hour lines + labels.
        let hourLines = '';
        for (let h = 0; h < 24; h++) {
            const top = h * HOUR_PX;
            let label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
            hourLines += `
                <div class="absolute left-0 right-0 border-t border-gray-100" style="top:${top}px;"></div>
                <div class="absolute left-0 text-[10px] text-gray-400 -translate-y-1/2" style="top:${top}px; width:${LABEL_W - 8}px; text-align:right;">${top === 0 ? '' : label}</div>
                <button onclick="Schedule.openFormAt(${h})" class="absolute cursor-pointer" style="top:${top}px; left:${LABEL_W}px; right:0; height:${HOUR_PX}px;" aria-label="Add event at ${label}"></button>`;
        }

        // Event blocks with overlap columns.
        const laid = this._layoutColumns(timedEvents);
        let blocks = '';
        laid.forEach(item => {
            const e = item.event;
            const t = this._typeConfig(e.type);
            const startMin = this._timeToMin(e.startTime);
            const endMin = e.endTime ? Math.max(this._timeToMin(e.endTime), startMin + 20) : startMin + 30;
            const top = (startMin / 60) * HOUR_PX;
            const height = Math.max(22, ((endMin - startMin) / 60) * HOUR_PX - 2);

            const gutter = LABEL_W + 2;
            const colWidthPct = 100 / item.cols;
            const leftCalc = `calc(${gutter}px + (100% - ${gutter}px) * ${item.col * colWidthPct / 100})`;
            const widthCalc = `calc((100% - ${gutter}px) * ${colWidthPct / 100} - 3px)`;
            const compact = height < 40;

            blocks += `
                <button onclick="Schedule.openForm('${Utils.escapeJsAttr(String(e.id))}')"
                    class="absolute text-left rounded-lg border-l-4 border ${t.soft} px-2 py-1 shadow-sm overflow-hidden active:scale-[0.99] transition-transform"
                    style="top:${top}px; height:${height}px; left:${leftCalc}; width:${widthCalc};"
                    aria-label="${Utils.escapeHtml(e.title)} at ${this._fmtTime(e.startTime)}">
                    <div class="flex items-center gap-1 ${compact ? '' : 'mb-0.5'}">
                        <span class="text-[11px] leading-none">${t.icon}</span>
                        <span class="text-[11px] font-bold truncate leading-tight">${Utils.escapeHtml(e.title)}</span>
                        ${e.recurrence && e.recurrence.frequency !== 'none' ? `<span class="text-[9px] opacity-70 ${t.softSub}">🔁</span>` : ''}
                    </div>
                    ${compact ? '' : `<div class="text-[9px] ${t.softSub} leading-tight">${this._fmtTime(e.startTime)}${e.endTime ? '–' + this._fmtTime(e.endTime) : ''}${e.location ? ' · ' + Utils.escapeHtml(e.location) : ''}</div>`}
                </button>`;
        });

        // Now-line (only meaningful when viewing today).
        let nowLine = '';
        if (this.curDate === this._todayStr()) {
            const now = new Date();
            const nowMin = now.getHours() * 60 + now.getMinutes();
            const top = (nowMin / 60) * HOUR_PX;
            nowLine = `
                <div class="absolute z-10 pointer-events-none" style="top:${top}px; left:${LABEL_W - 6}px; right:0;">
                    <div class="relative">
                        <div class="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-red-500"></div>
                        <div class="border-t-2 border-red-500"></div>
                    </div>
                </div>`;
        }

        const emptyHint = '';

        // flex-1 + min-h-0 makes this grid absorb exactly the leftover height in
        // the schedule-view flex column and scroll ITSELF — the page doesn't
        // scroll (fixes the "empty page still scrolls" bug). pb keeps the last
        // hour clear of the floating + button.
        return `
            <div class="schedule-timeline-scroll bg-white rounded-2xl border border-gray-100 shadow-sm overflow-y-auto flex-1 min-h-0" style="min-height: 200px;">
                <div class="relative" style="height:${gridHeight}px;">
                    ${hourLines}
                    ${emptyHint}
                    ${blocks}
                    ${nowLine}
                </div>
            </div>`;
    },

    /**
     * Greedy interval-graph column assignment for overlapping events.
     * Splits events into transitively-overlapping clusters, then within each
     * cluster packs events into the fewest columns. Every event gets {col, cols}
     * where cols is the cluster's column count (so widths match across a cluster).
     * @returns {{event, col, cols}[]}
     */
    _layoutColumns(events) {
        const items = events.map(e => ({
            event: e,
            start: this._timeToMin(e.startTime),
            end: e.endTime ? Math.max(this._timeToMin(e.endTime), this._timeToMin(e.startTime) + 20) : this._timeToMin(e.startTime) + 30
        })).sort((a, b) => a.start - b.start || a.end - b.end);

        const result = [];
        let cluster = [];
        let clusterEnd = -1;

        const flush = () => {
            if (!cluster.length) return;
            const columns = []; // columns[i] = end-min of last event placed in column i
            cluster.forEach(it => {
                let placed = false;
                for (let c = 0; c < columns.length; c++) {
                    if (it.start >= columns[c]) { columns[c] = it.end; it.col = c; placed = true; break; }
                }
                if (!placed) { it.col = columns.length; columns.push(it.end); }
            });
            const cols = columns.length;
            cluster.forEach(it => result.push({ event: it.event, col: it.col, cols }));
            cluster = [];
            clusterEnd = -1;
        };

        items.forEach(it => {
            if (cluster.length && it.start >= clusterEnd) flush();
            cluster.push(it);
            clusterEnd = Math.max(clusterEnd, it.end);
        });
        flush();

        return result;
    },

    // ==================== MODAL (ADD / EDIT) ====================

    /**
     * Open the add/edit modal. Pass an id to edit; omit to add on curDate.
     * @param {string|number|null} id
     * @param {string|null} presetTime 'HH:MM' to preselect a start time
     */
    openForm(id = null, presetTime = null) {
        const editing = id != null;
        const ev = editing ? this.getById(id) : null;
        if (editing && !ev) { Utils.showError('Event not found'); return; }

        const date = ev ? ev.date : this.curDate;
        // Migrate a legacy type id to its current home so the dropdown shows a real
        // selection instead of falling through to the default.
        const rawType = ev ? ev.type : 'personal';
        const type = this.TYPES.some(t => t.id === rawType) ? rawType : (this._TYPE_ALIASES[rawType] || 'other');
        const allDay = ev ? ev.allDay : false;
        const startTime = ev ? (ev.startTime || '09:00') : (presetTime || '09:00');
        const endTime = ev ? (ev.endTime || '') : this._addMinutesToTime(startTime, 30);
        // Reminder offsets currently set on the event. "At time" (0) is mandatory
        // — every event always fires a reminder at its start time; the other
        // offsets are opt-in extras. So we force 0 into the set for both new and
        // existing events (older events saved without it get it on next edit).
        const selectedOffsets = this._withMandatoryReminder(
            ev ? this._normalizeReminder(ev.reminder).offsets : []
        );
        const freq = ev && ev.recurrence ? ev.recurrence.frequency : 'none';

        const typeOpts = this.TYPES.map(t =>
            `<option value="${t.id}" ${t.id === type ? 'selected' : ''}>${t.icon}  ${t.label}</option>`
        ).join('');

        // Multi-select reminder grid — any combination can be picked. A tap toggles
        // the offset in a hidden CSV field via _toggleReminder(). Rendered by a
        // shared helper so the initial paint and per-tap restyle never drift.
        const reminderGrid = this._renderReminderGrid(selectedOffsets);
        const reminderSummary = this._reminderSummaryText(selectedOffsets);

        const freqOpts = [
            ['none', 'Does not repeat'], ['daily', 'Daily'], ['weekly', 'Weekly'],
            ['monthly', 'Monthly'], ['yearly', 'Yearly']
        ].map(([v, l]) => `<option value="${v}" ${v === freq ? 'selected' : ''}>${l}</option>`).join('');

        const grad = 'from-violet-600 to-fuchsia-600';
        const modalHtml = `
            <div id="schedule-modal" class="fixed inset-0 bg-black bg-opacity-70 z-[10000] flex items-center justify-center p-4" onclick="if(event.target===this) Schedule.closeForm()">
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col" onclick="event.stopPropagation()">
                    <div class="sticky top-0 bg-gradient-to-r ${grad} px-5 py-4 flex justify-between items-center rounded-t-2xl">
                        <h2 class="text-lg font-bold text-white">${editing ? 'Edit Event' : 'New Event'}</h2>
                        <button onclick="Schedule.closeForm()" class="text-white/90 hover:text-white p-1" aria-label="Close">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>
                    <div class="p-5 space-y-4 overflow-y-auto">
                        <input type="hidden" id="schedule-ev-id" value="${editing ? Utils.escapeHtml(String(id)) : ''}">
                        <!-- Reminder offsets as a CSV of minutes-before; toggled by the chips below. -->
                        <input type="hidden" id="schedule-ev-remind" value="${selectedOffsets.join(',')}">

                        <div>
                            <input type="text" id="schedule-ev-title" value="${ev ? Utils.escapeHtml(ev.title) : ''}" placeholder="Title (e.g. Flu Vaccine) *"
                                   class="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-medium">
                        </div>

                        <div>
                            <label class="block text-xs font-semibold text-gray-500 mb-1">📝 Notes</label>
                            <textarea id="schedule-ev-notes" rows="2" placeholder="Optional"
                                      class="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500">${ev ? Utils.escapeHtml(ev.notes || '') : ''}</textarea>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold text-gray-500 mb-1">Type</label>
                            <select id="schedule-ev-type" class="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white">${typeOpts}</select>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold text-gray-500 mb-1">Date</label>
                            <input type="date" id="schedule-ev-date" value="${Utils.escapeHtml(date)}"
                                   class="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500">
                        </div>

                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" id="schedule-ev-allday" ${allDay ? 'checked' : ''} onchange="Schedule._toggleAllDay()" class="w-4 h-4 accent-violet-600">
                            <span class="text-sm font-medium text-gray-700">All-day</span>
                        </label>

                        <div id="schedule-time-row" class="grid grid-cols-2 gap-3 ${allDay ? 'hidden' : ''}">
                            <div>
                                <label class="block text-xs font-semibold text-gray-500 mb-1">Start</label>
                                <input type="time" id="schedule-ev-start" value="${Utils.escapeHtml(startTime)}"
                                       class="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500">
                            </div>
                            <div>
                                <label class="block text-xs font-semibold text-gray-500 mb-1">End</label>
                                <input type="time" id="schedule-ev-end" value="${Utils.escapeHtml(endTime)}"
                                       class="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500">
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold text-gray-500 mb-1">🔁 Repeat</label>
                            <select id="schedule-ev-repeat" class="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white">${freqOpts}</select>
                        </div>

                        <div class="rounded-xl border border-gray-200 p-3">
                            <div class="flex items-center justify-between mb-2">
                                <label class="text-xs font-semibold text-gray-500 flex items-center gap-1">🔔 Reminders</label>
                                <span id="schedule-remind-summary" class="text-[11px] font-semibold text-violet-600 text-right truncate max-w-[60%]">${reminderSummary}</span>
                            </div>
                            <p class="text-[10px] text-gray-400 mb-2 -mt-1">Always alerts at the start time. Add earlier nudges below.</p>
                            <div id="schedule-remind-grid" class="grid grid-cols-3 gap-1.5">${reminderGrid}</div>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold text-gray-500 mb-1">📍 Location</label>
                            <input type="text" id="schedule-ev-location" value="${ev ? Utils.escapeHtml(ev.location || '') : ''}" placeholder="Optional"
                                   class="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500">
                        </div>
                    </div>

                    <div class="p-4 border-t border-gray-100 flex gap-2">
                        ${editing ? `<button onclick="Schedule._deleteFromForm('${Utils.escapeJsAttr(String(id))}')" class="px-3 py-2.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-semibold text-sm" aria-label="Delete event">Delete</button>` : ''}
                        <button onclick="Schedule.save()" class="flex-1 px-4 py-2.5 bg-gradient-to-r ${grad} text-white rounded-lg hover:shadow-lg font-semibold">Save Event</button>
                        <button onclick="Schedule.closeForm()" class="px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold">Cancel</button>
                    </div>
                </div>
            </div>`;

        const existing = document.getElementById('schedule-modal');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    /**
     * Open the add form with a start time preset to the tapped hour.
     */
    openFormAt(hour) {
        const hh = String(Math.max(0, Math.min(23, hour))).padStart(2, '0');
        this.openForm(null, `${hh}:00`);
    },

    /**
     * Build the multi-select reminder grid markup for a set of selected offsets.
     * Every chip is the same size (uniform 3-column grid) and shows a checkmark
     * when on, so the selected state reads at a glance. Shared by openForm()'s
     * initial paint and _toggleReminder()'s re-render so they can't drift.
     */
    _renderReminderGrid(selectedOffsets) {
        const sel = new Set(selectedOffsets);
        const checkIcon = '<svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>';
        const lockIcon = '<svg class="w-2.5 h-2.5 flex-shrink-0 opacity-80" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/></svg>';

        return this.REMINDER_OPTIONS.map(o => {
            const on = sel.has(o.value);
            const mandatory = o.value === this.MANDATORY_REMINDER;

            // The mandatory "At time" chip is always on and can't be turned off —
            // render it locked (no onclick, a padlock instead of a checkmark) so the
            // user understands it's guaranteed rather than a normal toggle.
            if (mandatory) {
                return `<button type="button" data-offset="${o.value}" disabled
                            aria-pressed="true" aria-label="${o.label} (always on)" title="Always on"
                            class="schedule-remind-chip flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-xs font-semibold border-2 bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white border-transparent shadow-sm cursor-default">
                            ${lockIcon}<span>${o.short}</span>
                        </button>`;
            }

            const cls = on
                ? 'bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white border-transparent shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300 hover:bg-violet-50';
            return `<button type="button" data-offset="${o.value}" onclick="Schedule._toggleReminder(${o.value})"
                        aria-pressed="${on}" aria-label="${o.label}"
                        class="schedule-remind-chip flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${cls}">
                        ${on ? checkIcon : ''}<span>${o.short}</span>
                    </button>`;
        }).join('');
    },

    /**
     * Human summary of the selected reminders for the header line, e.g.
     * "At time · 30 min before · 1 day before". "At time" is always present since
     * it's mandatory, so there's no empty state.
     */
    _reminderSummaryText(selectedOffsets) {
        const offsets = this._withMandatoryReminder(selectedOffsets);
        const byValue = new Map(this.REMINDER_OPTIONS.map(o => [o.value, o.label]));
        return offsets
            .map(v => byValue.get(v) || `${v} min before`)
            .join(' · ');
    },

    /**
     * Toggle one reminder offset on/off. Reminders are multi-select, so this flips
     * the given offset in the hidden CSV field, then re-renders the grid + summary
     * from that single source of truth (idempotent; order doesn't matter — save()
     * re-sorts via _normalize). The mandatory "At time" (0) offset can't be
     * toggled off — a tap on it is a no-op.
     */
    _toggleReminder(offset) {
        if (offset === this.MANDATORY_REMINDER) return; // always on
        const hidden = document.getElementById('schedule-ev-remind');
        if (!hidden) return;
        const set = new Set(this._parseOffsets(hidden.value));
        if (set.has(offset)) set.delete(offset); else set.add(offset);
        set.add(this.MANDATORY_REMINDER); // keep the guarantee in the hidden field
        const sorted = Array.from(set).sort((a, b) => a - b);
        hidden.value = sorted.join(',');

        // Re-render the whole grid + summary so styles and the summary line stay
        // in lockstep with the hidden field.
        const grid = document.getElementById('schedule-remind-grid');
        if (grid) grid.innerHTML = this._renderReminderGrid(sorted);
        const summary = document.getElementById('schedule-remind-summary');
        if (summary) summary.textContent = this._reminderSummaryText(sorted);
    },

    /** Parse a CSV of minute offsets into a clean number[] (drops junk). */
    _parseOffsets(csv) {
        return String(csv || '')
            .split(',')
            .map(s => parseInt(s.trim(), 10))
            .filter(n => Number.isFinite(n) && n >= 0);
    },

    _toggleAllDay() {
        const checked = document.getElementById('schedule-ev-allday').checked;
        const row = document.getElementById('schedule-time-row');
        if (row) row.classList.toggle('hidden', checked);
    },

    _addMinutesToTime(hhmm, mins) {
        const total = this._timeToMin(hhmm) + mins;
        const h = Math.floor(total / 60) % 24;
        const m = total % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },

    closeForm() {
        const modal = document.getElementById('schedule-modal');
        if (modal) modal.remove();
    },

    /**
     * Ask how a change to a recurring event should apply. Resolves to:
     *   'future' → this occurrence and all following
     *   'all'    → the entire series (past included)
     *   null     → cancelled
     * @param {'edit'|'delete'} action  tunes the wording
     * @returns {Promise<'future'|'all'|null>}
     */
    _promptRecurringScope(action = 'edit') {
        // Guard against an overlapping prompt (e.g. a stray double-tap): settle any
        // in-flight resolver as cancelled before opening a fresh one, so its awaiting
        // caller unwinds cleanly instead of hanging forever on an orphaned slot.
        if (this._scopeResolve) { try { this._scopeResolve(null); } catch (e) { /* ignore */ } }

        return new Promise(resolve => {
            const isDelete = action === 'delete';
            const grad = 'from-violet-600 to-fuchsia-600';
            const futureDesc = isDelete ? 'Keeps past events; stops the series from today.' : 'Past events stay unchanged; updates today onward.';
            const allDesc = isDelete ? 'Removes every occurrence, past included.' : 'Updates every occurrence, past included.';

            const finish = (val) => {
                const m = document.getElementById('schedule-scope-modal');
                if (m) m.remove();
                // Clear the shared slot so the next prompt's re-entrancy guard only
                // trips on a genuinely in-flight resolver (and a stray second click
                // on this already-settled prompt is a harmless no-op).
                if (this._scopeResolve === finish) this._scopeResolve = null;
                resolve(val);
            };
            // Expose a one-shot handler the inline onclick can call, then clean up.
            this._scopeResolve = finish;

            const html = `
                <div id="schedule-scope-modal" class="fixed inset-0 bg-black bg-opacity-70 z-[10001] flex items-center justify-center p-4"
                     onclick="if(event.target===this) Schedule._scopeResolve(null)">
                    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onclick="event.stopPropagation()">
                        <div class="bg-gradient-to-r ${grad} px-5 py-4">
                            <h2 class="text-lg font-bold text-white">${isDelete ? 'Delete recurring event' : 'Edit recurring event'}</h2>
                            <p class="text-white/80 text-xs mt-0.5">This is a repeating event. What do you want to change?</p>
                        </div>
                        <div class="p-4 space-y-2">
                            <button onclick="Schedule._scopeResolve('future')"
                                    class="w-full text-left p-3 rounded-xl border-2 border-violet-200 hover:border-violet-500 hover:bg-violet-50 transition-all">
                                <div class="font-bold text-sm text-gray-800">This &amp; following events</div>
                                <div class="text-[11px] text-gray-500 mt-0.5">${futureDesc}</div>
                            </button>
                            <button onclick="Schedule._scopeResolve('all')"
                                    class="w-full text-left p-3 rounded-xl border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all">
                                <div class="font-bold text-sm text-gray-800">All events</div>
                                <div class="text-[11px] text-gray-500 mt-0.5">${allDesc}</div>
                            </button>
                        </div>
                        <div class="px-4 pb-4">
                            <button onclick="Schedule._scopeResolve(null)"
                                    class="w-full px-4 py-2.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 font-semibold text-sm">Cancel</button>
                        </div>
                    </div>
                </div>`;

            const existing = document.getElementById('schedule-scope-modal');
            if (existing) existing.remove();
            document.body.insertAdjacentHTML('beforeend', html);
        });
    },

    /**
     * Read the form, validate, and add/update the event.
     */
    async save() {
        const id = document.getElementById('schedule-ev-id').value;
        const title = document.getElementById('schedule-ev-title').value.trim();
        const type = document.getElementById('schedule-ev-type').value;
        const date = document.getElementById('schedule-ev-date').value;
        const allDay = document.getElementById('schedule-ev-allday').checked;
        const startTime = document.getElementById('schedule-ev-start').value;
        let endTime = document.getElementById('schedule-ev-end').value;
        const repeat = document.getElementById('schedule-ev-repeat').value;
        // "At time" (0) is always on — enforce it regardless of the hidden field.
        const reminderOffsets = this._withMandatoryReminder(
            this._parseOffsets(document.getElementById('schedule-ev-remind').value)
        );
        const location = document.getElementById('schedule-ev-location').value.trim();
        const notes = document.getElementById('schedule-ev-notes').value.trim();

        if (!title) { Utils.showError('⚠️ Please enter a title'); return; }
        if (!date) { Utils.showError('⚠️ Please choose a date'); return; }
        if (!allDay && !startTime) { Utils.showError('⚠️ Please set a start time (or mark all-day)'); return; }

        // If end precedes start, drop it (treat as a point-in-time event).
        if (!allDay && endTime && this._timeToMin(endTime) <= this._timeToMin(startTime)) {
            endTime = '';
        }

        // The form only exposes `frequency`. Preserve the rich recurrence fields
        // it can't edit (interval, endDate, exceptions, and multi-day weekly sets)
        // so that editing an event doesn't silently reset them — without this, a
        // "Mon + Thu" weekly or an every-2-weeks event would collapse on any save.
        // A single-day (auto-derived) weekly set is intentionally NOT preserved so
        // _normalize can re-anchor it if the start date changed. New events pass
        // empty and let _normalize fill defaults.
        const prior = id ? this.getById(id) : null;
        const priorRec = (prior && prior.recurrence) ? prior.recurrence : {};
        const recurrence = {
            frequency: repeat,
            interval: priorRec.interval || 1,
            daysOfWeek: (Array.isArray(priorRec.daysOfWeek) && priorRec.daysOfWeek.length >= 2) ? priorRec.daysOfWeek.slice() : [],
            endDate: priorRec.endDate || null,
            exceptions: Array.isArray(priorRec.exceptions) ? priorRec.exceptions.slice() : []
        };

        const data = {
            title, type, date, allDay,
            startTime: allDay ? null : startTime,
            endTime: allDay ? null : (endTime || null),
            location, notes,
            recurrence,
            reminder: { offsets: reminderOffsets }
        };

        try {
            if (id) {
                await this._saveEdit(id, data);
            } else {
                const created = this.add(data);
                // Jump the view to the new event's day so the user sees it land.
                this.curDate = created.date;
                Utils.showSuccess('✅ Event added');
                this.closeForm();
                this.render();
            }
        } catch (e) {
            Utils.showError('⚠️ ' + e.message);
        }
    },

    /**
     * Apply an edit, prompting for scope when the event repeats. For a recurring
     * event the user chooses "this & following" (split the series, freezing the
     * past) or "all events" (plain in-place update). Non-recurring events update
     * directly. The split boundary is the occurrence the user was viewing
     * (this.curDate), so past occurrences before it keep their old values.
     */
    async _saveEdit(id, data) {
        const existing = this.getById(id);
        if (!existing) throw new Error('Event not found');

        if (this.isRecurring(existing)) {
            const scope = await this._promptRecurringScope('edit');
            if (scope === null) return; // cancelled — leave the edit modal open

            if (scope === 'future') {
                const boundary = this._laterDate(this.curDate || existing.date, this._todayStr());
                const created = this.updateThisAndFuture(id, data, boundary);
                // A null result means the split found NO occurrence at/after the
                // boundary (the series already ended). There is nothing upcoming to
                // change — and we must NOT fall back to a full update, which would
                // rewrite the frozen past the user chose to keep. Tell them instead.
                if (!created) {
                    Utils.showError('⚠️ No upcoming occurrences to update — past events are unchanged.');
                    this.closeForm();
                    this.render();
                    return;
                }
                this.curDate = created.date;
                Utils.showSuccess('✅ Updated this & future events');
                this.closeForm();
                this.render();
                return;
            }
        }

        // Non-recurring, or "all events" chosen.
        this.update(id, data);
        Utils.showSuccess('✅ Event updated');
        this.closeForm();
        this.render();
    },

    async _deleteFromForm(id) {
        const ev = this.getById(id);
        if (!ev) return;

        if (this.isRecurring(ev)) {
            const scope = await this._promptRecurringScope('delete');
            if (scope === null) return; // cancelled

            if (scope === 'future') {
                const boundary = this._laterDate(this.curDate || ev.date, this._todayStr());
                this.deleteThisAndFuture(id, boundary);
                this.closeForm();
                this.render();
                Utils.showSuccess('This & future events deleted');
                return;
            }
            // scope === 'all' → fall through to delete the whole series.
        } else {
            const confirmed = await Utils.confirm(`Delete "${ev.title}"?\n\nThis also cancels its reminders.`, 'Delete Event');
            if (!confirmed) return;
        }

        this.delete(id);
        this.closeForm();
        this.render();
        Utils.showSuccess('Event deleted');
    },

    // ==================== NOTIFICATIONS ====================

    /**
     * (Re)schedule reminders for a single event. No-op when notifications are
     * unavailable (web/tests) or the reminder is disabled.
     */
    syncEventNotifications(event) {
        if (!window.Notifications || !window.Notifications.isAvailable()) return;
        const run = async () => {
            try {
                await window.Notifications.cancelForEvent(event.notificationIds || []);
                let ids = [];
                // Gate on the derived offsets (source of truth) rather than the
                // stored `enabled` flag, so a record with offsets but a stale/absent
                // `enabled` still schedules — matching the scheduler's own rule.
                if (this._normalizeReminder(event.reminder).offsets.length) {
                    const dates = this.getOccurrenceDates(event, 60);
                    ids = await window.Notifications.scheduleForEvent(event, dates);
                }
                event.notificationIds = ids;
                window.Storage.save();
            } catch (e) {
                console.warn('syncEventNotifications failed:', e);
            }
        };
        run();
    },

    /**
     * Cancel an event's reminders (used before update/delete). Fire-and-forget.
     */
    _cancelNotifications(event) {
        if (!window.Notifications || !window.Notifications.isAvailable()) return;
        try { window.Notifications.cancelForEvent(event.notificationIds || []); } catch (e) { /* ignore */ }
    },

    /**
     * Reschedule reminders for every event (called on app start so future
     * occurrences beyond the last horizon get re-queued).
     */
    syncAllNotifications() {
        if (!window.Notifications || !window.Notifications.isAvailable()) return;
        this.getAll().forEach(ev => {
            if (this._normalizeReminder(ev.reminder).offsets.length) this.syncEventNotifications(ev);
        });
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Schedule = Schedule;
}

// CommonJS export for tests.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Schedule;
}
