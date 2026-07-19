// Renders for the ⚔️ Equipas flow: the public placeholder, the admin's private panel,
// the published teams board, and the post-game result card. Text only — the interactions
// layer wraps these in an embed and attaches the buttons/menus.
import { M } from '../messages';
import { cardEmbed, type Embed, type EmbedField } from '../discord/embeds';
import { bulletList } from './list';

export interface TeamMember {
  tgUserId: string;
  displayName: string;
}
export interface TeamsView {
  alpha: TeamMember[];
  beta: TeamMember[];
  out: TeamMember[]; // confirmed squad members the admin left out (didn't play)
}

const list = (items: { displayName: string }[]): string => bulletList(items, M.teams.empty);

/** Strip inline markdown so it isn't shown literally in an embed footer (footers are plain text). */
const plain = (s: string): string => s.replace(/[*`_~]/g, '');

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

/** The published public board — Alpha | Beta as side-by-side inline fields; "de fora" full-width. */
export function renderTeamsBoard(v: TeamsView): Embed {
  const fields: EmbedField[] = [
    { name: M.teams.alpha(v.alpha.length), value: list(v.alpha), inline: true },
    { name: M.teams.beta(v.beta.length), value: list(v.beta), inline: true },
  ];
  if (v.out.length > 0) fields.push({ name: M.teams.out(v.out.length), value: list(v.out) });
  return cardEmbed({ title: M.teams.boardTitle, fields, footer: plain(M.teams.publishedHint) });
}

/** The post-game result card: score + winner in the body, the two line-ups as inline fields. */
export function renderResultCard(v: TeamsView, goalsA: number, goalsB: number, dayLabel = ''): Embed {
  const winner = goalsA > goalsB ? M.result.winAlpha : goalsA < goalsB ? M.result.winBeta : M.result.draw;
  return cardEmbed({
    title: M.result.cardTitle(dayLabel),
    description: [M.result.score(goalsA, goalsB), winner].join('\n'),
    fields: [
      { name: M.teams.alpha(v.alpha.length), value: list(v.alpha), inline: true },
      { name: M.teams.beta(v.beta.length), value: list(v.beta), inline: true },
    ],
    footer: plain(M.result.footer),
  });
}
