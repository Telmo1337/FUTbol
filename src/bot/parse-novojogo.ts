// Parses the multi-line body of /novojogo into a game definition.
// Forgiving, label-based, order-independent. See M.novojogoUsage for the format.
import { DEFAULT_CAP_PLAYERS, DEFAULT_MIN_PLAYERS, VOTE_LEAD_BEFORE_EARLIEST_MS } from '../config';
import { formatWhen, parseDateTime } from '../core/time';
import { M } from '../messages';

export interface ParsedNovoJogo {
  locationNote: string;
  minPlayers: number;
  capPlayers: number;
  voteDeadline: number;
  slots: { kickoffAt: number; label: string }[];
}

const HOUR = 3_600_000;
const KEY_LOCAL = ['local', 'localização', 'localizacao', 'sítio', 'sitio'];
const KEY_PLAYERS = ['jogadores', 'jog', 'players'];
const KEY_DEADLINE = ['fecha', 'votação', 'votacao', 'voto', 'fecho'];
const KEY_SLOT = ['dia', 'data', 'opção', 'opcao', 'horário', 'horario'];

export function parseNovoJogo(raw: string, now: number): ParsedNovoJogo | { error: string } {
  const text = raw.trim();
  if (!text) return { error: M.novojogoUsage };

  let locationNote = '';
  let minPlayers = DEFAULT_MIN_PLAYERS;
  let capPlayers = DEFAULT_CAP_PLAYERS;
  let voteDeadline: number | null = null;
  const slots: { kickoffAt: number; label: string }[] = [];

  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const idx = line.indexOf(':');
    const key = idx >= 0 ? line.slice(0, idx).trim().toLowerCase() : '';
    const val = idx >= 0 ? line.slice(idx + 1).trim() : line;

    if (KEY_LOCAL.includes(key)) {
      locationNote = val;
    } else if (KEY_PLAYERS.includes(key)) {
      const m = val.match(/(\d+)\s*(?:-\s*(\d+))?/);
      if (!m) return { error: M.errBadPlayers };
      minPlayers = Number(m[1]);
      capPlayers = m[2] ? Number(m[2]) : minPlayers;
    } else if (KEY_DEADLINE.includes(key)) {
      const ts = parseDateTime(val, now);
      if (ts == null) return { error: M.errBadDate(val) };
      voteDeadline = ts;
    } else if (KEY_SLOT.includes(key)) {
      const ts = parseDateTime(val, now);
      if (ts == null) return { error: M.errBadDate(val) };
      slots.push({ kickoffAt: ts, label: formatWhen(ts) });
    } else {
      // bare line: try to read it as a date slot, otherwise ignore
      const ts = parseDateTime(line, now);
      if (ts != null) slots.push({ kickoffAt: ts, label: formatWhen(ts) });
    }
  }

  if (slots.length < 2) return { error: M.errNeedTwoSlots };
  if (minPlayers > capPlayers) return { error: M.errMinGtCap };

  slots.sort((a, b) => a.kickoffAt - b.kickoffAt);
  const future = slots.filter((s) => s.kickoffAt > now);
  if (future.length < 2) return { error: M.errNoFutureSlots };

  if (voteDeadline == null) voteDeadline = future[0].kickoffAt - VOTE_LEAD_BEFORE_EARLIEST_MS;
  if (voteDeadline <= now) voteDeadline = now + HOUR;
  if (!locationNote) locationNote = '(local a combinar)';

  return { locationNote, minPlayers, capPlayers, voteDeadline, slots: future };
}
