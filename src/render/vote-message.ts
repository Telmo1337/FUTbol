import { M } from '../messages';
import { esc } from '../util';
import { discordTs } from '../core/time';
import type { Tally } from '../core/voting';

const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

/** Per-slot voter names, keyed by slot id. Built by the caller from repo.getVotesWithNames. */
export type VotersBySlot = Map<number, string[]>;

function tallyLines(tally: Tally[], voters: VotersBySlot): string[] {
  return tally.map((t, i) => {
    const head = `${NUM[i] ?? '•'} **${esc(t.slot.label)}** — ${M.vote.votesCount(t.count)}`;
    const names = voters.get(t.slot.id);
    return names && names.length ? `${head}\n     ${names.map((n) => esc(n)).join(', ')}` : head;
  });
}

export function renderVoteMessage(
  loc: string,
  tally: Tally[],
  voteDeadline: number,
  voters: number,
  votersBySlot: VotersBySlot,
  minPlayers: number,
): string {
  return [
    M.vote.title,
    `📍 ${esc(loc)}`,
    '',
    ...tallyLines(tally, votersBySlot),
    '',
    M.vote.pickHint,
    M.vote.voters(voters),
    M.vote.closesAt(minPlayers, discordTs(voteDeadline)),
  ].join('\n');
}

export function renderVoteResult(loc: string, winnerLabel: string): string {
  return [M.vote.resultTitle, `📅 **${esc(winnerLabel)}**`, `📍 ${esc(loc)}`].join('\n');
}

export function renderVoteTie(loc: string, tally: Tally[], votersBySlot: VotersBySlot): string {
  return [M.vote.tieTitle, `📍 ${esc(loc)}`, '', ...tallyLines(tally, votersBySlot), '', M.vote.tieFooter].join('\n');
}
