// Discord message components (buttons in action rows) + typed custom_id encode/decode.
// custom_id is capped at 100 chars (plenty), so we keep the short codes from v1
// (e.g. "r:12:I", "v:12:34", "ug:12:<userId>").
import { M } from '../messages';
import type { EventKind, ResultSide, RsvpStatus, Slot } from '../types';

export type ParsedCb =
  | { kind: 'vote'; gameId: number; slotId: number }
  | { kind: 'rsvp'; gameId: number; status: RsvpStatus }
  | { kind: 'tie'; gameId: number; slotId: number }
  | { kind: 'checkin'; gameId: number }
  | { kind: 'unghost'; gameId: number; tgUserId: string }
  | { kind: 'teamOpen'; gameId: number } // admin taps "Montar equipas" on the placeholder
  | { kind: 'teamSelect'; gameId: number; side: ResultSide } // admin picks Alpha/Beta in the panel
  | { kind: 'teamLock'; gameId: number } // admin publishes the teams
  | { kind: 'teamEdit'; gameId: number } // admin reopens the panel from the public board
  | { kind: 'resultOpen'; gameId: number } // admin opens the score modal
  | { kind: 'captureOpen'; gameId: number } // admin opens the golos/assists panel from the result card
  | { kind: 'captureAdd'; gameId: number; event: EventKind } // admin picks a scorer/assister (+1)
  | { kind: 'captureUndo'; gameId: number; event: EventKind } // admin taps "anular último"
  | { kind: 'captureDone'; gameId: number } // admin closes the panel into a read-only summary
  | { kind: 'paymentManage'; gameId: number } // admin opens the 💶 pagamentos panel from the public board
  | { kind: 'paymentToggle'; gameId: number } // admin's "who paid" multi-select submit
  | { kind: 'paymentPriceOpen'; gameId: number } // admin opens the 💶 price modal
  | { kind: 'paymentDone'; gameId: number } // admin closes the pagamentos panel
  | { kind: 'historyPage'; page: number; tgUserId: string | null }; // ◀️/▶️ in /historico

const RSVP_CODE: Record<string, RsvpStatus | undefined> = { I: 'IN', O: 'OUT', M: 'MAYBE' };

