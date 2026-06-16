// Tunable constants. All durations in milliseconds.

export const TIMEZONE = 'Europe/Lisbon';
export const LOCALE = 'pt-PT';

const HOUR = 3_600_000;

/** Defaults when the admin doesn't specify min/cap in /novojogo. */
export const DEFAULT_MIN_PLAYERS = 10;
export const DEFAULT_CAP_PLAYERS = 14;

/** RSVP closes this long before kickoff. */
export const RSVP_CLOSE_BEFORE_KICKOFF_MS = 3 * HOUR;

/** If the admin gives no vote deadline, default to this long before the earliest slot. */
export const VOTE_LEAD_BEFORE_EARLIEST_MS = 6 * HOUR;

/** Nudge timing windows, measured before rsvp_close_at. */
export const SHORT_WARN_BEFORE_CLOSE_MS = 6 * HOUR;
export const NONRESP_PING_BEFORE_CLOSE_MS = 12 * HOUR;

/** How often the local long-polling process runs the tick. Workers uses a 1-min cron. */
export const TICK_INTERVAL_MS_LOCAL = 30_000;

export const GAME_STATUSES_ACTIVE = ['VOTING', 'TIEBREAK', 'RSVP_OPEN', 'LOCKED'] as const;
