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

/** Minimum games-with-a-result before a player is ranked on the 🎯 win-rate board. */
export const MIN_GAMES_FOR_WINRATE = 3;

/** How many names to show per leaderboard section in /stats. */
export const LEADERBOARD_TOP_N = 5;

/** How many names to show in the compact "Este mês" mini-board. */
export const MONTH_TOP_N = 3;

/** How many games to show per page of the 📜 /historico list. */
export const HISTORY_PAGE_SIZE = 5;

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

/** However soon the earliest free slot is, never give the group less than this long to vote —
 *  otherwise a same-day slot can push the computed deadline into the past (or, for the
 *  auto-open path, into a near-useless 1h fallback), closing the poll before anyone sees it. */
export const MIN_VOTE_WINDOW_MS = 3 * HOUR;

/** Once the deadline passes, closeVoting waits for at least `minPlayers` distinct voters
 *  before locking in a date (see closeVoting) — but not forever: past this long since the poll
 *  opened, it gives up and cancels outright (plain CANCELLED, so the cron can relaunch with
 *  fresh availability) rather than leaving the group stuck on a dead poll. */
export const VOTE_MAX_WAIT_MS = 7 * 24 * HOUR;

/** Nudge timing windows, measured before rsvp_close_at. */
export const SHORT_WARN_BEFORE_CLOSE_MS = 6 * HOUR;
export const NONRESP_PING_BEFORE_CLOSE_MS = 12 * HOUR;

/**
 * How we ping the group at the "come and vote" moment (a new game opens).
 * Preferred: mention the "Jogador" role — set GROUP_ROLE_ID to its id AND mark the role
 * "Allow anyone to @mention this role" in Discord. That notifies the group WITHOUT needing
 * the bot's MENTION_EVERYONE permission (which kept getting toggled off on @everyone).
 * If GROUP_ROLE_ID is left empty we fall back to @everyone, which only pings when the bot's
 * role has MENTION_EVERYONE in the channel. GROUP_PING_MENTIONS stays in sync with the choice.
 */
export const GROUP_ROLE_ID = '1516463611856556297'; // cargo "Jogador" (mencionável por todos)
export const GROUP_PING = GROUP_ROLE_ID ? `<@&${GROUP_ROLE_ID}>` : '@everyone';
export const GROUP_PING_MENTIONS: ('users' | 'everyone' | 'roles')[] = GROUP_ROLE_ID
  ? ['users', 'roles']
  : ['users', 'everyone'];

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
/** Our pitch doc id (the IPVC ESE 7x7 field). */
export const FIELD_ID = 'Ia79UGKogA7oNBxp9PNS';

/**
 * The auto-game is event-driven: the cron opens the next vote as soon as no game is in
 * progress (the previous one was played or cancelled), giving the group the most heads-up.
 * These bound WHEN that's allowed to happen — all Lisbon wall-clock.
 */
export const AUTO_OPEN_START_HOUR = 9; // don't open before 09:00 (so a late game doesn't ping at 3am)...
export const AUTO_OPEN_END_HOUR = 23; // ...nor at/after 23:00
export const AUTO_OPEN_COOLDOWN_MS = 12 * HOUR; // and never another within 12h of the last one
/** Free-slot search window. 8 days always reaches at least the coming week from any weekday. */
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
