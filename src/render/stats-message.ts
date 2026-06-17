import { M } from '../messages';
import { esc } from '../util';
import { formatWhen } from '../core/time';
import { LEADERBOARD_TOP_N, MIN_GAMES_TO_RANK } from '../config';
import {
  rankIn,
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

/** " · 3º de 12" suffix for a player's position on a board, or '' if they're not on it. */
function rankSuffix(board: PlayerStat[], userId: string): string {
  const pos = rankIn(board, userId);
  return pos ? M.eu.rankSuffix(pos, board.length) : '';
}

// Shared by /eu (private) and /stats jogador:@X (public) — same card, different visibility.
export function renderPersonalCard(p: PlayerStat, stats: Stats): string {
  const parts: string[] = [M.eu.title(esc(p.name)), ''];
  if (stats.totalGames === 0 || (p.appearances === 0 && p.confirmedFor === 0 && p.ghosts === 0)) {
    parts.push(M.eu.none);
    return parts.join('\n');
  }
  const n = stats.players.length; // full board → true position, not just the top N
  parts.push(M.eu.appearances(p.appearances) + rankSuffix(topByAppearances(stats, n), p.tgUserId));
  if (p.reliabilityPct != null) {
    parts.push(
      M.eu.reliability(p.reliabilityPct, p.confirmedFor - p.ghosts, p.confirmedFor) +
        rankSuffix(topByReliability(stats, n), p.tgUserId),
    );
  } else {
    parts.push(M.eu.reliabilityWarming(Math.max(0, MIN_GAMES_TO_RANK - p.confirmedFor)));
  }
  parts.push(M.eu.streak(p.currentStreak, p.bestStreak) + rankSuffix(topByStreak(stats, n), p.tgUserId));
  parts.push(M.eu.ghosts(p.ghosts));
  return parts.join('\n');
}

/** Bold whichever side leads. `higherBetter=false` for metrics where lower wins (ghosts). */
function lead(a: string, b: string, av: number, bv: number, higherBetter = true): [string, string] {
  if (av === bv) return [a, b];
  const aWins = higherBetter ? av > bv : av < bv;
  return aWins ? [`**${a}**`, b] : [a, `**${b}**`];
}

export function renderComparison(a: PlayerStat, b: PlayerStat): string {
  const parts: string[] = [M.comparar.title(esc(a.name), esc(b.name)), ''];

  const [appA, appB] = lead(String(a.appearances), String(b.appearances), a.appearances, b.appearances);
  parts.push(M.comparar.appearances(appA, appB));

  // null reliability (not enough games) shows as "—" and counts as -1 so it never "wins".
  const relFmt = (v: number | null) => (v == null ? '—' : `${v}%`);
  const [relA, relB] = lead(relFmt(a.reliabilityPct), relFmt(b.reliabilityPct), a.reliabilityPct ?? -1, b.reliabilityPct ?? -1);
  parts.push(M.comparar.reliability(relA, relB));

  const [stA, stB] = lead(String(a.currentStreak), String(b.currentStreak), a.currentStreak, b.currentStreak);
  parts.push(M.comparar.streak(stA, stB, a.bestStreak, b.bestStreak));

  const [ghA, ghB] = lead(String(a.ghosts), String(b.ghosts), a.ghosts, b.ghosts, false);
  parts.push(M.comparar.ghosts(ghA, ghB));

  return parts.join('\n');
}

/** pt-PT "since <date>" label, or null if there's no history. */
export function sinceLabel(firstKickoff: number | null): string | null {
  return firstKickoff == null ? null : formatWhen(firstKickoff);
}
