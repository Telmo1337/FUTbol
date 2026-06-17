// Renders for the ⚔️ Equipas flow: the public placeholder, the admin's private panel,
// the published teams board, and the post-game result card. Text only — the interactions
// layer wraps these in an embed and attaches the buttons/menus.
import { M } from '../messages';
import { esc } from '../util';

export interface TeamMember {
  tgUserId: string;
  displayName: string;
}
export interface TeamsView {
  alpha: TeamMember[];
  beta: TeamMember[];
  out: TeamMember[]; // confirmed squad members the admin left out (didn't play)
}

const list = (items: { displayName: string }[]): string =>
  items.length === 0 ? M.teams.empty : items.map((p) => `• ${esc(p.displayName)}`).join('\n');

function buckets(v: TeamsView): string[] {
  const parts = [M.teams.alpha(v.alpha.length), list(v.alpha), '', M.teams.beta(v.beta.length), list(v.beta)];
  if (v.out.length > 0) parts.push('', M.teams.out(v.out.length), list(v.out));
  return parts;
}

/** Public placeholder, auto-posted when the squad confirms — flips to the board on publish. */
export function renderTeamsPlaceholder(): string {
  return [M.teams.placeholderTitle, '', M.teams.placeholderBody].join('\n');
}

/** The private (ephemeral) panel the admin sees while assigning teams. */
export function renderTeamsPanel(v: TeamsView): string {
  return [M.teams.panelTitle, M.teams.panelHint, '', ...buckets(v)].join('\n');
}

/** The published public board — everyone sees the teams. */
export function renderTeamsBoard(v: TeamsView): string {
  return [M.teams.boardTitle, '', ...buckets(v), '', M.teams.publishedHint].join('\n');
}

/** The post-game result card (score + winner + the two line-ups). */
export function renderResultCard(v: TeamsView, goalsA: number, goalsB: number): string {
  const winner = goalsA > goalsB ? M.result.winAlpha : goalsA < goalsB ? M.result.winBeta : M.result.draw;
  return [
    M.result.cardTitle,
    '',
    M.result.score(goalsA, goalsB),
    winner,
    '',
    M.teams.alpha(v.alpha.length),
    list(v.alpha),
    '',
    M.teams.beta(v.beta.length),
    list(v.beta),
    '',
    M.result.footer,
  ].join('\n');
}
