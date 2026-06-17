import { M } from '../messages';
import { esc } from '../util';
import { formatWhen } from '../core/time';
import { LEADERBOARD_TOP_N, MIN_GAMES_TO_RANK, MONTH_TOP_N } from '../config';
import {
  playerOfTheMonth,
  perfectRecord,
  rankIn,
  reliabilityRawPct,
  topByAppearances,
  topByAssists,
  topByBestStreak,
  topByBestWinStreak,
  topByEarlyBird,
  topByGhosts,
  topByGoals,
  topByReliability,
  topByStreak,
  topByWinPct,
  topByWins,
  type PlayerStat,
  type Stats,
} from '../core/stats';

const MEDALS = ['🥇', '🥈', '🥉'];
const rank = (i: number): string => MEDALS[i] ?? `${i + 1}.`;

function board(rows: PlayerStat[], value: (p: PlayerStat) => string): string[] {
  return rows.map((p, i) => `${rank(i)} ${esc(p.name)} — ${value(p)}`);
}

export function renderStats(stats: Stats, month: Stats, monthLabel: string, sinceLabel: string | null, golos = true, assists = true): string {
  if (stats.totalGames === 0) return [M.stats.title, '', M.stats.none].join('\n');

  const parts: string[] = [M.stats.title];
  if (sinceLabel) parts.push(M.stats.since(sinceLabel));
  parts.push(M.stats.totalGames(stats.totalGames));

  // 📅 this month: Jogador do Mês badge + a compact appearances mini-board
  parts.push('', M.stats.monthTitle(monthLabel));
  if (month.totalGames === 0) {
    parts.push(M.stats.monthNone);
  } else {
    const motm = playerOfTheMonth(month);
    if (motm) parts.push(M.stats.motmLine(esc(motm.name), motm.appearances, reliabilityRawPct(motm), motm.bestStreak));
    const mApp = topByAppearances(month, MONTH_TOP_N);
    if (mApp.length > 0)
      parts.push(M.stats.monthAppearancesTitle, ...board(mApp, (p) => M.stats.appearancesLine(p.appearances)));
  }

  // 🏅 reliability (always shown — has its own "warming up" fallback)
  parts.push('', M.stats.reliableTitle);
  const rel = topByReliability(stats, LEADERBOARD_TOP_N);
  if (rel.length === 0) parts.push(M.stats.reliableEmpty);
  else parts.push(...board(rel, (p) => M.stats.reliableLine(p.reliabilityPct!, p.confirmedFor - p.ghosts, p.confirmedFor)));

  // 👟 appearances (skip if nobody has shown up yet)
  const app = topByAppearances(stats, LEADERBOARD_TOP_N);
  if (app.length > 0) parts.push('', M.stats.appearancesTitle, ...board(app, (p) => M.stats.appearancesLine(p.appearances)));

  // 🔥 current streaks (skip if none active)
  const streak = topByStreak(stats, LEADERBOARD_TOP_N);
  if (streak.length > 0) parts.push('', M.stats.streakTitle, ...board(streak, (p) => M.stats.streakLine(p.currentStreak)));

  // 📈 best streak ever (skip if nobody has a run yet)
  const best = topByBestStreak(stats, LEADERBOARD_TOP_N);
  if (best.length > 0) parts.push('', M.stats.bestStreakTitle, ...board(best, (p) => M.stats.bestStreakLine(p.bestStreak)));

  // 🐦 early bird (skip if nobody has been first to confirm)
  const early = topByEarlyBird(stats, LEADERBOARD_TOP_N);
  if (early.length > 0) parts.push('', M.stats.earlyBirdTitle, ...board(early, (p) => M.stats.earlyBirdLine(p.earlyBirdWins)));

  // 💯 perfect record (skip until someone earns it)
  const perfect = perfectRecord(stats, LEADERBOARD_TOP_N);
  if (perfect.length > 0) parts.push('', M.stats.perfectTitle, ...board(perfect, (p) => M.stats.perfectLine(p.confirmedFor)));

  // 🏆 most wins (skip until a result is recorded)
  const wins = topByWins(stats, LEADERBOARD_TOP_N);
  if (wins.length > 0) parts.push('', M.stats.winsTitle, ...board(wins, (p) => M.stats.winsLine(p.wins)));

  // 🎯 best win rate (gated, like reliability)
  const winPct = topByWinPct(stats, LEADERBOARD_TOP_N);
  if (winPct.length > 0)
    parts.push('', M.stats.winPctTitle, ...board(winPct, (p) => M.stats.winPctLine(p.winPct!, p.wins, p.draws, p.losses)));

  // 🔝 longest win streak ever (skip until someone wins twice in a row)
  const winStreak = topByBestWinStreak(stats, LEADERBOARD_TOP_N);
  if (winStreak.length > 0)
    parts.push('', M.stats.winStreakTitle, ...board(winStreak, (p) => M.stats.winStreakLine(p.bestWinStreak)));

  // ⚽ goleadores (golos flag) / 🅰️ assistências (golos + assists flag); each skips until earned
  if (golos) {
    const goals = topByGoals(stats, LEADERBOARD_TOP_N);
    if (goals.length > 0) parts.push('', M.stats.goalsTitle, ...board(goals, (p) => M.stats.goalsLine(p.goals)));
    if (assists) {
      const asb = topByAssists(stats, LEADERBOARD_TOP_N);
      if (asb.length > 0) parts.push('', M.stats.assistsTitle, ...board(asb, (p) => M.stats.assistsLine(p.assists)));
    }
  }

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
export function renderPersonalCard(p: PlayerStat, stats: Stats, golos = true, assists = true): string {
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
  // result lines (only once this player has a game with a recorded score)
  if (p.resultGames > 0) {
    parts.push(M.eu.wins(p.wins, p.draws, p.losses) + rankSuffix(topByWins(stats, n), p.tgUserId));
    if (p.winPct != null) parts.push(M.eu.winPct(p.winPct) + rankSuffix(topByWinPct(stats, n), p.tgUserId));
    parts.push(M.eu.winStreak(p.currentWinStreak, p.bestWinStreak) + rankSuffix(topByBestWinStreak(stats, n), p.tgUserId));
  }
  // ⚽/🅰️ lines (feature-flagged; only once this player has the respective events)
  if (golos && p.goals > 0) parts.push(M.eu.goals(p.goals) + rankSuffix(topByGoals(stats, n), p.tgUserId));
  if (golos && assists && p.assists > 0) parts.push(M.eu.assists(p.assists) + rankSuffix(topByAssists(stats, n), p.tgUserId));
  parts.push(M.eu.ghosts(p.ghosts));
  return parts.join('\n');
}

/** Bold whichever side leads. `higherBetter=false` for metrics where lower wins (ghosts). */
function lead(a: string, b: string, av: number, bv: number, higherBetter = true): [string, string] {
  if (av === bv) return [a, b];
  const aWins = higherBetter ? av > bv : av < bv;
  return aWins ? [`**${a}**`, b] : [a, `**${b}**`];
}

export function renderComparison(a: PlayerStat, b: PlayerStat, golos = true, assists = true): string {
  const parts: string[] = [M.comparar.title(esc(a.name), esc(b.name)), ''];

  const [appA, appB] = lead(String(a.appearances), String(b.appearances), a.appearances, b.appearances);
  parts.push(M.comparar.appearances(appA, appB));

  // null reliability (not enough games) shows as "—" and counts as -1 so it never "wins".
  const relFmt = (v: number | null) => (v == null ? '—' : `${v}%`);
  const [relA, relB] = lead(relFmt(a.reliabilityPct), relFmt(b.reliabilityPct), a.reliabilityPct ?? -1, b.reliabilityPct ?? -1);
  parts.push(M.comparar.reliability(relA, relB));

  const [stA, stB] = lead(String(a.currentStreak), String(b.currentStreak), a.currentStreak, b.currentStreak);
  parts.push(M.comparar.streak(stA, stB, a.bestStreak, b.bestStreak));

  const [wA, wB] = lead(String(a.wins), String(b.wins), a.wins, b.wins);
  parts.push(M.comparar.wins(wA, wB));

  const wpFmt = (v: number | null) => (v == null ? '—' : `${v}%`);
  const [wpA, wpB] = lead(wpFmt(a.winPct), wpFmt(b.winPct), a.winPct ?? -1, b.winPct ?? -1);
  parts.push(M.comparar.winPct(wpA, wpB));

  const [wsA, wsB] = lead(String(a.currentWinStreak), String(b.currentWinStreak), a.currentWinStreak, b.currentWinStreak);
  parts.push(M.comparar.winStreak(wsA, wsB, a.bestWinStreak, b.bestWinStreak));

  if (golos) {
    const [gA, gB] = lead(String(a.goals), String(b.goals), a.goals, b.goals);
    parts.push(M.comparar.goals(gA, gB));
    if (assists) {
      const [asA, asB] = lead(String(a.assists), String(b.assists), a.assists, b.assists);
      parts.push(M.comparar.assists(asA, asB));
    }
  }

  const [ghA, ghB] = lead(String(a.ghosts), String(b.ghosts), a.ghosts, b.ghosts, false);
  parts.push(M.comparar.ghosts(ghA, ghB));

  return parts.join('\n');
}

/** /topmarcadores — the ⚽ Goleadores board (+ 🅰️ Assistências when enabled), with an empty state. */
export function renderTopScorers(stats: Stats, assists = true): string {
  const goals = topByGoals(stats, LEADERBOARD_TOP_N);
  const asb = assists ? topByAssists(stats, LEADERBOARD_TOP_N) : [];
  if (goals.length === 0 && asb.length === 0) return [M.stats.topTitle, '', M.stats.topNone].join('\n');
  const parts: string[] = [M.stats.topTitle];
  if (goals.length > 0) parts.push('', M.stats.goalsTitle, ...board(goals, (p) => M.stats.goalsLine(p.goals)));
  if (asb.length > 0) parts.push('', M.stats.assistsTitle, ...board(asb, (p) => M.stats.assistsLine(p.assists)));
  return parts.join('\n');
}

/** pt-PT "since <date>" label, or null if there's no history. */
export function sinceLabel(firstKickoff: number | null): string | null {
  return firstKickoff == null ? null : formatWhen(firstKickoff);
}
