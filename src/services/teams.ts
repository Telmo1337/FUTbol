// Orchestration for the ⚔️ Equipas + 📊 Resultado flow: posting boards, applying the
// admin's team picks, publishing, and recording the score. Pure splitting lives in
// core/rsvp; rendering in render/teams-message; SQL in db/repo. This is the wiring.
import type { Sender } from '../discord/rest';
import type { Repo } from '../db/repo';
import type { Game, ResultSide } from '../types';
import { splitSquad } from '../core/rsvp';
import { formatDay } from '../core/time';
import { editBoard, sendBoard } from './board';
import { captureBoardComponents, teamsBoardComponents, teamsPlaceholderComponents, type TeamMember } from '../discord/components';
import { renderResultCard, renderTeamsBoard, renderTeamsPlaceholder, type TeamsView } from '../render/teams-message';

/** Everything the panel/board needs: the confirmed squad (select options) + current sides. */
export interface TeamsState {
  squad: TeamMember[]; // confirmed squad, ordered — the options the admin picks from
  aIds: Set<string>;
  bIds: Set<string>;
  view: TeamsView; // alpha / beta / out, for rendering
}

/** Read the confirmed squad + current team assignment for a game. */
export async function loadTeamsState(repo: Repo, game: Game): Promise<TeamsState> {
  const rsvps = await repo.getRsvps(game.id);
  const squad: TeamMember[] = splitSquad(rsvps, game.capPlayers).confirmed.map((r) => ({
    tgUserId: r.tgUserId,
    displayName: r.displayName,
  }));
  const teams = await repo.getResultTeams(game.id);
  const aIds = new Set(teams.filter((t) => t.side === 'A').map((t) => t.tgUserId));
  const bIds = new Set(teams.filter((t) => t.side === 'B').map((t) => t.tgUserId));
  const alpha = squad.filter((m) => aIds.has(m.tgUserId));
  const beta = squad.filter((m) => bIds.has(m.tgUserId));
  const out = squad.filter((m) => !aIds.has(m.tgUserId) && !bIds.has(m.tgUserId));
  return { squad, aIds, bIds, view: { alpha, beta, out } };
}

/** Auto-posted public placeholder when the squad confirms; carries the admin's entry button. */
export async function postTeamsPlaceholder(api: Sender, repo: Repo, game: Game, now: number): Promise<void> {
  const msgId = await sendBoard(api, game.chatId, renderTeamsPlaceholder(), teamsPlaceholderComponents(game.id));
  await repo.setTeamsMsg(game.id, msgId, now);
}

/**
 * Apply an admin's pick for one side: that side becomes exactly `ids` (squad members only),
 * and anyone newly picked is removed from the other side. The other side is otherwise kept.
 */
export async function applyTeamSelect(repo: Repo, game: Game, side: ResultSide, ids: string[]): Promise<void> {
  const rsvps = await repo.getRsvps(game.id);
  const squadIds = new Set(splitSquad(rsvps, game.capPlayers).confirmed.map((r) => r.tgUserId));
  const chosen = ids.filter((id) => squadIds.has(id));
  const chosenSet = new Set(chosen);
  const other: ResultSide = side === 'A' ? 'B' : 'A';
  const teams = await repo.getResultTeams(game.id);
  const rows: { tgUserId: string; side: ResultSide }[] = [];
  for (const t of teams) {
    if (t.side === other && !chosenSet.has(t.tgUserId)) rows.push({ tgUserId: t.tgUserId, side: other });
  }
  for (const id of chosen) rows.push({ tgUserId: id, side });
  await repo.replaceTeams(game.id, rows);
}

/** Publish the teams (reveal the public board). Returns false if a team is empty. */
export async function publishTeams(api: Sender, repo: Repo, game: Game, now: number): Promise<boolean> {
  const state = await loadTeamsState(repo, game);
  if (state.view.alpha.length === 0 || state.view.beta.length === 0) return false;
  await repo.lockTeams(game.id, now);
  if (game.teamsMsgId) {
    await editBoard(api, game.chatId, game.teamsMsgId, renderTeamsBoard(state.view), teamsBoardComponents(game.id));
  }
  return true;
}

/** Save the score and post the public result card. `captureButton` adds the ⚽ panel button. */
export async function recordResult(
  api: Sender,
  repo: Repo,
  game: Game,
  goalsA: number,
  goalsB: number,
  recordedBy: string,
  now: number,
  captureButton = true,
): Promise<void> {
  await repo.saveResult(game.id, goalsA, goalsB, recordedBy, now);
  const state = await loadTeamsState(repo, game);
  // Date the card from the winning slot's kickoff, so it's always clear which game this is.
  const slot = game.winningSlotId ? await repo.getSlot(game.winningSlotId) : null;
  const dayLabel = slot ? formatDay(slot.kickoffAt) : '';
  // The card carries an admin-only "⚽ Golos & assists" button (when the feature is on).
  await sendBoard(
    api,
    game.chatId,
    renderResultCard(state.view, goalsA, goalsB, dayLabel),
    captureButton ? captureBoardComponents(game.id) : [],
  );
}
