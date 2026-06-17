// Tunable constants. All durations in milliseconds.

export const TIMEZONE = 'Europe/Lisbon';
export const LOCALE = 'pt-PT';

const HOUR = 3_600_000;

/** Defaults when the admin doesn't specify min/cap in /novojogo. */
// Futebol-7 = 14 on the pitch, so the game only confirms with a full 14 (min == cap).
export const DEFAULT_MIN_PLAYERS = 14;
export const DEFAULT_CAP_PLAYERS = 14;

/** RSVP closes this long before kickoff. */
export const RSVP_CLOSE_BEFORE_KICKOFF_MS = 3 * HOUR;

/** After kickoff, the "Cheguei ✅" check-in board stays open this long; then ghosts are assigned. */
export const CHECKIN_WINDOW_MS = 5 * HOUR;

/** Minimum confirmed games before a player is ranked on the 🏅 reliability board. */
export const MIN_GAMES_TO_RANK = 3;

/** How many names to show per leaderboard section in /stats. */
export const LEADERBOARD_TOP_N = 5;

/** How many names to show in the compact "Este mês" mini-board. */
export const MONTH_TOP_N = 3;

/**
 * 🏆 Jogador do Mês. A composite score over THIS MONTH's stats — appearances dominate,
 * reliability fine-tunes, the month's best streak rewards consistency, ghosts hurt:
 *   score = W_APP·presenças + W_STREAK·melhorSequência + (0..W_REL fiabilidade) − W_GHOST·fantasmas
 * Weights are integers so the result is easy to explain to the group. Tune freely.
 */
export const MOTM_W_APPEARANCE = 10;
export const MOTM_W_STREAK = 3;
export const MOTM_W_RELIABILITY = 5; // max bonus, scaled by raw present-while-confirmed ratio
export const MOTM_W_GHOST = 4;
/** Don't crown anyone until the month has at least this many played games... */
export const MIN_GAMES_FOR_MOTM = 2;
/** ...and the winner must have shown up to at least this many of them. */
export const MOTM_MIN_APPEARANCES = 2;

/** 💯 Registo perfeito: 100% present-while-confirmed across at least this many confirmed games. */
export const PERFECT_RECORD_MIN_GAMES = 5;

/** If the admin gives no vote deadline, default to this long before the earliest slot. */
export const VOTE_LEAD_BEFORE_EARLIEST_MS = 6 * HOUR;

/** Nudge timing windows, measured before rsvp_close_at. */
export const SHORT_WARN_BEFORE_CLOSE_MS = 6 * HOUR;
export const NONRESP_PING_BEFORE_CLOSE_MS = 12 * HOUR;

/**
 * How we ping the group at the "come and vote" moment (a new game opens).
 * The server is football-only, so @everyone == exactly the group. Switch to a
 * role mention (e.g. '<@&ROLE_ID>') here if you ever add non-players to the server.
 */
export const GROUP_PING = '@everyone';

export const GAME_STATUSES_ACTIVE = ['VOTING', 'TIEBREAK', 'RSVP_OPEN', 'LOCKED', 'CHECKIN_OPEN'] as const;

// ---------------------------------------------------------------------------
// field.pt / getfield.app — weekly auto-game from the field's free slots.
// ---------------------------------------------------------------------------
// The booking site is a Firebase app (project `field-v2-prod`) whose Firestore
// rules allow PUBLIC READ with the web API key — so the Worker reads availability
// directly, no login. The key is public by design (not a secret).
export const FIELD_API_KEY = 'AIzaSyAsdBrcNAvRvDWj-aEyWr6twLwgNTb71OY';
export const FIRESTORE_BASE =
  'https://firestore.googleapis.com/v1/projects/field-v2-prod/databases/(default)/documents';
/** Our club + pitch doc ids (the IPVC ESE 7x7 field). */
export const FIELD_CLUB_ID = '5QkuPXdvkISXwFZQyMlB';
export const FIELD_ID = 'Ia79UGKogA7oNBxp9PNS';

/** When the weekly auto-game fires (Lisbon wall-clock; weekday 1=Mon..7=Sun). */
export const WEEKLY_TRIGGER_DOW = 6; // Saturday
export const WEEKLY_TRIGGER_HOUR = 22; // fires from 22:00 on Saturday night; dedup keeps it to 1
/** Free-slot search window. 8 days so a Saturday-night fire still reaches NEXT Saturday. */
export const AVAIL_DAYS_AHEAD = 8;
export const AVAIL_SLOT_MIN = 60;
export const AVAIL_STEP_MIN = 60;
export const AVAIL_EARLIEST_HOUR = 18; // only propose kickoffs at/after this Lisbon hour...
export const AVAIL_LATEST_HOUR = 24;
/** ...except on these weekdays, where ANY open hour is allowed (Saturday plays daytime too). ISO 1=Mon..7=Sun. */
export const AVAIL_ANY_HOUR_DOWS = [6]; // Saturday
export const AVAIL_MAX_SLOTS = 25; // Discord renders at most 25 buttons (5×5)
/** Which `workingHours.day` value means Sunday in Field's data. VERIFY with `npm run print:avail`. */
export const FIELD_DAY_OF_SUNDAY = 7;
/** Weekdays the group never plays (ISO 1=Mon..7=Sun): Friday + Sunday → never proposed. */
export const WEEKLY_EXCLUDED_DOWS = [5, 7];
export const WEEKLY_LOCATION_NOTE = 'IPVC ESE - campo 7x7';
