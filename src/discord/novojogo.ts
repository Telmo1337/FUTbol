// The /novojogo modal (a popup form) and the parser for what the admin submits.
// Replaces v1's text-block parser: the same validation, fed by structured fields.
import { DEFAULT_CAP_PLAYERS, DEFAULT_MIN_PLAYERS, MIN_VOTE_WINDOW_MS, VOTE_MAX_WAIT_MS } from '../config';
import { formatWhen, parseDateTime } from '../core/time';
import { M } from '../messages';

export interface ParsedNovoJogo {
  locationNote: string;
  minPlayers: number;
  capPlayers: number;
  voteDeadline: number;
  slots: { kickoffAt: number; label: string }[];
}

export interface NovoJogoFields {
  slots: string; // multiline: one "DD/MM HH:MM" per line
  local?: string;
  players?: string; // "min-max"
  deadline?: string; // "DD/MM HH:MM"
}

/** The modal payload sent as the response to the /novojogo command (interaction type 9). */
export const NOVOJOGO_MODAL = {
  custom_id: 'novojogo',
  title: 'Novo jogo',
  components: [
    row('slots', 'Horários — um por linha (DD/MM HH:MM)', 2, true, '18/06 21:00\n20/06 18:00'),
    row('local', 'Local', 1, false, 'IPVC ESTG - campo 7x7'),
    row('players', 'Jogadores (mín-máx)', 1, false, '10-14'),
    row('deadline', 'Fecho da votação (DD/MM HH:MM)', 1, false, '17/06 21:00'),
  ],
};

// type 4 = text input; style 1 = short, 2 = paragraph (multiline).
function row(customId: string, label: string, style: 1 | 2, required: boolean, placeholder: string) {
  return {
    type: 1,
    components: [{ type: 4, custom_id: customId, label, style, required, placeholder }],
  };
}

export function parseNovoJogoFields(f: NovoJogoFields, now: number): ParsedNovoJogo | { error: string } {
  const slots: { kickoffAt: number; label: string }[] = [];
  for (const line of (f.slots ?? '').split('\n').map((l) => l.trim()).filter(Boolean)) {
    const ts = parseDateTime(line, now);
    if (ts == null) return { error: M.errBadDate(line) };
    slots.push({ kickoffAt: ts, label: formatWhen(ts) });
  }
  if (slots.length < 2) return { error: M.errNeedTwoSlots };

  let minPlayers = DEFAULT_MIN_PLAYERS;
  let capPlayers = DEFAULT_CAP_PLAYERS;
  if (f.players && f.players.trim()) {
    const m = f.players.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!m) return { error: M.errBadPlayers };
    minPlayers = Number(m[1]);
    capPlayers = m[2] ? Number(m[2]) : minPlayers;
  }
  if (minPlayers < 1) return { error: M.errBadPlayers };
  if (minPlayers > capPlayers) return { error: M.errMinGtCap };

  let voteDeadline: number | null = null;
  if (f.deadline && f.deadline.trim()) {
    const ts = parseDateTime(f.deadline, now);
    if (ts == null) return { error: M.errBadDate(f.deadline) };
    // An explicit deadline that's already (near) past would close voting almost immediately —
    // reject it outright instead of silently "fixing" it to some other time behind the admin's back.
    if (ts < now + MIN_VOTE_WINDOW_MS) return { error: M.errDeadlineTooSoon };
    voteDeadline = ts;
  }

  slots.sort((a, b) => a.kickoffAt - b.kickoffAt);
  const future = slots.filter((s) => s.kickoffAt > now);
  if (future.length < 2) return { error: M.errNoFutureSlots };

  if (voteDeadline == null) {
    // Default: the poll stays open for a week. It still closes early the moment one slot
    // reaches `minPlayers` votes; an explicit deadline above overrides the default.
    voteDeadline = now + VOTE_MAX_WAIT_MS;
  }
  const locationNote = f.local && f.local.trim() ? f.local.trim() : '(local a combinar)';

  return { locationNote, minPlayers, capPlayers, voteDeadline, slots: future };
}
