// The score modal (📊 Inserir resultado) and its parser. A Discord modal is text-only,
// so the teams themselves are picked via select menus (see components.ts); this modal
// only captures the two scores. The game id rides in the custom_id (`result:<gameId>`).
import { M } from '../messages';

export interface ResultFields {
  golosA: string;
  golosB: string;
}

// type 4 = text input; style 1 = short.
function row(customId: string, label: string, placeholder: string) {
  return { type: 1, components: [{ type: 4, custom_id: customId, label, style: 1, required: true, placeholder }] };
}

/** The score modal for a given game. */
export function resultModal(gameId: number) {
  return {
    custom_id: `result:${gameId}`,
    title: M.result.modalTitle,
    components: [row('golosA', M.result.fieldAlpha, '3'), row('golosB', M.result.fieldBeta, '2')],
  };
}

function parseGoals(s: string): number | null {
  const t = (s ?? '').trim();
  return /^\d{1,3}$/.test(t) ? Number(t) : null; // 0..999, non-negative integers only
}

/** Parse the two goal fields → non-negative integers, or an error message. */
export function parseResultFields(f: ResultFields): { goalsA: number; goalsB: number } | { error: string } {
  const goalsA = parseGoals(f.golosA);
  const goalsB = parseGoals(f.golosB);
  if (goalsA == null || goalsB == null) return { error: M.errBadGoals };
  return { goalsA, goalsB };
}
