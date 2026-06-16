// Shared types used across the whole app. No runtime dependencies here.

/** Cloudflare/Worker bindings + secrets. Mirrors wrangler.toml + .dev.vars. */
export interface Env {
  DB: D1Database;
  /** From @BotFather. Secret. */
  BOT_TOKEN: string;
  /** JSON from getMe, only needed on Workers to skip an init round-trip. */
  BOT_INFO?: string;
  /** Shared secret to verify Telegram webhook calls (prod only). */
  WEBHOOK_SECRET?: string;
  /** Comma-separated Telegram numeric user ids allowed to run admin commands. */
  ADMIN_IDS?: string;
  TZ?: string;
}

export type GameStatus =
  | 'VOTING' // vote message posted, members tapping slots
  | 'TIEBREAK' // voting closed but tied → waiting for admin to pick
  | 'RSVP_OPEN' // winner locked, members confirming presence
  | 'LOCKED' // RSVP closed, squad frozen
  | 'PLAYED' // kickoff passed (seam for future stats)
  | 'CANCELLED';

export type RsvpStatus = 'IN' | 'OUT' | 'MAYBE';

export interface Player {
  tgUserId: number;
  displayName: string;
  username: string | null;
  isAdmin: boolean;
  createdAt: number;
}

export interface Game {
  id: number;
  chatId: number;
  createdBy: number;
  status: GameStatus;
  locationNote: string;
  minPlayers: number;
  capPlayers: number;
  voteDeadline: number; // unix ms UTC
  rsvpCloseAt: number | null; // unix ms UTC, set once winner is locked
  winningSlotId: number | null;
  voteMsgId: number | null;
  rsvpMsgId: number | null;
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
  tgUserId: number;
  createdAt: number;
}

export interface Rsvp {
  gameId: number;
  tgUserId: number;
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
