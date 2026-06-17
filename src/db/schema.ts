// Drizzle table definitions — the single source of truth for typed queries.
// Must stay in sync with migrations/0000_init.sql.
import { sqliteTable, integer, text, primaryKey } from 'drizzle-orm/sqlite-core';
import type { CheckinSource, EventKind, GameStatus, ResultSide, RsvpStatus } from '../types';

// NOTE: id-bearing columns (tg_user_id, chat_id, created_by, *_msg_id) are TEXT —
// they hold Discord snowflakes, which overflow JS numbers if read as integers.
// Our own ids (games.id, candidate_slots.id, winning_slot_id) stay INTEGER.
export const players = sqliteTable('players', {
  tgUserId: text('tg_user_id').primaryKey(),
  displayName: text('display_name').notNull(),
  username: text('username'),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

export const games = sqliteTable('games', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: text('chat_id').notNull(),
  createdBy: text('created_by').notNull(),
  status: text('status').$type<GameStatus>().notNull(),
  locationNote: text('location_note').notNull(),
  minPlayers: integer('min_players').notNull(),
  capPlayers: integer('cap_players').notNull(),
  voteDeadline: integer('vote_deadline').notNull(),
  rsvpCloseAt: integer('rsvp_close_at'),
  checkinCloseAt: integer('checkin_close_at'),
  winningSlotId: integer('winning_slot_id'),
  voteMsgId: text('vote_msg_id'),
  rsvpMsgId: text('rsvp_msg_id'),
  checkinMsgId: text('checkin_msg_id'),
  teamsMsgId: text('teams_msg_id'),
  teamsLockedAt: integer('teams_locked_at'),
  pricePerPersonCents: integer('price_per_person_cents'), // 💶 per-person price (cents); null = unset
  paymentMsgId: text('payment_msg_id'), // the public 💶 Pagamentos board
  flagGameOnSent: integer('flag_game_on_sent', { mode: 'boolean' }).notNull().default(false),
  flagShortWarnSent: integer('flag_short_warn_sent', { mode: 'boolean' }).notNull().default(false),
  flagNonrespPingSent: integer('flag_nonresp_ping_sent', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const candidateSlots = sqliteTable('candidate_slots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  gameId: integer('game_id').notNull(),
  kickoffAt: integer('kickoff_at').notNull(),
  label: text('label').notNull(),
  sortOrder: integer('sort_order').notNull(),
});

export const votes = sqliteTable(
  'votes',
  {
    gameId: integer('game_id').notNull(),
    slotId: integer('slot_id').notNull(),
    tgUserId: text('tg_user_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.slotId, t.tgUserId] })],
);

export const rsvps = sqliteTable(
  'rsvps',
  {
    gameId: integer('game_id').notNull(),
    tgUserId: text('tg_user_id').notNull(),
    status: text('status').$type<RsvpStatus>().notNull(),
    rankAt: integer('rank_at').notNull(),
    promotedNotifiedAt: integer('promoted_notified_at'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.tgUserId] })],
);

// v2: attendance. One row = this player was present at this game.
export const checkins = sqliteTable(
  'checkins',
  {
    gameId: integer('game_id').notNull(),
    tgUserId: text('tg_user_id').notNull(),
    checkedInAt: integer('checked_in_at').notNull(),
    source: text('source').$type<CheckinSource>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.tgUserId] })],
);

// v3: teams. One row = this player played on side 'A' (Alpha) or 'B' (Beta).
export const resultTeams = sqliteTable(
  'result_teams',
  {
    gameId: integer('game_id').notNull(),
    tgUserId: text('tg_user_id').notNull(),
    side: text('side').$type<ResultSide>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.tgUserId] })],
);

// v3: the score. One row per game with a recorded result. goals_a = Alpha, goals_b = Beta.
export const results = sqliteTable('results', {
  gameId: integer('game_id').primaryKey(),
  goalsA: integer('goals_a').notNull(),
  goalsB: integer('goals_b').notNull(),
  recordedBy: text('recorded_by').notNull(),
  recordedAt: integer('recorded_at').notNull(),
});

// v4: scoring events. One row = one goal ('G') or one assist ('A') by a player in a game.
// Append-only with an autoincrement id, so "anular último" deletes the highest id of that kind.
export const gameEvents = sqliteTable('game_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  gameId: integer('game_id').notNull(),
  tgUserId: text('tg_user_id').notNull(),
  kind: text('kind').$type<EventKind>().notNull(),
  createdAt: integer('created_at').notNull(),
});

// v5: 💶 payments. One row = this player has paid for this game. Presence = paid; absence = owes.
export const payments = sqliteTable(
  'payments',
  {
    gameId: integer('game_id').notNull(),
    tgUserId: text('tg_user_id').notNull(),
    paidAt: integer('paid_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.tgUserId] })],
);
