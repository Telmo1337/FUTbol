// Pure stats aggregation. No DB, no Discord — takes raw rows, returns numbers.
// Definitions (see docs/v2-plan.md):
//   present       = the player has a check-in for that PLAYED game (tapped, or admin-cleared)
//   confirmed-for = the player was in the final confirmed squad (IN, within cap by join order)
//   👟 appearance = a PLAYED game where you were present (confirmed OR a sub off the waitlist)
//   🏅 reliability = present-while-confirmed ÷ confirmed-for  (ranked only at ≥ MIN_GAMES_TO_RANK)
//   👻 ghost      = confirmed-for but NOT present
//   🔥 streak     = consecutive most-recent PLAYED games you were present for (any miss resets)
//   🐦 early-bird = you were the FIRST to say "Vou" (lowest rankAt among the IN rows) for that game
import {
  MIN_GAMES_TO_RANK,
  MIN_GAMES_FOR_WINRATE,
  MIN_GAMES_FOR_MOTM,
  MOTM_MIN_APPEARANCES,
  MOTM_W_APPEARANCE,
  MOTM_W_GHOST,
  MOTM_W_RELIABILITY,
  MOTM_W_STREAK,
  PERFECT_RECORD_MIN_GAMES,
} from '../config';
import type { ResultSide, RsvpStatus } from '../types';

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
/** A recorded score for a game (goalsA = Alpha, goalsB = Beta). */
export interface StatsResult {
  gameId: number;
  goalsA: number;
  goalsB: number;
}
/** A player's team side for a game's result. */
export interface StatsTeam {
  gameId: number;
  tgUserId: string;
  side: ResultSide;
}
export interface StatsInput {
  games: StatsGame[]; // PLAYED games (any order)
  rsvps: StatsRsvp[]; // rsvp rows for those games
  presentKeys: Set<string>; // `${gameId}:${tgUserId}` for every present player
  names: Map<string, string>; // tgUserId -> display name
  results: StatsResult[]; // scores for games that have one
  teams: StatsTeam[]; // who played on which side, for games with teams
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
  earlyBirdWins: number; // games where you were the first to say "Vou"
  // v3: results (over games where this player was on a team AND a score is recorded)
  resultGames: number; // games-with-a-result this player played in
  wins: number;
  draws: number;
  losses: number;
  winPct: number | null; // wins/resultGames as %, null until resultGames >= MIN_GAMES_FOR_WINRATE
  currentWinStreak: number;
  bestWinStreak: number;
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

/** Optional [since, until) kickoff window — restricts the aggregation to one period (e.g. a month). */
export interface StatsWindow {
  since: number;
  until: number;
}

export function computeStats(input: StatsInput, window?: StatsWindow): Stats {
  const inWindow = (g: StatsGame) => !window || (g.kickoffAt >= window.since && g.kickoffAt < window.until);
  const games = [...input.games].filter(inWindow).sort((a, b) => a.kickoffAt - b.kickoffAt); // chronological
  const rsvpsByGame = new Map<number, StatsRsvp[]>();
  for (const r of input.rsvps) {
    const arr = rsvpsByGame.get(r.gameId);
    if (arr) arr.push(r);
    else rsvpsByGame.set(r.gameId, [r]);
  }

  const resultByGame = new Map<number, StatsResult>();
  for (const r of input.results) resultByGame.set(r.gameId, r);
  const teamsByGame = new Map<number, StatsTeam[]>();
  for (const t of input.teams) {
    const arr = teamsByGame.get(t.gameId);
    if (arr) arr.push(t);
    else teamsByGame.set(t.gameId, [t]);
  }

  // Everyone who ever appears (rsvp'd, showed up, or was put on a team) gets a row.
  const userIds = new Set<string>();
  for (const r of input.rsvps) userIds.add(r.tgUserId);
  for (const k of input.presentKeys) userIds.add(k.split(':')[1]);
  for (const t of input.teams) userIds.add(t.tgUserId);

  const acc = new Map<
    string,
    {
      appearances: number;
      confirmedFor: number;
      showedConfirmed: number;
      run: number;
      best: number;
      early: number;
      resultGames: number;
      wins: number;
      draws: number;
      losses: number;
      winRun: number;
      bestWin: number;
    }
  >();
  for (const id of userIds)
    acc.set(id, {
      appearances: 0,
      confirmedFor: 0,
      showedConfirmed: 0,
      run: 0,
      best: 0,
      early: 0,
      resultGames: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRun: 0,
      bestWin: 0,
    });

  for (const game of games) {
    const ordered = confirmedSquad(rsvpsByGame.get(game.id) ?? [], game.capPlayers); // IN rows by join time, capped
    const squad = new Set(ordered);
    const earlyBird = ordered[0]; // earliest to say "Vou" — undefined if nobody was IN
    if (earlyBird) acc.get(earlyBird)!.early++;
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

    // v3: win/draw/loss for the players on a team, when this game has a recorded score.
    // Win-streak runs over each player's OWN result-games in chronological order; a game
    // they didn't play (no team row) is simply absent — it neither extends nor breaks it.
    const result = resultByGame.get(game.id);
    const gameTeams = teamsByGame.get(game.id);
    if (result && gameTeams) {
      for (const t of gameTeams) {
        const a = acc.get(t.tgUserId);
        if (!a) continue;
        const mine = t.side === 'A' ? result.goalsA : result.goalsB;
        const theirs = t.side === 'A' ? result.goalsB : result.goalsA;
        a.resultGames++;
        if (mine > theirs) {
          a.wins++;
          a.winRun++;
          if (a.winRun > a.bestWin) a.bestWin = a.winRun;
        } else if (mine < theirs) {
          a.losses++;
          a.winRun = 0;
        } else {
          a.draws++;
          a.winRun = 0;
        }
      }
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
      earlyBirdWins: a.early,
      resultGames: a.resultGames,
      wins: a.wins,
      draws: a.draws,
      losses: a.losses,
      winPct: a.resultGames >= MIN_GAMES_FOR_WINRATE ? Math.round((100 * a.wins) / a.resultGames) : null,
      currentWinStreak: a.winRun,
      bestWinStreak: a.bestWin,
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
export function topByBestStreak(stats: Stats, n: number): PlayerStat[] {
  return stats.players
    .filter((p) => p.bestStreak > 0)
    .sort((a, b) => b.bestStreak - a.bestStreak || byName(a, b))
    .slice(0, n);
}
export function topByEarlyBird(stats: Stats, n: number): PlayerStat[] {
  return stats.players
    .filter((p) => p.earlyBirdWins > 0)
    .sort((a, b) => b.earlyBirdWins - a.earlyBirdWins || byName(a, b))
    .slice(0, n);
}
/** 💯 100% present-while-confirmed across at least PERFECT_RECORD_MIN_GAMES confirmed games. */
export function perfectRecord(stats: Stats, n: number): PlayerStat[] {
  return stats.players
    .filter((p) => p.confirmedFor >= PERFECT_RECORD_MIN_GAMES && p.ghosts === 0)
    .sort((a, b) => b.confirmedFor - a.confirmedFor || byName(a, b))
    .slice(0, n);
}

// ---------- 🏆 result boards (only games with a recorded score) ----------
export function topByWins(stats: Stats, n: number): PlayerStat[] {
  return stats.players
    .filter((p) => p.wins > 0)
    .sort((a, b) => b.wins - a.wins || (b.winPct ?? -1) - (a.winPct ?? -1) || byName(a, b))
    .slice(0, n);
}
export function topByWinPct(stats: Stats, n: number): PlayerStat[] {
  return stats.players
    .filter((p) => p.winPct != null)
    .sort((a, b) => b.winPct! - a.winPct! || b.resultGames - a.resultGames || byName(a, b))
    .slice(0, n);
}
export function topByBestWinStreak(stats: Stats, n: number): PlayerStat[] {
  return stats.players
    .filter((p) => p.bestWinStreak > 0)
    .sort((a, b) => b.bestWinStreak - a.bestWinStreak || byName(a, b))
    .slice(0, n);
}

// ---------- 🏆 Jogador do Mês (composite score over a period's stats) ----------
/** Raw present-while-confirmed ratio (0..1), ungated — 0 when never confirmed. */
export function reliabilityRatio(p: PlayerStat): number {
  return p.confirmedFor > 0 ? (p.confirmedFor - p.ghosts) / p.confirmedFor : 0;
}
/** Same ratio as a 0..100 percent, or null when the player was never in a confirmed squad. */
export function reliabilityRawPct(p: PlayerStat): number | null {
  return p.confirmedFor > 0 ? Math.round(100 * reliabilityRatio(p)) : null;
}
/** The composite Jogador do Mês score (see config for the weights). */
export function motmScore(p: PlayerStat): number {
  return (
    MOTM_W_APPEARANCE * p.appearances +
    MOTM_W_STREAK * p.bestStreak +
    Math.round(MOTM_W_RELIABILITY * reliabilityRatio(p)) -
    MOTM_W_GHOST * p.ghosts
  );
}
/**
 * The single Jogador do Mês for a period's Stats, or null if nobody qualifies
 * (too few games this period, or no one showed up to enough of them).
 */
export function playerOfTheMonth(stats: Stats): PlayerStat | null {
  if (stats.totalGames < MIN_GAMES_FOR_MOTM) return null;
  const ranked = stats.players
    .filter((p) => p.appearances >= MOTM_MIN_APPEARANCES)
    .sort(
      (a, b) =>
        motmScore(b) - motmScore(a) ||
        b.appearances - a.appearances ||
        reliabilityRatio(b) - reliabilityRatio(a) ||
        a.ghosts - b.ghosts ||
        byName(a, b),
    );
  return ranked[0] ?? null;
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
      earlyBirdWins: 0,
      resultGames: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winPct: null,
      currentWinStreak: 0,
      bestWinStreak: 0,
    }
  );
}

/** 1-based rank of a player within an ordered board, or null if not present. */
export function rankIn(board: PlayerStat[], userId: string): number | null {
  const i = board.findIndex((p) => p.tgUserId === userId);
  return i === -1 ? null : i + 1;
}
