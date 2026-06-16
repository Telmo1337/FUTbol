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
  TZ?: string;
}

export type GameStatus =
  | 'VOTING' // vote message posted, members tapping slots
  | 'TIEBREAK' // voting closed but tied → waiting for admin to pick
  | 'RSVP_OPEN' // winner locked, members confirming presence
  | 'LOCKED' // RSVP closed, squad frozen
  | 'CHECKIN_OPEN' // kickoff passed, collecting "Cheguei ✅" until the window closes
  | 'PLAYED' // window closed, ghosts assigned, stats final
  | 'CANCELLED';

export type RsvpStatus = 'IN' | 'OUT' | 'MAYBE';

/** How a check-in (= player present) got recorded. */
export type CheckinSource = 'self' | 'admin';

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
  checkinMsgId: string | null;
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
