// Loads all-time stats for a chat from the repo and runs the pure aggregator.
import type { Repo } from '../db/repo';
import { computeStats, type Stats } from '../core/stats';

export async function loadStats(repo: Repo, chatId: string): Promise<Stats> {
  const games = await repo.getPlayedGames(chatId);
  const gameIds = games.map((g) => g.id);
  const [rsvps, checkins, players] = await Promise.all([
    repo.getRsvpsForGames(gameIds),
    repo.getCheckinsForGames(gameIds),
    repo.getKnownPlayers(),
  ]);
  const presentKeys = new Set(checkins.map((c) => `${c.gameId}:${c.tgUserId}`));
  const names = new Map(players.map((p) => [p.tgUserId, p.displayName]));
  return computeStats({ games, rsvps, presentKeys, names });
}
