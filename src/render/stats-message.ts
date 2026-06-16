import { M } from '../messages';
import { esc } from '../util';
import { formatWhen } from '../core/time';
import { LEADERBOARD_TOP_N, MIN_GAMES_TO_RANK } from '../config';
import {
  topByAppearances,
  topByGhosts,
  topByReliability,
  topByStreak,
  type PlayerStat,
  type Stats,
} from '../core/stats';

const MEDALS = ['🥇', '🥈', '🥉'];
const rank = (i: number): string => MEDALS[i] ?? `${i + 1}.`;

function board(rows: PlayerStat[], value: (p: PlayerStat) => string): string[] {
  return rows.map((p, i) => `${rank(i)} ${esc(p.name)} — ${value(p)}`);
}

export function renderStats(stats: Stats, sinceLabel: string | null): string {
  if (stats.totalGames === 0) return [M.stats.title, '', M.stats.none].join('\n');

  const parts: string[] = [M.stats.title];
  if (sinceLabel) parts.push(M.stats.since(sinceLabel));
  parts.push(M.stats.totalGames(stats.totalGames), '');

  // 🏅 reliability (always shown — has its own "warming up" fallback)
  parts.push(M.stats.reliableTitle);
  const rel = topByReliability(stats, LEADERBOARD_TOP_N);
  if (rel.length === 0) parts.push(M.stats.reliableEmpty);
  else parts.push(...board(rel, (p) => M.stats.reliableLine(p.reliabilityPct!, p.confirmedFor - p.ghosts, p.confirmedFor)));

  // 👟 appearances (skip if nobody has shown up yet)
  const app = topByAppearances(stats, LEADERBOARD_TOP_N);
  if (app.length > 0) parts.push('', M.stats.appearancesTitle, ...board(app, (p) => M.stats.appearancesLine(p.appearances)));

  // 🔥 streaks (skip if none active)
  const streak = topByStreak(stats, LEADERBOARD_TOP_N);
  if (streak.length > 0) parts.push('', M.stats.streakTitle, ...board(streak, (p) => M.stats.streakLine(p.currentStreak)));

  // 👻 ghosts (always shown — fallback praises a clean week)
  parts.push('', M.stats.ghostsTitle);
  const gh = topByGhosts(stats, LEADERBOARD_TOP_N);
  if (gh.length === 0) parts.push(M.stats.ghostsEmpty);
  else parts.push(...board(gh, (p) => M.stats.ghostsLine(p.ghosts)));

  return parts.join('\n');
}

export function renderPersonalCard(p: PlayerStat, totalGames: number): string {
  const parts: string[] = [M.eu.title(esc(p.name)), ''];
  if (totalGames === 0 || (p.appearances === 0 && p.confirmedFor === 0 && p.ghosts === 0)) {
    parts.push(M.eu.none);
    return parts.join('\n');
  }
  parts.push(M.eu.appearances(p.appearances));
  if (p.reliabilityPct != null) {
    parts.push(M.eu.reliability(p.reliabilityPct, p.confirmedFor - p.ghosts, p.confirmedFor));
  } else {
    parts.push(M.eu.reliabilityWarming(Math.max(0, MIN_GAMES_TO_RANK - p.confirmedFor)));
  }
  parts.push(M.eu.streak(p.currentStreak, p.bestStreak));
  parts.push(M.eu.ghosts(p.ghosts));
  return parts.join('\n');
}

/** pt-PT "since <date>" label, or null if there's no history. */
export function sinceLabel(firstKickoff: number | null): string | null {
  return firstKickoff == null ? null : formatWhen(firstKickoff);
}
