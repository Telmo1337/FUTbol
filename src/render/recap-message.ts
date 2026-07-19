import { M } from '../messages';
import { bulletList } from './list';

export interface RenderRecapOpts {
  winnerLabel: string;
  present: { displayName: string }[]; // showed up (incl. subs)
  ghosts: { displayName: string }[]; // confirmed but no check-in
}

const list = (items: { displayName: string }[]): string => bulletList(items, M.recap.empty);

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