export function parseCb(data: string): ParsedCb | null {
  const p = data.split(':');
  // 📜 history pagination: hg:<page> (global) or hp:<page>:<userId> (per-person).
  // Parsed before the gameId guard below — here p[1] is a page number, not a game id.
  if (p[0] === 'hg' && p.length === 2) {
    const page = Number(p[1]);
    return Number.isFinite(page) ? { kind: 'historyPage', page, tgUserId: null } : null;
  }
  if (p[0] === 'hp' && p.length === 3 && /^\d+$/.test(p[2])) {
    // tgUserId is a Discord snowflake (digits only) — same guard as the unghost button.
    const page = Number(p[1]);
    return Number.isFinite(page) ? { kind: 'historyPage', page, tgUserId: p[2] } : null;
  }
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
  if (p[0] === 'ug' && p.length === 3 && /^\d+$/.test(p[2])) {
    // tgUserId is a Discord snowflake (digits only). It flows into a `<@id>` mention,
    // so reject anything non-numeric rather than echo it back into a message.
    return { kind: 'unghost', gameId, tgUserId: p[2] };
  }
  if (p[0] === 'topen' && p.length === 2) return { kind: 'teamOpen', gameId };
  if ((p[0] === 'tA' || p[0] === 'tB') && p.length === 2)
    return { kind: 'teamSelect', gameId, side: p[0] === 'tA' ? 'A' : 'B' };
  if (p[0] === 'tlock' && p.length === 2) return { kind: 'teamLock', gameId };
  if (p[0] === 'tedit' && p.length === 2) return { kind: 'teamEdit', gameId };
  if (p[0] === 'ropen' && p.length === 2) return { kind: 'resultOpen', gameId };
  if (p[0] === 'ggopen' && p.length === 2) return { kind: 'captureOpen', gameId };
  if ((p[0] === 'ggG' || p[0] === 'ggA') && p.length === 2)
    return { kind: 'captureAdd', gameId, event: p[0] === 'ggG' ? 'G' : 'A' };
  if ((p[0] === 'gguG' || p[0] === 'gguA') && p.length === 2)
    return { kind: 'captureUndo', gameId, event: p[0] === 'gguG' ? 'G' : 'A' };
  if (p[0] === 'ggdone' && p.length === 2) return { kind: 'captureDone', gameId };
  if (p[0] === 'pgmanage' && p.length === 2) return { kind: 'paymentManage', gameId };
  if (p[0] === 'pgtog' && p.length === 2) return { kind: 'paymentToggle', gameId };
  if (p[0] === 'pgprice' && p.length === 2) return { kind: 'paymentPriceOpen', gameId };
  if (p[0] === 'pgdone' && p.length === 2) return { kind: 'paymentDone', gameId };
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
  disabled?: boolean;
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

// ---- team formation components (v3) ----
// Component type 3 = string select. A select must be alone in its action row.
interface SelectOption {
  label: string;
  value: string;
  default?: boolean;
}
interface StringSelect {
  type: 3;
  custom_id: string;
  placeholder?: string;
  min_values: number;
  max_values: number;
  options: SelectOption[];
}
interface SelectRow {
  type: 1;
  components: StringSelect[];
}

export type TeamMember = { tgUserId: string; displayName: string };

/** The "⚙️ Montar equipas (admin)" button on the public placeholder. */
export function teamsPlaceholderComponents(gameId: number): ActionRow[] {
  return [{ type: 1, components: [button(M.teams.placeholderButton, `topen:${gameId}`, STYLE.primary)] }];
}

function teamSelectRow(gameId: number, side: ResultSide, squad: TeamMember[], chosen: Set<string>): SelectRow {
  const options: SelectOption[] = squad.slice(0, 25).map((m) => ({
    label: m.displayName.slice(0, 100),
    value: m.tgUserId,
    default: chosen.has(m.tgUserId),
  }));
  return {
    type: 1,
    components: [
      {
        type: 3,
        custom_id: side === 'A' ? `tA:${gameId}` : `tB:${gameId}`,
        placeholder: side === 'A' ? M.teams.selectAlphaPlaceholder : M.teams.selectBetaPlaceholder,
        min_values: 0,
        max_values: Math.max(1, options.length),
        options,
      },
    ],
  };
}

/** The private (ephemeral) panel: Alpha select, Beta select, "🔒 Fechar equipas". */
export function teamsPanelComponents(
  gameId: number,
  squad: TeamMember[],
  aIds: Set<string>,
  bIds: Set<string>,
): (SelectRow | ActionRow)[] {
  return [
    teamSelectRow(gameId, 'A', squad, aIds),
    teamSelectRow(gameId, 'B', squad, bIds),
    { type: 1, components: [button(M.teams.lockButton, `tlock:${gameId}`, STYLE.success)] },
  ];
}

/** The published board's admin-only controls: "✏️ Editar equipas" + "📊 Inserir resultado". */
export function teamsBoardComponents(gameId: number): ActionRow[] {
  return [
    {
      type: 1,
      components: [
        button(M.teams.editButton, `tedit:${gameId}`, STYLE.secondary),
        button(M.teams.resultButton, `ropen:${gameId}`, STYLE.primary),
      ],
    },
  ];
}

// ---- ⚽ capture panel (golos + assistências) ----
// No `default` on the options: each render is a fresh select, so re-picking the same player
// fires another +1 — that's how the admin records a player's 2nd/3rd goal.
function captureSelectRow(gameId: number, event: EventKind, players: TeamMember[]): SelectRow {
  const options: SelectOption[] = players.slice(0, 25).map((m) => ({
    label: m.displayName.slice(0, 100),
    value: m.tgUserId,
  }));
  return {
    type: 1,
    components: [
      {
        type: 3,
        custom_id: event === 'G' ? `ggG:${gameId}` : `ggA:${gameId}`,
        placeholder: event === 'G' ? M.capture.goalSelect : M.capture.assistSelect,
        min_values: 1,
        max_values: 1,
        options,
      },
    ],
  };
}

/** The admin's private (ephemeral) capture panel. With `assists`, includes the 🅰️ select + undo. */
export function capturePanelComponents(gameId: number, players: TeamMember[], assists = true): (SelectRow | ActionRow)[] {
  const rows: (SelectRow | ActionRow)[] = [];
  // A string select must carry 1–25 options — omit the selects entirely if nobody played
  // (defensive: today result_teams is always non-empty when a result card exists).
  if (players.length > 0) {
    rows.push(captureSelectRow(gameId, 'G', players));
    if (assists) rows.push(captureSelectRow(gameId, 'A', players));
  }
  const controls: Button[] = [button(M.capture.undoGoal, `gguG:${gameId}`, STYLE.secondary)];
  if (assists) controls.push(button(M.capture.undoAssist, `gguA:${gameId}`, STYLE.secondary));
  controls.push(button(M.capture.done, `ggdone:${gameId}`, STYLE.success));
  rows.push({ type: 1, components: controls });
  return rows;
}

/** The admin-only "⚽ Golos & assists" button on the public result card (reopen the panel). */
export function captureBoardComponents(gameId: number): ActionRow[] {
  return [{ type: 1, components: [button(M.teams.captureButton, `ggopen:${gameId}`, STYLE.primary)] }];
}

// ---- 💶 pagamentos components ----
/** The admin-only "💶 Gerir pagamentos" button on the public payment board (opens the panel). */
export function paymentBoardComponents(gameId: number): ActionRow[] {
  return [{ type: 1, components: [button(M.pay.manageButton, `pgmanage:${gameId}`, STYLE.primary)] }];
}

/**
 * The admin's private (ephemeral) payment panel: a "who paid" multi-select (re-picking the whole
 * set each time, like the team selects) + the 💶 price and ✅ done buttons.
 */
export function paymentPanelComponents(gameId: number, players: TeamMember[], paid: Set<string>): (SelectRow | ActionRow)[] {
  const rows: (SelectRow | ActionRow)[] = [];
  // A string select must carry 1–25 options — omit it entirely if the squad is somehow empty.
  if (players.length > 0) {
    const options: SelectOption[] = players.slice(0, 25).map((m) => ({
      label: m.displayName.slice(0, 100),
      value: m.tgUserId,
      default: paid.has(m.tgUserId),
    }));
    rows.push({
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `pgtog:${gameId}`,
          placeholder: M.pay.selectPlaceholder,
          min_values: 0,
          max_values: Math.max(1, options.length),
          options,
        },
      ],
    });
  }
  rows.push({
    type: 1,
    components: [
      button(M.pay.priceButton, `pgprice:${gameId}`, STYLE.secondary),
      button(M.pay.doneButton, `pgdone:${gameId}`, STYLE.success),
    ],
  });
  return rows;
}

// ---- 📜 history pagination ----
/**
 * The ◀️ · Pág. X/Y · ▶️ row for /historico. Empty when there's a single page (nothing to
 * page). The page number rides in each arrow's custom_id (hg:<page> / hp:<page>:<userId>);
 * the middle indicator is a disabled button (custom_id 'noop' — disabled buttons never fire).
 */
export function historyComponents(page: number, totalPages: number, tgUserId: string | null): ActionRow[] {
  if (totalPages <= 1) return [];
  const id = (p: number) => (tgUserId ? `hp:${p}:${tgUserId}` : `hg:${p}`);
  const prev: Button = { type: 2, style: STYLE.secondary, label: M.history.prev, custom_id: id(page - 1), disabled: page <= 0 };
  const indicator: Button = {
    type: 2,
    style: STYLE.secondary,
    label: M.history.pageIndicator(page + 1, totalPages),
    custom_id: 'noop',
    disabled: true,
  };
  const next: Button = {
    type: 2,
    style: STYLE.secondary,
    label: M.history.next,
    custom_id: id(page + 1),
    disabled: page >= totalPages - 1,
  };
  return [{ type: 1, components: [prev, indicator, next] }];
}
