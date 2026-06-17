// Loads one page of the 📜 histórico for a chat — either every PLAYED game (newest first)
// or just the games a given player was present for, with their side + the score. Stateless:
// the page number rides in the button custom_id, so each tap re-queries from here.
import type { Repo } from '../db/repo';
import type { EventKind, ResultSide } from '../types';
import { HISTORY_PAGE_SIZE } from '../config';

export interface HistoryEntry {
  kickoffAt: number;
  goalsA: number | null; // null until a score is recorded
  goalsB: number | null;
  side: ResultSide | null; // the player's team (per-person view only); null for the global list
  scorer: string | null; // global view: the game's top scorer's name (null if no goals captured)
  myGoals: number; // per-person view: this player's goals that game
  myAssists: number; // per-person view: this player's assists that game
}

type GameEvent = { gameId: number; tgUserId: string; kind: EventKind };

/** Group events by game id. */
function eventsByGame(events: GameEvent[]): Map<number, GameEvent[]> {
  const m = new Map<number, GameEvent[]>();
  for (const e of events) {
    const arr = m.get(e.gameId);
    if (arr) arr.push(e);
    else m.set(e.gameId, [e]);
  }
  return m;
}

/** The name of the player with the most goals in a game (tie → alphabetical), or null if none. */
function topScorerName(events: GameEvent[], names: Map<string, string>): string | null {
  const goals = new Map<string, number>();
  for (const e of events) if (e.kind === 'G') goals.set(e.tgUserId, (goals.get(e.tgUserId) ?? 0) + 1);
  const ranked = [...goals.entries()]
    .map(([id, n]) => ({ name: names.get(id) ?? 'Jogador', n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  return ranked[0]?.name ?? null;
}
export interface HistoryView {
  name: string | null; // null = global list; set = a single player's history
  tgUserId: string | null;
  entries: HistoryEntry[];
  page: number; // 0-based, already clamped to a valid page
  totalPages: number; // always >= 1
}

/** Clamp a requested page into [0, totalPages) and return its 0-based offset. */
function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(0, page), totalPages - 1);
}

export async function loadHistory(
  repo: Repo,
  chatId: string,
  page: number,
  tgUserId: string | null,
  name: string | null,
  golos = true,
  assists = true,
): Promise<HistoryView> {
  const size = HISTORY_PAGE_SIZE;

  if (tgUserId) {
    const displayName = name ?? (await repo.getPlayerName(tgUserId)) ?? 'Jogador';
    const total = await repo.countPlayedGamesForPlayer(chatId, tgUserId);
    const totalPages = Math.max(1, Math.ceil(total / size));
    const p = clampPage(page, totalPages);
    const rows = total === 0 ? [] : await repo.getHistoryPageForPlayer(chatId, tgUserId, size, p * size);
    const byGame = eventsByGame(golos ? await repo.getGoalEventsForGames(rows.map((r) => r.id)) : []);
    return {
      name: displayName,
      tgUserId,
      entries: rows.map((r) => {
        const ev = byGame.get(r.id) ?? [];
        return {
          kickoffAt: r.kickoffAt,
          goalsA: r.goalsA,
          goalsB: r.goalsB,
          side: r.side,
          scorer: null,
          myGoals: ev.filter((e) => e.tgUserId === tgUserId && e.kind === 'G').length,
          myAssists: assists ? ev.filter((e) => e.tgUserId === tgUserId && e.kind === 'A').length : 0,
        };
      }),
      page: p,
      totalPages,
    };
  }

  const total = await repo.countPlayedGames(chatId);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const p = clampPage(page, totalPages);
  const rows = total === 0 ? [] : await repo.getHistoryPage(chatId, size, p * size);
  const byGame = eventsByGame(golos ? await repo.getGoalEventsForGames(rows.map((r) => r.id)) : []);
  const names = !golos || rows.length === 0 ? new Map<string, string>() : new Map((await repo.getKnownPlayers()).map((pl) => [pl.tgUserId, pl.displayName]));
  return {
    name: null,
    tgUserId: null,
    entries: rows.map((r) => ({
      kickoffAt: r.kickoffAt,
      goalsA: r.goalsA,
      goalsB: r.goalsB,
      side: null,
      scorer: topScorerName(byGame.get(r.id) ?? [], names),
      myGoals: 0,
      myAssists: 0,
    })),
    page: p,
    totalPages,
  };
}
