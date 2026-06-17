// State for the ⚽ Golos / 🅰️ Assistências capture panel (admin-only, ephemeral).
// The squad that played = both teams (result_teams). Each pick in the panel appends a
// game_event row; "anular último" deletes the most recent of that kind. SQL lives in db/repo,
// rendering in render/capture-message, the wiring (panel + handlers) in discord/interactions.
import type { Repo } from '../db/repo';
import type { Game } from '../types';
import type { TeamMember } from '../discord/components';

export interface CaptureState {
  players: TeamMember[]; // everyone who played (Alpha then Beta) — the select options + tally order
  goals: Map<string, number>; // tgUserId -> goals so far
  assists: Map<string, number>; // tgUserId -> assists so far
  score: { a: number; b: number } | null; // recorded score, for the "X/total" hint + title
  kickoffAt: number | null; // for dating the title
}

/** Read the squad that played + the current per-player goal/assist tallies for a game. */
export async function loadCaptureState(repo: Repo, game: Game): Promise<CaptureState> {
  const [teams, names, events, result, slot] = await Promise.all([
    repo.getResultTeams(game.id),
    repo.getKnownPlayers(),
    repo.getGameEvents(game.id),
    repo.getResult(game.id),
    game.winningSlotId ? repo.getSlot(game.winningSlotId) : Promise.resolve(null),
  ]);
  const nameOf = new Map(names.map((p) => [p.tgUserId, p.displayName]));
  // Alpha first, then Beta — a stable, readable order for the select + the tally list.
  const ordered = [...teams].sort((x, y) => (x.side === y.side ? 0 : x.side === 'A' ? -1 : 1));
  const players: TeamMember[] = ordered.map((t) => ({
    tgUserId: t.tgUserId,
    displayName: nameOf.get(t.tgUserId) ?? 'Jogador',
  }));
  const goals = new Map<string, number>();
  const assists = new Map<string, number>();
  for (const e of events) {
    const m = e.kind === 'G' ? goals : assists;
    m.set(e.tgUserId, (m.get(e.tgUserId) ?? 0) + 1);
  }
  return {
    players,
    goals,
    assists,
    score: result ? { a: result.goalsA, b: result.goalsB } : null,
    kickoffAt: slot?.kickoffAt ?? null,
  };
}
