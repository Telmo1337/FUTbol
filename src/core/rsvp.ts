// Pure squad logic. Capacity is DERIVED here, never written — this is what makes
// "two people grab the last slot" impossible: both are IN, order decides who's confirmed.
import type { RsvpView } from '../types';

export interface SquadSplit {
  confirmed: RsvpView[]; // IN, within cap, ordered by join time
  waitlist: RsvpView[]; // IN, beyond cap
  maybe: RsvpView[];
  out: RsvpView[];
}

export function splitSquad(list: RsvpView[], cap: number): SquadSplit {
  const ins = list
    .filter((r) => r.status === 'IN')
    .sort((a, b) => a.rankAt - b.rankAt || a.tgUserId.localeCompare(b.tgUserId));
  return {
    confirmed: ins.slice(0, cap),
    waitlist: ins.slice(cap),
    maybe: list.filter((r) => r.status === 'MAYBE').sort((a, b) => a.updatedAt - b.updatedAt),
    out: list.filter((r) => r.status === 'OUT').sort((a, b) => a.updatedAt - b.updatedAt),
  };
}

export function confirmedIds(list: RsvpView[], cap: number): Set<string> {
  return new Set(splitSquad(list, cap).confirmed.map((r) => r.tgUserId));
}
