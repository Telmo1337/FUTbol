import { M } from '../messages';
import { esc } from '../util';
import { discordTs } from '../core/time';
import type { SquadSplit } from '../core/rsvp';

export interface RenderRsvpOpts {
  loc: string;
  winnerLabel: string;
  min: number;
  cap: number;
  split: SquadSplit;
  rsvpCloseAt: number | null;
  state: 'open' | 'locked' | 'cancelled';
}

function numbered(items: { displayName: string }[]): string {
  if (items.length === 0) return M.rsvp.empty;
  return items.map((p, i) => `${i + 1}. ${esc(p.displayName)}`).join('\n');
}
function bullets(items: { displayName: string }[]): string {
  return items.map((p) => `• ${esc(p.displayName)}`).join('\n');
}

export function renderRsvpMessage(o: RenderRsvpOpts): string {
  const inCount = o.split.confirmed.length;
  const title =
    o.state === 'locked'
      ? M.rsvp.lockedTitle(o.winnerLabel)
      : o.state === 'cancelled'
        ? M.rsvp.cancelledTitle(o.winnerLabel)
        : M.rsvp.markedTitle(o.winnerLabel);

  const parts: string[] = [title, `📍 ${esc(o.loc)}`, ''];
  parts.push(M.rsvp.confirmed(inCount, o.cap), numbered(o.split.confirmed));
  if (o.split.waitlist.length > 0) parts.push('', M.rsvp.waitlist(o.split.waitlist.length), bullets(o.split.waitlist));
  if (o.split.maybe.length > 0) parts.push('', M.rsvp.maybe(o.split.maybe.length), bullets(o.split.maybe));
  if (o.split.out.length > 0) parts.push('', M.rsvp.out(o.split.out.length), bullets(o.split.out));

  parts.push('');
  parts.push(inCount >= o.min ? M.rsvp.confirmedLine(inCount, o.min) : M.rsvp.needMore(o.min - inCount, inCount, o.min));
  if (o.state === 'open' && o.rsvpCloseAt != null) parts.push(M.rsvp.closesAt(discordTs(o.rsvpCloseAt)));

  return parts.join('\n');
}
