// Pure slot math: turn the field's working hours + existing bookings into the list
// of FREE kickoff times to vote on. No I/O — services/field.ts feeds it decoded data,
// the selftest feeds it fabricated data. All timestamps are unix-ms UTC.
import { formatWhen, lisbonParts, lisbonToUtc } from './time';

/** One open window for a weekday, as stored in Field's `workingHours` (day = Field's own numbering). */
export interface WorkingWindow {
  day: number;
  start: string; // "HH:MM" Lisbon
  end: string; // "HH:MM" Lisbon
}

/** A taken interval (a confirmed booking) or a manually blocked interval. */
export interface BusyInterval {
  startMs: number;
  endMs: number;
}

export interface AvailabilityInput {
  now: number;
  workingHours: WorkingWindow[];
  booked: BusyInterval[];
  blocked: BusyInterval[];
  daysAhead: number;
  slotLenMin: number;
  stepMin: number;
  earliestHour: number;
  latestHour: number;
  /** Which `workingHours.day` value means Sunday in Field's data (to map Field-day → ISO weekday). */
  fieldDayOfSunday: number;
  maxSlots: number;
}

export interface FreeSlot {
  kickoffAt: number;
  label: string;
}

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

function hhmmToMinutes(s: string): number | null {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Map a Field `day` value to an ISO weekday (1=Mon..7=Sun), anchored on Sunday. */
function fieldDayToIso(fieldDay: number, fieldDayOfSunday: number): number {
  const offsetFromSunday = (((fieldDay - fieldDayOfSunday) % 7) + 7) % 7; // 0=Sun,1=Mon,...,6=Sat
  return offsetFromSunday === 0 ? 7 : offsetFromSunday;
}

function overlaps(aStart: number, aEnd: number, busy: BusyInterval[]): boolean {
  return busy.some((b) => aStart < b.endMs && b.startMs < aEnd);
}

/**
 * Free kickoff slots for the next `daysAhead` days, excluding Sundays (the user's rule),
 * within the field's working hours, dropping any slot that overlaps a booking or block,
 * filtered to [earliestHour, latestHour), sorted ascending and capped at `maxSlots`.
 */
export function computeFreeSlots(input: AvailabilityInput): FreeSlot[] {
  const { now, workingHours, booked, blocked, slotLenMin, stepMin, earliestHour, latestHour } = input;
  const slotMs = slotLenMin * MIN_MS;
  const out: FreeSlot[] = [];

  for (let d = 0; d < input.daysAhead; d++) {
    const p = lisbonParts(now + d * DAY_MS); // {weekday 1..7, year, month, day}
    if (p.weekday === 7) continue; // never propose Sundays

    const windows = workingHours.filter((w) => fieldDayToIso(w.day, input.fieldDayOfSunday) === p.weekday);
    for (const w of windows) {
      const startMin = hhmmToMinutes(w.start);
      const endMin = hhmmToMinutes(w.end);
      if (startMin == null || endMin == null) continue;

      for (let mins = startMin; mins + slotLenMin <= endMin; mins += stepMin) {
        const hour = Math.floor(mins / 60);
        if (hour < earliestHour || hour >= latestHour) continue;
        const kickoffAt = lisbonToUtc(p.year, p.month, p.day, hour, mins % 60);
        if (kickoffAt <= now) continue;
        if (overlaps(kickoffAt, kickoffAt + slotMs, booked)) continue;
        if (overlaps(kickoffAt, kickoffAt + slotMs, blocked)) continue;
        out.push({ kickoffAt, label: formatWhen(kickoffAt) });
      }
    }
  }

  // Dedupe by kickoff (a day could match >1 overlapping window), sort, cap.
  const seen = new Set<number>();
  return out
    .filter((s) => (seen.has(s.kickoffAt) ? false : (seen.add(s.kickoffAt), true)))
    .sort((a, b) => a.kickoffAt - b.kickoffAt)
    .slice(0, input.maxSlots);
}
