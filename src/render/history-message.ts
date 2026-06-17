// Renders one page of the 📜 histórico as board text. The interactions layer wraps this in
// an embed and attaches the ◀️/▶️ buttons (see discord/components historyComponents).
import { M } from '../messages';
import { esc } from '../util';
import { formatDay } from '../core/time';
import type { HistoryEntry, HistoryView } from '../services/history';

/** "🏆 Alpha" / "🏆 Beta" / "🤝 Empate" for a finished score. */
function winnerBadge(a: number, b: number): string {
  return a > b ? M.history.winAlpha : a < b ? M.history.winBeta : M.history.draw;
}

/** Global line tail: the Alpha–Beta score + winner, or "(sem resultado)". */
function globalDetail(e: HistoryEntry): string {
  if (e.goalsA == null || e.goalsB == null) return M.history.noResult;
  return `${M.history.scoreGlobal(e.goalsA, e.goalsB)} · ${winnerBadge(e.goalsA, e.goalsB)}`;
}

/** Per-person line tail: their side + their own outcome (their goals first), or "(sem resultado)". */
function personDetail(e: HistoryEntry): string {
  const sidePart = e.side ? M.history.side(e.side) : null;
  if (e.goalsA != null && e.goalsB != null) {
    if (e.side) {
      const mine = e.side === 'A' ? e.goalsA : e.goalsB;
      const theirs = e.side === 'A' ? e.goalsB : e.goalsA;
      const outcome =
        mine > theirs
          ? M.history.personWin(mine, theirs)
          : mine < theirs
            ? M.history.personLoss(mine, theirs)
            : M.history.personDraw(mine, theirs);
      return `${sidePart} · ${outcome}`;
    }
    // Present, but never assigned to a team that game → fall back to the global score line.
    return globalDetail(e);
  }
  // No score yet.
  return sidePart ? `${sidePart} · ${M.history.noResult}` : M.history.noResult;
}

export function renderHistory(v: HistoryView): string {
  const isPerson = v.name != null;
  const title = isPerson ? M.history.titlePerson(esc(v.name!)) : M.history.title;

  if (v.entries.length === 0) {
    const empty = isPerson ? M.history.nonePerson(esc(v.name!)) : M.history.none;
    return [title, '', empty].join('\n');
  }

  const detail = isPerson ? personDetail : globalDetail;
  const lines = v.entries.map((e) => `${formatDay(e.kickoffAt)} — ${detail(e)}`);
  return [title, '', ...lines].join('\n');
}
