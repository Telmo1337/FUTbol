// Clock + Europe/Lisbon date handling. All timestamps elsewhere are unix-ms UTC;
// conversion to/from local wall-clock happens only here.
import { LOCALE, TIMEZONE } from '../config';

export interface Clock {
  now(): number;
}
export const systemClock: Clock = { now: () => Date.now() };

const DAY_MS = 86_400_000;

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function stripDot(s: string): string {
  return s.replace(/\.$/, '');
}

function partsOf(ms: number): Record<string, string> {
  const dtf = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const out: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(ms))) out[p.type] = p.value;
  return out;
}

/** Pretty pt-PT label for a moment, e.g. "Sáb, 14 jun · 20:00". */
export function formatWhen(ms: number): string {
  const p = partsOf(ms);
  return `${cap(stripDot(p.weekday ?? ''))}, ${p.day} ${stripDot(p.month ?? '')} · ${p.hour}:${p.minute}`;
}

/** How far (ms) Europe/Lisbon is ahead of UTC at the given instant. */
function tzOffsetMs(utcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) m[p.type] = p.value;
  let hour = Number(m.hour);
  if (hour === 24) hour = 0; // some engines emit "24" at midnight
  const asUtc = Date.UTC(Number(m.year), Number(m.month) - 1, Number(m.day), hour, Number(m.minute), Number(m.second));
  return asUtc - utcMs;
}

/** Convert a Lisbon wall-clock time to a UTC timestamp (ms). */
export function lisbonToUtc(y: number, mo: number, d: number, h: number, mi: number): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  return guess - tzOffsetMs(guess);
}

function lisbonYear(now: number): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, year: 'numeric' }).format(new Date(now)));
}

/**
 * Parse "DD/MM HH:MM" or "DD/MM/YYYY HH:MM" (also accepts - or . separators).
 * Interprets the time as Lisbon-local and returns UTC ms, or null if invalid.
 * With no year given, assumes this year — or next year if the date is well past.
 */
export function parseDateTime(input: string, now: number): number | null {
  const m = input.trim().match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = m[3] ? Number(m[3]) : lisbonYear(now);
  if (year < 100) year += 2000;
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  let ts = lisbonToUtc(year, month, day, hour, minute);
  if (!m[3] && ts < now - DAY_MS) ts = lisbonToUtc(year + 1, month, day, hour, minute);
  return ts;
}
