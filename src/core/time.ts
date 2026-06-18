// Clock + Europe/Lisbon date handling. All timestamps elsewhere are unix-ms UTC;
// conversion to/from local wall-clock happens only here.
import { TIMEZONE } from '../config';

export interface Clock {
  now(): number;
}
export const systemClock: Clock = { now: () => Date.now() };

const DAY_MS = 86_400_000;

// pt-PT calendar labels, indexed directly. The Cloudflare Workers runtime ships a reduced ICU
// dataset that renders pt-PT `weekday:'short'`/`month:'short'` as the FULL weekday + a NUMERIC
// month ("Quarta, 17 06"), so we build the abbreviations ourselves — identical in local Node and
// in production. Indices match lisbonParts: weekday 1=Mon..7=Sun, month 1=Jan..12=Dec.
const WEEKDAY_SHORT_PT = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MONTH_SHORT_PT = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTH_LONG_PT = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Pretty pt-PT label for a moment, e.g. "Sáb, 14 jun · 20:00" (Lisbon wall-clock, DST-safe). */
export function formatWhen(ms: number): string {
  const p = lisbonParts(ms);
  return `${WEEKDAY_SHORT_PT[p.weekday]}, ${pad2(p.day)} ${MONTH_SHORT_PT[p.month]} · ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Date-only pt-PT label (no time), e.g. "Sáb, 14 jun" — used in the 📜 histórico. */
export function formatDay(ms: number): string {
  const p = lisbonParts(ms);
  return `${WEEKDAY_SHORT_PT[p.weekday]}, ${pad2(p.day)} ${MONTH_SHORT_PT[p.month]}`;
}

/**
 * A Discord auto-timestamp tag, e.g. `<t:1718568000:R>` → "daqui a 3 horas" — rendered LIVE
 * by each client in the viewer's own timezone, and it keeps ticking with no edit from us.
 * Styles: R relative · F long date+time · f short · t time · D date. Only renders in message
 * content / embed description-or-fields (NOT in an embed title).
 */
export function discordTs(ms: number, style: 'R' | 'F' | 'f' | 't' | 'D' = 'R'): string {
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

/** pt-PT month name for a moment, e.g. "junho" (lowercase, as Portuguese writes months). */
export function formatMonth(ms: number): string {
  return MONTH_LONG_PT[lisbonParts(ms).month];
}

/**
 * The [since, until) UTC window of the Lisbon calendar month that `now` falls in.
 * `since` = 1st at 00:00 Lisbon; `until` = 1st of next month at 00:00 (December rolls the year).
 * Used to filter stats to "this month". DST-safe via lisbonToUtc.
 */
export function monthWindow(now: number): { since: number; until: number } {
  const { year, month } = lisbonParts(now);
  const since = lisbonToUtc(year, month, 1, 0, 0);
  const until = month === 12 ? lisbonToUtc(year + 1, 1, 1, 0, 0) : lisbonToUtc(year, month + 1, 1, 0, 0);
  return { since, until };
}

const WEEKDAY_TO_ISO: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/**
 * Lisbon wall-clock parts as numbers (weekday 1=Mon..7=Sun). DST-safe: the hour/weekday
 * come straight from Intl in the Lisbon zone, never from UTC arithmetic. Used to answer
 * "is it Sunday 18:00 in Lisbon?" and to walk forward day-by-day.
 */
export function lisbonParts(ms: number): {
  weekday: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(ms))) m[p.type] = p.value;
  let hour = Number(m.hour);
  if (hour === 24) hour = 0; // some engines emit "24" at midnight
  return {
    weekday: WEEKDAY_TO_ISO[m.weekday] ?? 0,
    year: Number(m.year),
    month: Number(m.month),
    day: Number(m.day),
    hour,
    minute: Number(m.minute),
  };
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
