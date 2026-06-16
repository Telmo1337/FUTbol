// Repository: the ONLY module that runs SQL. Everything else calls these methods.
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { createDb } from './client';
import { players, games, candidateSlots, votes, rsvps, checkins } from './schema';
import { GAME_STATUSES_ACTIVE } from '../config';
import type { Checkin, CheckinSource, Game, GameStatus, RsvpStatus, RsvpView, Slot, Vote } from '../types';

/** A finished game with its kickoff time, for stats. */
export interface PlayedGame {
  id: number;
  capPlayers: number;
  kickoffAt: number;
}

export type NudgeFlag = 'GAME_ON' | 'SHORT_WARN' | 'NONRESP_PING';

const ACTIVE = GAME_STATUSES_ACTIVE as unknown as GameStatus[];

export interface NewGame {
  chatId: string;
  createdBy: string;
  locationNote: string;
  minPlayers: number;
  capPlayers: number;
  voteDeadline: number;
  now: number;
}

export function createRepo(d1: D1Database) {
  const db = createDb(d1);

  return {
    // ---------- players ----------
    async upsertPlayer(
      p: { tgUserId: string; displayName: string; username: string | null },
      isAdmin: boolean,
      now: number,
    ): Promise<void> {
      await db
        .insert(players)
        .values({ tgUserId: p.tgUserId, displayName: p.displayName, username: p.username, isAdmin, createdAt: now })
        .onConflictDoUpdate({
          target: players.tgUserId,
          set: { displayName: p.displayName, username: p.username, isAdmin },
        });
    },

    async getKnownPlayers(): Promise<{ tgUserId: string; displayName: string }[]> {
      return db.select({ tgUserId: players.tgUserId, displayName: players.displayName }).from(players);
    },

    // ---------- games ----------
    async createGame(g: NewGame): Promise<number> {
      const row = await db
        .insert(games)
        .values({
          chatId: g.chatId,
          createdBy: g.createdBy,
          status: 'VOTING',
          locationNote: g.locationNote,
          minPlayers: g.minPlayers,
          capPlayers: g.capPlayers,
          voteDeadline: g.voteDeadline,
          createdAt: g.now,
          updatedAt: g.now,
        })
        .returning({ id: games.id })
        .get();
      return row!.id;
    },

    async getGame(id: number): Promise<Game | null> {
      const row = await db.select().from(games).where(eq(games.id, id)).get();
      return row ?? null;
    },

    async getActiveGames(): Promise<Game[]> {
      return db.select().from(games).where(inArray(games.status, ACTIVE));
    },

    async getCurrentGame(chatId: string): Promise<Game | null> {
      const row = await db
        .select()
        .from(games)
        .where(and(eq(games.chatId, chatId), inArray(games.status, ACTIVE)))
        .orderBy(desc(games.id))
        .get();
      return row ?? null;
    },

    async setVoteMsg(id: number, msgId: string, now: number): Promise<void> {
      await db.update(games).set({ voteMsgId: msgId, updatedAt: now }).where(eq(games.id, id)).run();
    },

    async setRsvpMsg(id: number, msgId: string, now: number): Promise<void> {
      await db.update(games).set({ rsvpMsgId: msgId, updatedAt: now }).where(eq(games.id, id)).run();
    },

    async setStatus(id: number, status: GameStatus, now: number): Promise<void> {
      await db.update(games).set({ status, updatedAt: now }).where(eq(games.id, id)).run();
    },

    async lockWinner(id: number, slotId: number, rsvpCloseAt: number, now: number): Promise<void> {
      await db
        .update(games)
        .set({ status: 'RSVP_OPEN', winningSlotId: slotId, rsvpCloseAt, updatedAt: now })
        .where(eq(games.id, id))
        .run();
    },

    /** LOCKED → CHECKIN_OPEN: kickoff has passed, start collecting "Cheguei ✅". */
    async openCheckin(id: number, checkinCloseAt: number, now: number): Promise<void> {
      await db
        .update(games)
        .set({ status: 'CHECKIN_OPEN', checkinCloseAt, updatedAt: now })
        .where(eq(games.id, id))
        .run();
    },

    async setCheckinMsg(id: number, msgId: string, now: number): Promise<void> {
      await db.update(games).set({ checkinMsgId: msgId, updatedAt: now }).where(eq(games.id, id)).run();
    },

    async setNudgeFlag(id: number, flag: NudgeFlag, now: number): Promise<void> {
      const patch =
        flag === 'GAME_ON'
          ? { flagGameOnSent: true }
          : flag === 'SHORT_WARN'
            ? { flagShortWarnSent: true }
            : { flagNonrespPingSent: true };
      await db.update(games).set({ ...patch, updatedAt: now }).where(eq(games.id, id)).run();
    },

    // ---------- slots ----------
    async addSlots(gameId: number, slots: { kickoffAt: number; label: string; sortOrder: number }[]): Promise<void> {
      if (slots.length === 0) return;
      await db
        .insert(candidateSlots)
        .values(slots.map((s) => ({ gameId, kickoffAt: s.kickoffAt, label: s.label, sortOrder: s.sortOrder })))
        .run();
    },

    async getSlots(gameId: number): Promise<Slot[]> {
      return db.select().from(candidateSlots).where(eq(candidateSlots.gameId, gameId)).orderBy(candidateSlots.sortOrder);
    },

    async getSlot(id: number): Promise<Slot | null> {
      const row = await db.select().from(candidateSlots).where(eq(candidateSlots.id, id)).get();
      return row ?? null;
    },

    // ---------- votes ----------
    async toggleVote(gameId: number, slotId: number, tgUserId: string, now: number): Promise<'added' | 'removed'> {
      const where = and(eq(votes.gameId, gameId), eq(votes.slotId, slotId), eq(votes.tgUserId, tgUserId));
      const existing = await db.select().from(votes).where(where).get();
      if (existing) {
        await db.delete(votes).where(where).run();
        return 'removed';
      }
      await db.insert(votes).values({ gameId, slotId, tgUserId, createdAt: now }).run();
      return 'added';
    },

    async getVotes(gameId: number): Promise<Vote[]> {
      return db.select().from(votes).where(eq(votes.gameId, gameId));
    },

    /** Votes joined with each voter's display name, for showing "who voted what" on the board. */
    async getVotesWithNames(gameId: number): Promise<{ slotId: number; tgUserId: string; displayName: string }[]> {
      const rows = await db
        .select({ slotId: votes.slotId, tgUserId: votes.tgUserId, displayName: players.displayName })
        .from(votes)
        .leftJoin(players, eq(players.tgUserId, votes.tgUserId))
        .where(eq(votes.gameId, gameId));
      return rows.map((r) => ({ slotId: r.slotId, tgUserId: r.tgUserId, displayName: r.displayName ?? 'Jogador' }));
    },

    // ---------- rsvps ----------
    async setRsvp(
      gameId: number,
      tgUserId: string,
      status: RsvpStatus,
      now: number,
    ): Promise<{ prevStatus: RsvpStatus | null }> {
      const existing = await db
        .select()
        .from(rsvps)
        .where(and(eq(rsvps.gameId, gameId), eq(rsvps.tgUserId, tgUserId)))
        .get();
      const prevStatus = existing?.status ?? null;
      // rank_at is set when someone (re)joins as IN, so leaving and coming back
      // moves you to the back of the waitlist. Stays stable on repeated IN taps.
      let rankAt = existing?.rankAt ?? now;
      if (status === 'IN' && prevStatus !== 'IN') rankAt = now;
      // Clear the promotion-notified guard when they stop being IN, so a future
      // promotion notifies them again.
      const promotedNotifiedAt = status === 'IN' ? (existing?.promotedNotifiedAt ?? null) : null;
      await db
        .insert(rsvps)
        .values({ gameId, tgUserId, status, rankAt, promotedNotifiedAt, updatedAt: now })
        .onConflictDoUpdate({
          target: [rsvps.gameId, rsvps.tgUserId],
          set: { status, rankAt, promotedNotifiedAt, updatedAt: now },
        });
      return { prevStatus };
    },

    async getRsvps(gameId: number): Promise<RsvpView[]> {
      const rows = await db
        .select({
          gameId: rsvps.gameId,
          tgUserId: rsvps.tgUserId,
          status: rsvps.status,
          rankAt: rsvps.rankAt,
          promotedNotifiedAt: rsvps.promotedNotifiedAt,
          updatedAt: rsvps.updatedAt,
          displayName: players.displayName,
          username: players.username,
        })
        .from(rsvps)
        .leftJoin(players, eq(players.tgUserId, rsvps.tgUserId))
        .where(eq(rsvps.gameId, gameId));
      return rows.map((r) => ({ ...r, displayName: r.displayName ?? 'Jogador', username: r.username ?? null }));
    },

    /** Guarded write: returns true only if THIS call flipped the flag (prevents double notifications). */
    async markPromotedNotified(gameId: number, tgUserId: string, now: number): Promise<boolean> {
      const res = (await db.run(
        sql`UPDATE rsvps SET promoted_notified_at = ${now} WHERE game_id = ${gameId} AND tg_user_id = ${tgUserId} AND promoted_notified_at IS NULL`,
      )) as unknown as D1Result;
      return (res.meta?.changes ?? 0) > 0;
    },

    // ---------- checkins (attendance) ----------
    /** Record a player as present. Returns true only if this call added a new row (vs already present). */
    async addCheckin(gameId: number, tgUserId: string, source: CheckinSource, now: number): Promise<boolean> {
      const where = and(eq(checkins.gameId, gameId), eq(checkins.tgUserId, tgUserId));
      const existing = await db.select().from(checkins).where(where).get();
      if (existing) return false;
      await db.insert(checkins).values({ gameId, tgUserId, checkedInAt: now, source }).run();
      return true;
    },

    async getCheckins(gameId: number): Promise<Checkin[]> {
      return db.select().from(checkins).where(eq(checkins.gameId, gameId));
    },

    // ---------- stats (read-side, all-time per chat) ----------
    /** Finished games (with kickoff time) for a chat, oldest first. */
    async getPlayedGames(chatId: string): Promise<PlayedGame[]> {
      return db
        .select({ id: games.id, capPlayers: games.capPlayers, kickoffAt: candidateSlots.kickoffAt })
        .from(games)
        .innerJoin(candidateSlots, eq(candidateSlots.id, games.winningSlotId))
        .where(and(eq(games.chatId, chatId), eq(games.status, 'PLAYED')))
        .orderBy(candidateSlots.kickoffAt);
    },

    async getRsvpsForGames(
      gameIds: number[],
    ): Promise<{ gameId: number; tgUserId: string; status: RsvpStatus; rankAt: number }[]> {
      if (gameIds.length === 0) return [];
      return db
        .select({ gameId: rsvps.gameId, tgUserId: rsvps.tgUserId, status: rsvps.status, rankAt: rsvps.rankAt })
        .from(rsvps)
        .where(inArray(rsvps.gameId, gameIds));
    },

    async getCheckinsForGames(gameIds: number[]): Promise<{ gameId: number; tgUserId: string }[]> {
      if (gameIds.length === 0) return [];
      return db
        .select({ gameId: checkins.gameId, tgUserId: checkins.tgUserId })
        .from(checkins)
        .where(inArray(checkins.gameId, gameIds));
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;
