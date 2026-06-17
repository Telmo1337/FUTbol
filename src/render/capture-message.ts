// Renders for the ⚽ Golos / 🅰️ Assistências capture panel and its read-only summary.
// Text only — the interactions layer wraps it in an embed and attaches the selects/buttons.
import { M } from '../messages';
import { esc } from '../util';
import { formatDay } from '../core/time';
import type { CaptureState } from '../services/capture';

/** One line per player with at least one goal (or assist, when assists are enabled). */
function tallyLines(s: CaptureState, assists: boolean): string[] {
  const assistsOf = (id: string) => (assists ? (s.assists.get(id) ?? 0) : 0);
  return s.players
    .filter((p) => (s.goals.get(p.tgUserId) ?? 0) > 0 || assistsOf(p.tgUserId) > 0)
    .map((p) => M.capture.playerLine(esc(p.displayName), s.goals.get(p.tgUserId) ?? 0, assistsOf(p.tgUserId)));
}

function header(s: CaptureState): string[] {
  const day = s.kickoffAt != null ? formatDay(s.kickoffAt) : '';
  const out = [M.capture.title(day)];
  if (s.score) {
    const assignedGoals = [...s.goals.values()].reduce((a, b) => a + b, 0);
    out.push(`${M.capture.score(s.score.a, s.score.b)}   ·   ${M.capture.tally(assignedGoals, s.score.a + s.score.b)}`);
  }
  return out;
}

/** The interactive panel (admin picks scorers/assisters; each pick = +1). */
export function renderCapturePanel(s: CaptureState, assists = true): string {
  const lines = tallyLines(s, assists);
  return [...header(s), M.capture.hint, '', ...(lines.length ? lines : [M.capture.empty])].join('\n');
}

/** The read-only summary shown after "Concluir". */
export function renderCaptureSummary(s: CaptureState, assists = true): string {
  const day = s.kickoffAt != null ? formatDay(s.kickoffAt) : '';
  const lines = tallyLines(s, assists);
  return [M.capture.doneTitle(day), '', ...(lines.length ? lines : [M.capture.empty]), '', M.capture.doneFooter].join('\n');
}
