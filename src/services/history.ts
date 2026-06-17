// Loads one page of the 📜 histórico for a chat — either every PLAYED game (newest first)
// or just the games a given player was present for, with their side + the score. Stateless:
// the page number rides in the button custom_id, so each tap re-queries from here.
import type { Repo } from '../db/repo';
import type { ResultSide } from '../types';
import { HISTORY_PAGE_SIZE } from '../config';

export interface HistoryEntry {
  kickoffAt: number;
  goalsA: number | null; // null until a score is recorded
  goalsB: number | null;
  side: ResultSide | null; // the player's team (per-person view only); null for the global list
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
): Promise<HistoryView> {
  const size = HISTORY_PAGE_SIZE;

  if (tgUserId) {
    const displayName = name ?? (await repo.getPlayerName(tgUserId)) ?? 'Jogador';
    const total = await repo.countPlayedGamesForPlayer(chatId, tgUserId);
    const totalPages = Math.max(1, Math.ceil(total / size));
    const p = clampPage(page, totalPages);
    const rows = total === 0 ? [] : await repo.getHistoryPageForPlayer(chatId, tgUserId, size, p * size);
    return {
      name: displayName,
      tgUserId,
      entries: rows.map((r) => ({ kickoffAt: r.kickoffAt, goalsA: r.goalsA, goalsB: r.goalsB, side: r.side })),
      page: p,
      totalPages,
    };
  }

  const total = await repo.countPlayedGames(chatId);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const p = clampPage(page, totalPages);
  const rows = total === 0 ? [] : await repo.getHistoryPage(chatId, size, p * size);
  return {
    name: null,
    tgUserId: null,
    entries: rows.map((r) => ({ kickoffAt: r.kickoffAt, goalsA: r.goalsA, goalsB: r.goalsB, side: null })),
    page: p,
    totalPages,
  };
}
