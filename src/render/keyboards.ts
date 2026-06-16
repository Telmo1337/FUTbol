// Inline keyboards + typed callback_data encode/decode.
// callback_data is capped at 64 bytes, so we use short codes (e.g. "r:12:I").
import { InlineKeyboard } from 'grammy';
import { M } from '../messages';
import type { RsvpStatus, Slot } from '../types';

export type ParsedCb =
  | { kind: 'vote'; gameId: number; slotId: number }
  | { kind: 'rsvp'; gameId: number; status: RsvpStatus }
  | { kind: 'tie'; gameId: number; slotId: number }
  | { kind: 'checkin'; gameId: number }
  | { kind: 'unghost'; gameId: number; tgUserId: number };

const RSVP_CODE: Record<string, RsvpStatus | undefined> = { I: 'IN', O: 'OUT', M: 'MAYBE' };

export function parseCb(data: string): ParsedCb | null {
  const p = data.split(':');
  const gameId = Number(p[1]);
  if (!Number.isFinite(gameId)) return null;
  if (p[0] === 'v' && p.length === 3) {
    const slotId = Number(p[2]);
    return Number.isFinite(slotId) ? { kind: 'vote', gameId, slotId } : null;
  }
  if (p[0] === 'r' && p.length === 3) {
    const status = RSVP_CODE[p[2]];
    return status ? { kind: 'rsvp', gameId, status } : null;
  }
  if (p[0] === 'tb' && p.length === 3) {
    const slotId = Number(p[2]);
    return Number.isFinite(slotId) ? { kind: 'tie', gameId, slotId } : null;
  }
  if (p[0] === 'ci' && p.length === 2) {
    return { kind: 'checkin', gameId };
  }
  if (p[0] === 'ug' && p.length === 3) {
    const tgUserId = Number(p[2]);
    return Number.isFinite(tgUserId) ? { kind: 'unghost', gameId, tgUserId } : null;
  }
  return null;
}

export function voteKeyboard(gameId: number, slots: Slot[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const s of slots) kb.text(s.label, `v:${gameId}:${s.id}`).row();
  return kb;
}

export function rsvpKeyboard(gameId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text(M.rsvp.buttons.in, `r:${gameId}:I`)
    .text(M.rsvp.buttons.out, `r:${gameId}:O`)
    .text(M.rsvp.buttons.maybe, `r:${gameId}:M`);
}

export function tieKeyboard(gameId: number, slots: Slot[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const s of slots) kb.text(s.label, `tb:${gameId}:${s.id}`).row();
  return kb;
}

export function checkinKeyboard(gameId: number): InlineKeyboard {
  return new InlineKeyboard().text(M.checkin.button, `ci:${gameId}`);
}

/** One "X jogou" button per ghost (admin-only clear). No keyboard when there are no ghosts. */
export function recapKeyboard(
  gameId: number,
  ghosts: { tgUserId: number; displayName: string }[],
): InlineKeyboard | undefined {
  if (ghosts.length === 0) return undefined;
  const kb = new InlineKeyboard();
  for (const g of ghosts) kb.text(M.recap.ghostButton(g.displayName), `ug:${gameId}:${g.tgUserId}`).row();
  return kb;
}
