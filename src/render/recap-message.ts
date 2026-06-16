import { M } from '../messages';
import { esc } from '../util';

export interface RenderRecapOpts {
  winnerLabel: string;
  present: { displayName: string }[]; // showed up (incl. subs)
  ghosts: { displayName: string }[]; // confirmed but no check-in
}

const list = (items: { displayName: string }[]): string =>
  items.length === 0 ? M.recap.empty : items.map((p) => `• ${esc(p.displayName)}`).join('\n');

export function renderRecap(o: RenderRecapOpts): string {
  const parts: string[] = [M.recap.title(o.winnerLabel), ''];
  parts.push(M.recap.played(o.present.length), list(o.present), '');
  if (o.ghosts.length === 0) {
    parts.push(M.recap.noGhosts);
  } else {
    parts.push(M.recap.ghosts(o.ghosts.length), list(o.ghosts), '', M.recap.clearHint);
  }
  parts.push('', M.recap.footer);
  return parts.join('\n');
}
