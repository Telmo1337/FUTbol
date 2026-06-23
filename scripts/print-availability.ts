// Manual, read-only check: prints the field's working hours + the free slots the weekly
// auto-game WOULD propose right now, straight from getfield.app's Firestore. No Discord,
// no D1, no token — just network reads. Use it to sanity-check the day-of-week mapping
// and the computed slots BEFORE trusting the cron.
//   npm run print:avail
import { createFieldClient, loadFreeSlots } from '../src/services/field';
import { lisbonParts } from '../src/core/time';
import { isAutoOpenHour } from '../src/services/weekly';
import { AVAIL_DAYS_AHEAD, FIELD_DAY_OF_SUNDAY } from '../src/config';

const DOW = ['—', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']; // index by ISO 1..7
const fieldDayToIso = (d: number) => (((d - FIELD_DAY_OF_SUNDAY) % 7) + 7) % 7 || 7;

const now = Date.now();
const client = createFieldClient();

const { workingHours, blocked } = await client.fetchWorkingHours();
console.log('=== workingHours (Field day → our ISO weekday) ===');
for (const w of [...workingHours].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))) {
  console.log(`  Field day ${w.day} → ${DOW[fieldDayToIso(w.day)]}   ${w.start}-${w.end}`);
}
console.log(`  blockedSlots parsed: ${blocked.length}`);

const windowEnd = now + AVAIL_DAYS_AHEAD * 86_400_000;
const booked = await client.fetchBookings(now, windowEnd);
console.log(`\n=== bookings overlapping the next ${AVAIL_DAYS_AHEAD} days: ${booked.length} ===`);
for (const b of booked.slice(0, 10)) {
  const p = lisbonParts(b.startMs);
  console.log(`  ${DOW[p.weekday]} ${p.day}/${p.month} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')} (booked)`);
}

const free = await loadFreeSlots(client, { now });
console.log(`\n=== FREE slots the weekly auto-game would propose: ${free.length} ===`);
for (const s of free) {
  const p = lisbonParts(s.kickoffAt);
  console.log(`  ${DOW[p.weekday]}  ${s.label}`);
}

console.log(`\nisAutoOpenHour(now) = ${isAutoOpenHour(now)} (true only between 09:00 and 23:00 Lisbon)`);
