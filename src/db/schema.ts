// Drizzle table definitions — the single source of truth for typed queries.
// Must stay in sync with migrations/0000_init.sql.
import { sqliteTable, integer, text, primaryKey } from 'drizzle-orm/sqlite-core';
import type { GameStatus, RsvpStatus } from '../types';

export const players = sqliteTable('players', {
  tgUserId: integer('tg_user_id').primaryKey(),
  displayName: text('display_name').notNull(),
  username: text('username'),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

export const games = sqliteTable('games', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  createdBy: integer('created_by').notNull(),
  status: text('status').$type<GameStatus>().notNull(),
  locationNote: text('location_note').notNull(),
  minPlayers: integer('min_players').notNull(),
  capPlayers: integer('cap_players').notNull(),
  voteDeadline: integer('vote_deadline').notNull(),
  rsvpCloseAt: integer('rsvp_close_at'),
  winningSlotId: integer('winning_slot_id'),
  voteMsgId: integer('vote_msg_id'),
  rsvpMsgId: integer('rsvp_msg_id'),
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
    tgUserId: integer('tg_user_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.slotId, t.tgUserId] })],
);

export const rsvps = sqliteTable(
  'rsvps',
  {
    gameId: integer('game_id').notNull(),
    tgUserId: integer('tg_user_id').notNull(),
    status: text('status').$type<RsvpStatus>().notNull(),
    rankAt: integer('rank_at').notNull(),
    promotedNotifiedAt: integer('promoted_notified_at'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.tgUserId] })],
);
