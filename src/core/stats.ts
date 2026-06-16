// Pure stats aggregation. No DB, no Discord — takes raw rows, returns numbers.
// Definitions (see docs/v2-plan.md):
//   present       = the player has a check-in for that PLAYED game (tapped, or admin-cleared)
//   confirmed-for = the player was in the final confirmed squad (IN, within cap by join order)
//   👟 appearance = a PLAYED game where you were present (confirmed OR a sub off the waitlist)
//   🏅 reliability = present-while-confirmed ÷ confirmed-for  (ranked only at ≥ MIN_GAMES_TO_RANK)
//   👻 ghost      = confirmed-for but NOT present
//   🔥 streak     = consecutive most-recent PLAYED games you were present for (any miss resets)
import { MIN_GAMES_TO_RANK } from '../config';
import type { RsvpStatus } from '../types';

export interface StatsGame {
  id: number;
  capPlayers: number;
  kickoffAt: number;
}
export interface StatsRsvp {
  gameId: number;
  tgUserId: string;
  status: RsvpStatus;
  rankAt: number;
}
export interface StatsInput {
  games: StatsGame[]; // PLAYED games (any order)
  rsvps: StatsRsvp[]; // rsvp rows for those games
  presentKeys: Set<string>; // `${gameId}:${tgUserId}` for every present player
  names: Map<string, string>; // tgUserId -> display name
}

export interface PlayerStat {
  tgUserId: string;
  name: string;
  appearances: number;
  confirmedFor: number;
  ghosts: number;
  reliabilityPct: number | null; // null until confirmedFor >= MIN_GAMES_TO_RANK
  currentStreak: number;
  bestStreak: number;
}
export interface Stats {
  totalGames: number;
  firstKickoff: number | null;
  players: PlayerStat[];
}

const key = (gameId: number, userId: string) => `${gameId}:${userId}`;

/** The confirmed squad for one game: IN rows, ordered by join time, capped. Mirrors core/rsvp splitSquad. */
function confirmedSquad(rows: StatsRsvp[], cap: number): string[] {
  return rows
    .filter((r) => r.status === 'IN')
    .sort((a, b) => a.rankAt - b.rankAt || a.tgUserId.localeCompare(b.tgUserId))
    .slice(0, cap)
    .map((r) => r.tgUserId);
}

export function computeStats(input: StatsInput): Stats {
  const games = [...input.games].sort((a, b) => a.kickoffAt - b.kickoffAt); // chronological
  const rsvpsByGame = new Map<number, StatsRsvp[]>();
  for (const r of input.rsvps) {
    const arr = rsvpsByGame.get(r.gameId);
    if (arr) arr.push(r);
    else rsvpsByGame.set(r.gameId, [r]);
  }

  // Everyone who ever appears (rsvp'd or showed up) gets a row.
  const userIds = new Set<string>();
  for (const r of input.rsvps) userIds.add(r.tgUserId);
  for (const k of input.presentKeys) userIds.add(k.split(':')[1]);

  const acc = new Map<
    string,
    { appearances: number; confirmedFor: number; showedConfirmed: number; run: number; best: number }
  >();
  for (const id of userIds) acc.set(id, { appearances: 0, confirmedFor: 0, showedConfirmed: 0, run: 0, best: 0 });

  for (const game of games) {
    const squad = new Set(confirmedSquad(rsvpsByGame.get(game.id) ?? [], game.capPlayers));
    for (const id of userIds) {
      const a = acc.get(id)!;
      const present = input.presentKeys.has(key(game.id, id));
      const confirmed = squad.has(id);
      if (present) a.appearances++;
      if (confirmed) a.confirmedFor++;
      if (confirmed && present) a.showedConfirmed++;
      // streak runs over EVERY game in the group's sequence
      a.run = present ? a.run + 1 : 0;
      if (a.run > a.best) a.best = a.run;
    }
  }

  const players: PlayerStat[] = [];
  for (const [id, a] of acc) {
    players.push({
      tgUserId: id,
      name: input.names.get(id) ?? 'Jogador',
      appearances: a.appearances,
      confirmedFor: a.confirmedFor,
      ghosts: a.confirmedFor - a.showedConfirmed,
      reliabilityPct: a.confirmedFor >= MIN_GAMES_TO_RANK ? Math.round((100 * a.showedConfirmed) / a.confirmedFor) : null,
      currentStreak: a.run,
      bestStreak: a.best,
    });
  }

  return {
    totalGames: games.length,
    firstKickoff: games.length ? games[0].kickoffAt : null,
    players,
  };
}

// ---------- board selectors (pure sorts; the render layer just prints them) ----------
const byName = (a: PlayerStat, b: PlayerStat) => a.name.localeCompare(b.name) || a.tgUserId.localeCompare(b.tgUserId);

export function topByReliability(stats: Stats, n: number): PlayerStat[] {
  return stats.players
    .filter((p) => p.reliabilityPct != null)
    .sort((a, b) => b.reliabilityPct! - a.reliabilityPct! || b.appearances - a.appearances || byName(a, b))
    .slice(0, n);
}
export function topByAppearances(stats: Stats, n: number): PlayerStat[] {
  return stats.players
    .filter((p) => p.appearances > 0)
    .sort((a, b) => b.appearances - a.appearances || byName(a, b))
    .slice(0, n);
}
export function topByStreak(stats: Stats, n: number): PlayerStat[] {
  return stats.players
    .filter((p) => p.currentStreak > 0)
    .sort((a, b) => b.currentStreak - a.currentStreak || byName(a, b))
    .slice(0, n);
}
export function topByGhosts(stats: Stats, n: number): PlayerStat[] {
  return stats.players
    .filter((p) => p.ghosts > 0)
    .sort((a, b) => b.ghosts - a.ghosts || byName(a, b))
    .slice(0, n);
}

/** This player's stat row, or a zeroed one if they have no history yet. */
export function statFor(stats: Stats, userId: string, name: string): PlayerStat {
  return (
    stats.players.find((p) => p.tgUserId === userId) ?? {
      tgUserId: userId,
      name,
      appearances: 0,
      confirmedFor: 0,
      ghosts: 0,
      reliabilityPct: null,
      currentStreak: 0,
      bestStreak: 0,
    }
  );
}

/** 1-based rank of a player within an ordered board, or null if not present. */
export function rankIn(board: PlayerStat[], userId: string): number | null {
  const i = board.findIndex((p) => p.tgUserId === userId);
  return i === -1 ? null : i + 1;
}
