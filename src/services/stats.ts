// Loads all-time stats for a chat from the repo and runs the pure aggregator.
import type { Repo } from '../db/repo';
import { computeStats, type Stats, type StatsInput } from '../core/stats';

/** Load the raw aggregation input once (so a caller can compute several windows from it). */
export async function loadStatsInput(repo: Repo, chatId: string): Promise<StatsInput> {
  const games = await repo.getPlayedGames(chatId);
  const gameIds = games.map((g) => g.id);
  const [rsvps, checkins, players, results, teams] = await Promise.all([
    repo.getRsvpsForGames(gameIds),
    repo.getCheckinsForGames(gameIds),
    repo.getKnownPlayers(),
    repo.getResultsForGames(gameIds),
    repo.getResultTeamsForGames(gameIds),
  ]);
  const presentKeys = new Set(checkins.map((c) => `${c.gameId}:${c.tgUserId}`));
  const names = new Map(players.map((p) => [p.tgUserId, p.displayName]));
  return { games, rsvps, presentKeys, names, results, teams };
}

export async function loadStats(repo: Repo, chatId: string): Promise<Stats> {
  return computeStats(await loadStatsInput(repo, chatId));
}
