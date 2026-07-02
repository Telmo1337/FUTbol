// Shared types used across the whole app. No runtime dependencies here.
//
// NOTE on ids: this started as a Telegram bot, so id-bearing fields are still
// named `tgUserId`, `chatId`, `*MsgId`. They now hold **Discord** ids (snowflakes),
// which are 64-bit and overflow JS numbers — so they are **strings**, not numbers.
// Our own DB ids (game.id, slot.id, winningSlotId) stay numeric autoincrements.

/** Cloudflare/Worker bindings + secrets. Mirrors wrangler.toml + .dev.vars. */
export interface Env {
  DB: D1Database;
  /** Discord bot token (from the Developer Portal → Bot). Secret. Used for REST sends. */
  DISCORD_BOT_TOKEN: string;
  /** Discord application public key (General Information). Verifies incoming interactions. */
  DISCORD_PUBLIC_KEY: string;
  /** Discord application id. Used to register slash commands. */
  DISCORD_APPLICATION_ID: string;
  /** The server (guild) id — slash commands are registered per-guild for instant updates. */
  DISCORD_GUILD_ID?: string;
  /** Comma-separated Discord user ids (strings) allowed to run admin commands. */
  ADMIN_IDS?: string;
  /**
   * Discord channel id where the weekly auto-game poll is posted. Used ONLY by the
   * Sunday cron (interactions already know their own channel). Empty = feature off.
   */
  GAME_CHANNEL_ID?: string;
  /**
   * Discord channel id where the `/testjogo` seed command is allowed to run. Lets you
   * exercise the full equipas→resultado flow with fake players in a private test channel
   * (stats are per-channel, so it never touches the real group). Empty = command off.
   */
  TEST_CHANNEL_ID?: string;
  /**
   * Master switch for the ⚽ golos/assistências feature. ON by default; set to
   * "false"/"0"/"off" to hide all of it (boards, capture panel, /topmarcadores) without
   * a code change. See util.golosEnabled.
   */
  GOLOS_ENABLED?: string;
  /**
   * Sub-switch for 🅰️ assistências only. ON by default; set to "false"/"0"/"off" to keep
   * goals but drop assists (which are a subjective manual call). See util.assistsEnabled.
   */
  ASSISTS_ENABLED?: string;
  /**
   * Master switch for the 💶 pagamentos feature (the /pagamentos board + admin panel).
   * Defaults ON when unset; set to "false"/"0"/"off" to hide it. See util.pagamentosEnabled.
   */
  PAGAMENTOS_ENABLED?: string;
  TZ?: string;
}

export type GameStatus =
  | 'VOTING' // vote message posted, members tapping slots
  | 'TIEBREAK' // voting closed but tied → waiting for admin to pick
  | 'RSVP_OPEN' // winner locked, members confirming presence
  | 'LOCKED' // RSVP closed, squad frozen
  | 'CHECKIN_OPEN' // kickoff passed, collecting "Cheguei ✅" until the window closes
  | 'PLAYED' // window closed, ghosts assigned, stats final
  | 'CANCELLED' // fell through (e.g. too few players) — the cron MAY auto-open the next game
  | 'CANCELLED_ADMIN'; // admin pressed /cancelar — a deliberate stop; the cron will NOT auto-open

export type RsvpStatus = 'IN' | 'OUT' | 'MAYBE';

/** How a check-in (= player present) got recorded. */
export type CheckinSource = 'self' | 'admin';

/** Which team a player was on for a game's result. 'A' = Alpha, 'B' = Beta. */
export type ResultSide = 'A' | 'B';

/** An individual scoring event in a game. 'G' = golo (goal), 'A' = assistência (assist). */
export type EventKind = 'G' | 'A';

export interface Player {
  tgUserId: string; // Discord user id (snowflake)
  displayName: string;
  username: string | null;
  isAdmin: boolean;
  createdAt: number;
}

export interface Game {
  id: number;
  chatId: string; // Discord channel id (snowflake)
  createdBy: string; // Discord user id of the admin who opened it
  status: GameStatus;
  locationNote: string;
  minPlayers: number;
  capPlayers: number;
  voteDeadline: number; // unix ms UTC
  rsvpCloseAt: number | null; // unix ms UTC, set once winner is locked
  checkinCloseAt: number | null; // unix ms UTC, set when the check-in window opens (kickoff + window)
  winningSlotId: number | null;
  voteMsgId: string | null; // Discord message id of the live vote board
  rsvpMsgId: string | null;
  tieMsgId: string | null; // the "🤝 Empate" admin-prompt message, so it can be disarmed
  checkinMsgId: string | null;
  teamsMsgId: string | null; // the public "⚔️ Equipas" board (flips from "a montar" → revealed)
  teamsLockedAt: number | null; // unix ms UTC, set when the admin publishes the teams
  pricePerPersonCents: number | null; // 💶 per-person price in cents, set by the admin (null = unset)
  paymentMsgId: string | null; // the public 💶 Pagamentos board
  flagGameOnSent: boolean;
  flagShortWarnSent: boolean;
  flagNonrespPingSent: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Slot {
  id: number;
  gameId: number;
  kickoffAt: number; // unix ms UTC
  label: string; // precomputed pt-PT label, e.g. "Sáb, 14 jun · 20:00"
  sortOrder: number;
}

export interface Vote {
  gameId: number;
  slotId: number;
  tgUserId: string; // Discord user id
  createdAt: number;
}

export interface Rsvp {
  gameId: number;
  tgUserId: string; // Discord user id
  status: RsvpStatus;
  rankAt: number; // waitlist ordering: when they (last) joined as IN
  promotedNotifiedAt: number | null;
  updatedAt: number;
}

/** An RSVP row joined with the player's display name, for rendering. */
export interface RsvpView extends Rsvp {
  displayName: string;
  username: string | null;
}

/** A presence record: this player was at this game. */
export interface Checkin {
  gameId: number;
  tgUserId: string; // Discord user id
  checkedInAt: number;
  source: CheckinSource;
}
