import { M } from '../messages';
import { esc } from '../util';
import { formatWhen } from '../core/time';
import type { Tally } from '../core/voting';

const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

function tallyLines(tally: Tally[]): string[] {
  return tally.map((t, i) => `${NUM[i] ?? '•'} <b>${esc(t.slot.label)}</b> — ${M.vote.votesCount(t.count)}`);
}

export function renderVoteMessage(loc: string, tally: Tally[], voteDeadline: number, voters: number): string {
  return [
    M.vote.title,
    `📍 ${esc(loc)}`,
    '',
    ...tallyLines(tally),
    '',
    M.vote.pickHint,
    M.vote.voters(voters),
    M.vote.closesAt(formatWhen(voteDeadline)),
  ].join('\n');
}

export function renderVoteResult(loc: string, winnerLabel: string): string {
  return [M.vote.resultTitle, `📅 <b>${esc(winnerLabel)}</b>`, `📍 ${esc(loc)}`].join('\n');
}

export function renderVoteTie(loc: string, tally: Tally[]): string {
  return [M.vote.tieTitle, `📍 ${esc(loc)}`, '', ...tallyLines(tally), '', M.vote.tieFooter].join('\n');
}
