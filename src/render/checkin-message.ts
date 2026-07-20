import { M } from '../messages';
import { discordTs } from '../core/time';
import { bulletList } from './list';

export interface RenderCheckinOpts {
  winnerLabel: string;
  present: { displayName: string }[]; // already checked in (incl. subs)
  pending: { displayName: string }[]; // confirmed squad not yet checked in
  checkinCloseAt: number | null;
}

const bullets = (items: { displayName: string }[]): string => bulletList(items, M.checkin.empty);

export function renderCheckinBoard(o: RenderCheckinOpts): string {
  const parts: string[] = [M.checkin.title(o.winnerLabel), ''];
  parts.push(M.checkin.present(o.present.length), bullets(o.present));
  parts.push('', M.checkin.pending(o.pending.length), bullets(o.pending));
  if (o.checkinCloseAt != null) parts.push('', M.checkin.closesAt(discordTs(o.checkinCloseAt)));
  return parts.join('\n');
}
