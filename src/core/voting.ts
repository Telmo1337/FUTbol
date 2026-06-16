// Pure vote tallying. Approval voting: a user may vote for several slots.
import type { Slot, Vote } from '../types';

export interface Tally {
  slot: Slot;
  count: number;
}

export function tallyVotes(slots: Slot[], votes: Vote[]): Tally[] {
  const counts = new Map<number, number>();
  for (const v of votes) counts.set(v.slotId, (counts.get(v.slotId) ?? 0) + 1);
  return slots
    .map((slot) => ({ slot, count: counts.get(slot.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.slot.sortOrder - b.slot.sortOrder);
}

export function countVoters(votes: Vote[]): number {
  return new Set(votes.map((v) => v.tgUserId)).size;
}

/** Unique top slot → winner. Otherwise the tied slots (or all slots if nobody voted). */
export function pickWinner(slots: Slot[], votes: Vote[]): { winner: Slot | null; tied: Slot[] } {
  const tally = tallyVotes(slots, votes);
  if (tally.length === 0) return { winner: null, tied: [] };
  const top = tally[0].count;
  if (top === 0) return { winner: null, tied: slots };
  const leaders = tally.filter((t) => t.count === top).map((t) => t.slot);
  return leaders.length === 1 ? { winner: leaders[0], tied: [] } : { winner: null, tied: leaders };
}
