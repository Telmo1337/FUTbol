// Reads the field's availability from getfield.app's Firestore (public read, no login)
// and turns it into free kickoff slots. This is the ONLY module that talks to Firestore.
// The network boundary is the `FieldClient` interface so the selftest can inject a fake
// one and stay offline (same pattern as the Discord `Sender`).
import {
  AVAIL_DAYS_AHEAD,
  AVAIL_EARLIEST_HOUR,
  AVAIL_LATEST_HOUR,
  AVAIL_MAX_SLOTS,
  AVAIL_SLOT_MIN,
  AVAIL_STEP_MIN,
  FIELD_API_KEY,
  FIELD_DAY_OF_SUNDAY,
  FIELD_ID,
  FIRESTORE_BASE,
} from '../config';
import { lisbonToUtc } from '../core/time';
import { computeFreeSlots } from '../core/availability';
import type { BusyInterval, FreeSlot, WorkingWindow } from '../core/availability';

const DAY_MS = 86_400_000;

export interface FieldClient {
  /** The pitch's open windows + manually blocked intervals (already in UTC ms). */
  fetchWorkingHours(): Promise<{ workingHours: WorkingWindow[]; blocked: BusyInterval[] }>;
  /** Confirmed bookings overlapping [startMs, endMs], as UTC-ms intervals. */
  fetchBookings(startMs: number, endMs: number): Promise<BusyInterval[]>;
}

// ---- Firestore REST value decoding ----
type FsVal = Record<string, unknown>;
function unwrap(v: FsVal | null | undefined): unknown {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) {
    const out: Record<string, unknown> = {};
    const f = (v.mapValue as { fields?: Record<string, FsVal> }).fields ?? {};
    for (const k of Object.keys(f)) out[k] = unwrap(f[k]);
    return out;
  }
  if ('arrayValue' in v) {
    const vals = (v.arrayValue as { values?: FsVal[] }).values ?? [];
    return vals.map((x) => unwrap(x));
  }
  return null;
}

const HHMM = /^(\d{1,2}):(\d{2})$/;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

const ISO_WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})/;

/**
 * getfield.app stores booking times as Lisbon WALL-CLOCK but suffixes them with `Z`/`+00:00`.
 * Verified against live data: the booking start-hour histogram peaks at 08:00 & 21:00 wall-clock
 * (real human times, inside the field's Lisbon working hours), whereas reading the `Z` as true UTC
 * shifts everything to ~22:00 (the field's closing time) — clearly wrong. So we parse the wall-clock
 * parts and convert via Lisbon, exactly like workingHours/blockedSlots, so all intervals share one frame.
 */
function isoWallToUtc(iso: string): number | null {
  const m = ISO_WALL.exec(iso);
  if (!m) return null;
  return lisbonToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
}

/** A blockedSlot ({date:"YYYY-MM-DD", startTime/endTime:"H:MM"} in Lisbon local) → UTC-ms interval. */
function blockedToInterval(b: Record<string, unknown>): BusyInterval | null {
  const d = YMD.exec(String(b.date ?? ''));
  const s = HHMM.exec(String(b.startTime ?? ''));
  const e = HHMM.exec(String(b.endTime ?? ''));
  if (!d || !s || !e) return null;
  const [y, mo, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const startMs = lisbonToUtc(y, mo, day, Number(s[1]), Number(s[2]));
  const endMs = lisbonToUtc(y, mo, day, Number(e[1]), Number(e[2]));
  return endMs > startMs ? { startMs, endMs } : null;
}

export function createFieldClient(fetchImpl: typeof fetch = fetch): FieldClient {
  return {
    async fetchWorkingHours() {
      const res = await fetchImpl(`${FIRESTORE_BASE}/field/${FIELD_ID}?key=${FIELD_API_KEY}`);
      if (!res.ok) throw new Error(`[field] doc fetch ${res.status}`);
      const fields = ((await res.json()) as { fields?: Record<string, FsVal> }).fields ?? {};
      const whRaw = (unwrap(fields.workingHours) as Array<Record<string, unknown>> | null) ?? [];
      const workingHours: WorkingWindow[] = whRaw
        .filter((w) => w && w.day != null && w.start && w.end)
        .map((w) => ({ day: Number(w.day), start: String(w.start), end: String(w.end) }));
      const bsRaw = (unwrap(fields.blockedSlots) as Array<Record<string, unknown>> | null) ?? [];
      const blocked = bsRaw.map(blockedToInterval).filter((x): x is BusyInterval => x !== null);
      return { workingHours, blocked };
    },

    async fetchBookings(startMs, endMs) {
      // Single equality filter (auto-indexed); a date range here would need a composite
      // index we don't control. So we fetch all bookings for this pitch and filter locally.
      const body = {
        structuredQuery: {
          from: [{ collectionId: 'booking' }],
          where: {
            fieldFilter: { field: { fieldPath: 'fieldId' }, op: 'EQUAL', value: { stringValue: FIELD_ID } },
          },
        },
      };
      const res = await fetchImpl(`${FIRESTORE_BASE}:runQuery?key=${FIELD_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`[field] bookings query ${res.status}`);
      const rows = (await res.json()) as Array<{ document?: { fields?: Record<string, FsVal> } }>;
      const out: BusyInterval[] = [];
      for (const r of rows) {
        const f = r.document?.fields;
        if (!f) continue;
        if ((f.status as { stringValue?: string })?.stringValue !== 'booked') continue;
        const isoStart = (f.isoStart as { stringValue?: string })?.stringValue;
        const isoEnd = (f.isoEnd as { stringValue?: string })?.stringValue;
        if (!isoStart || !isoEnd) continue;
        const s = isoWallToUtc(isoStart);
        const e = isoWallToUtc(isoEnd);
        if (s == null || e == null) continue;
        if (s < endMs && startMs < e) out.push({ startMs: s, endMs: e }); // overlaps the window
      }
      return out;
    },
  };
}

/** Fetch availability and compute the free kickoff slots for the next week (config-driven). */
export async function loadFreeSlots(client: FieldClient, opts: { now: number }): Promise<FreeSlot[]> {
  const windowEnd = opts.now + AVAIL_DAYS_AHEAD * DAY_MS;
  const [{ workingHours, blocked }, booked] = await Promise.all([
    client.fetchWorkingHours(),
    client.fetchBookings(opts.now, windowEnd),
  ]);
  return computeFreeSlots({
    now: opts.now,
    workingHours,
    booked,
    blocked,
    daysAhead: AVAIL_DAYS_AHEAD,
    slotLenMin: AVAIL_SLOT_MIN,
    stepMin: AVAIL_STEP_MIN,
    earliestHour: AVAIL_EARLIEST_HOUR,
    latestHour: AVAIL_LATEST_HOUR,
    fieldDayOfSunday: FIELD_DAY_OF_SUNDAY,
    maxSlots: AVAIL_MAX_SLOTS,
  });
}
