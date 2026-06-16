// Discord message components (buttons in action rows) + typed custom_id encode/decode.
// custom_id is capped at 100 chars (plenty), so we keep the short codes from v1
// (e.g. "r:12:I", "v:12:34", "ug:12:<userId>").
import { M } from '../messages';
import type { RsvpStatus, Slot } from '../types';

export type ParsedCb =
  | { kind: 'vote'; gameId: number; slotId: number }
  | { kind: 'rsvp'; gameId: number; status: RsvpStatus }
  | { kind: 'tie'; gameId: number; slotId: number }
  | { kind: 'checkin'; gameId: number }
  | { kind: 'unghost'; gameId: number; tgUserId: string };

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
  if (p[0] === 'ug' && p.length === 3 && p[2]) {
    return { kind: 'unghost', gameId, tgUserId: p[2] };
  }
  return null;
}

// ---- builders ----
// Component types: 1 = action row, 2 = button.  Button styles: 1 primary, 2 secondary, 3 success, 4 danger.
const STYLE = { primary: 1, secondary: 2, success: 3, danger: 4 } as const;
type Style = (typeof STYLE)[keyof typeof STYLE];

interface Button {
  type: 2;
  style: Style;
  label: string;
  custom_id: string;
}
interface ActionRow {
  type: 1;
  components: Button[];
}

function button(label: string, customId: string, style: Style): Button {
  return { type: 2, style, label: label.slice(0, 80), custom_id: customId };
}

/** Pack buttons into action rows: max 5 buttons/row, max 5 rows (Discord's cap = 25 buttons). */
function rows(buttons: Button[]): ActionRow[] {
  const out: ActionRow[] = [];
  for (let i = 0; i < buttons.length && out.length < 5; i += 5) {
    out.push({ type: 1, components: buttons.slice(i, i + 5) });
  }
  return out;
}

export function voteComponents(gameId: number, slots: Slot[]): ActionRow[] {
  return rows(slots.map((s) => button(s.label, `v:${gameId}:${s.id}`, STYLE.primary)));
}

export function rsvpComponents(gameId: number): ActionRow[] {
  return [
    {
      type: 1,
      components: [
        button(M.rsvp.buttons.in, `r:${gameId}:I`, STYLE.success),
        button(M.rsvp.buttons.out, `r:${gameId}:O`, STYLE.danger),
        button(M.rsvp.buttons.maybe, `r:${gameId}:M`, STYLE.secondary),
      ],
    },
  ];
}

export function tieComponents(gameId: number, slots: Slot[]): ActionRow[] {
  return rows(slots.map((s) => button(s.label, `tb:${gameId}:${s.id}`, STYLE.primary)));
}

export function checkinComponents(gameId: number): ActionRow[] {
  return [{ type: 1, components: [button(M.checkin.button, `ci:${gameId}`, STYLE.success)] }];
}

/** One "X jogou" button per ghost (admin-only clear). Undefined when there are no ghosts. */
export function recapComponents(
  gameId: number,
  ghosts: { tgUserId: string; displayName: string }[],
): ActionRow[] | undefined {
  if (ghosts.length === 0) return undefined;
  return rows(ghosts.map((g) => button(M.recap.ghostButton(g.displayName), `ug:${gameId}:${g.tgUserId}`, STYLE.secondary)));
}
