// Engine self-test: drives the real services against the local D1 with a fake Discord sender.
// Simulates a full weekly loop (vote → winner → RSVP → waitlist → promotion → close → check-in).
// User/channel ids are strings here, exactly like real Discord snowflakes.
// Run with: npm run selftest   (no Discord token needed)
import { getPlatformProxy } from 'wrangler';
import type { Env } from '../src/types';
import type { Sender } from '../src/discord/rest';
import { createRepo } from '../src/db/repo';
import * as games from '../src/services/games';
import { confirmedIds, splitSquad } from '../src/core/rsvp';
import { pickWinner, tallyVotes } from '../src/core/voting';
import { renderVoteMessage } from '../src/render/vote-message';
import { parseDateTime, formatWhen, lisbonToUtc, lisbonParts } from '../src/core/time';
import { computeFreeSlots } from '../src/core/availability';
import { isWeeklyTriggerWindow, maybeCreateWeeklyGame } from '../src/services/weekly';
import type { FieldClient } from '../src/services/field';
import { loadStats } from '../src/services/stats';
import { computeStats, statFor, topByGhosts, topByReliability } from '../src/core/stats';

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? '✅' : '❌'} ${name}`);
  if (!cond) failures++;
}

// --- Fake Discord sender: records message contents instead of sending them ---
const sent: { chatId: string; text: string }[] = [];
let msgId = 1000;
const sender: Sender = {
  async send(chatId, msg) {
    sent.push({ chatId, text: msg.content ?? '' });
    return String(++msgId);
  },
  async edit() {
    /* edits don't need recording for these checks */
  },
};
const anySentIncludes = (s: string) => sent.some((m) => m.text.includes(s));

// --- Pure-function checks ---
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0); // 2026-06-15 12:00 UTC
check('parseDateTime parses "20/06 18:00"', parseDateTime('20/06 18:00', NOW) !== null);
check('parseDateTime rejects garbage', parseDateTime('amanhã às tantas', NOW) === null);
check('formatWhen produces a label', /\d{2}:\d{2}/.test(formatWhen(NOW)));

// vote board shows who voted what (names listed under each slot)
const demoSlots = [{ id: 7, gameId: 1, kickoffAt: NOW, label: 'Sáb 18:00', sortOrder: 0 }];
const demoBoard = renderVoteMessage(
  'Campo',
  tallyVotes(demoSlots, [{ gameId: 1, slotId: 7, tgUserId: 'a', createdAt: NOW }]),
  NOW,
  1,
  new Map([[7, ['Telmo', 'Ana']]]),
);
check('vote board lists voter names under a slot', demoBoard.includes('Telmo') && demoBoard.includes('Ana'));

// --- pure computeFreeSlots: Sunday exclusion, >=18h filter, booked-slot subtraction ---
// NOW = Mon 2026-06-15. Field uses day 1=Mon..7=Sun (fieldDayOfSunday=7).
const avFree = computeFreeSlots({
  now: NOW,
  workingHours: [
    { day: 1, start: '16:00', end: '20:00' }, // Mon: 16/17 dropped (<18h), 18/19 kept
    { day: 2, start: '18:00', end: '20:00' }, // Tue: 18 booked below, 19 kept
    { day: 5, start: '18:00', end: '20:00' }, // Fri: excluded entirely
    { day: 6, start: '10:00', end: '12:00' }, // Sat daytime: 10/11 kept (any-hour on Saturday)
    { day: 6, start: '18:00', end: '20:00' }, // Sat: 18/19 kept
    { day: 7, start: '18:00', end: '20:00' }, // Sun: excluded entirely
  ],
  booked: [{ startMs: lisbonToUtc(2026, 6, 16, 18, 0), endMs: lisbonToUtc(2026, 6, 16, 19, 0) }],
  blocked: [],
  daysAhead: 7,
  slotLenMin: 60,
  stepMin: 60,
  earliestHour: 18,
  latestHour: 24,
  anyHourDows: [6],
  excludedDows: [5, 7],
  fieldDayOfSunday: 7,
  maxSlots: 25,
});
check(
  'availability: never proposes Friday or Sunday',
  avFree.every((s) => ![5, 7].includes(lisbonParts(s.kickoffAt).weekday)),
);
check(
  'availability: >=18h filter applies except Saturday',
  avFree.filter((s) => lisbonParts(s.kickoffAt).weekday !== 6).every((s) => lisbonParts(s.kickoffAt).hour >= 18),
);
check('availability: Saturday allows daytime (any hour)', avFree.some((s) => s.kickoffAt === lisbonToUtc(2026, 6, 20, 10, 0)));
check('availability: drops the booked Tue 18:00 slot', !avFree.some((s) => s.kickoffAt === lisbonToUtc(2026, 6, 16, 18, 0)));
check('availability: keeps the free Tue 19:00 slot', avFree.some((s) => s.kickoffAt === lisbonToUtc(2026, 6, 16, 19, 0)));
check(
  'availability: keeps Sat 18:00 & 19:00',
  avFree.some((s) => s.kickoffAt === lisbonToUtc(2026, 6, 20, 18, 0)) &&
    avFree.some((s) => s.kickoffAt === lisbonToUtc(2026, 6, 20, 19, 0)),
);

const proxy = await getPlatformProxy<Env>();
const repo = createRepo(proxy.env.DB);

// --- End-to-end weekly loop ---
// Unique per run: the local D1 persists between runs, and the all-time /stats checks
// below read every PLAYED game for this chat — a fixed id would let runs bleed together.
const chatId = `chat-${Date.now()}`;
const DAY = 86_400_000;
const slotA = NOW + 2 * DAY;
const slotB = NOW + 3 * DAY;
const slotC = NOW + 4 * DAY;

await games.createGame(sender, repo, {
  chatId,
  createdBy: '1',
  locationNote: 'IPVC ESTG - campo 7x7',
  minPlayers: 2,
  capPlayers: 3,
  voteDeadline: NOW + DAY,
  slots: [
    { kickoffAt: slotA, label: formatWhen(slotA) },
    { kickoffAt: slotB, label: formatWhen(slotB) },
    { kickoffAt: slotC, label: formatWhen(slotC) },
  ],
  now: NOW,
});

let game = (await repo.getCurrentGame(chatId))!;
check('game created in VOTING', game.status === 'VOTING' && game.voteMsgId != null);

const slots = await repo.getSlots(game.id);
const [a, b] = slots;
// users 1,2,3 vote slot B; user 1 also votes slot A → B wins clearly
await games.handleVote(sender, repo, game.id, b.id, '1', NOW);
await games.handleVote(sender, repo, game.id, b.id, '2', NOW);
await games.handleVote(sender, repo, game.id, b.id, '3', NOW);
await games.handleVote(sender, repo, game.id, a.id, '1', NOW);
check('pickWinner picks slot B', pickWinner(slots, await repo.getVotes(game.id)).winner?.id === b.id);
const namedVotes = await repo.getVotesWithNames(game.id);
check(
  'getVotesWithNames joins votes to names',
  namedVotes.length === 4 && namedVotes.filter((v) => v.slotId === b.id).length === 3,
);

await games.closeVoting(sender, repo, game, NOW + DAY + 1);
game = (await repo.getGame(game.id))!;
check('voting closed → RSVP_OPEN', game.status === 'RSVP_OPEN' && game.winningSlotId === b.id);

// 4 players say IN, in order. cap=3 → #4 waitlisted.
for (const uid of ['1', '2', '3', '4']) await games.handleRsvp(sender, repo, game.id, uid, 'IN', NOW + DAY + 1 + Number(uid));
let split = splitSquad(await repo.getRsvps(game.id), game.capPlayers);
check('squad: 3 confirmed', split.confirmed.length === 3);
check('squad: 1 waitlisted (user 4)', split.waitlist.length === 1 && split.waitlist[0].tgUserId === '4');
check('GAME_ON nudge fired when min reached', anySentIncludes('Temos jogo'));

// user 1 (earliest) drops out → user 4 promoted + notified
const sentBefore = sent.length;
await games.handleRsvp(sender, repo, game.id, '1', 'OUT', NOW + DAY + 100);
const confirmed = confirmedIds(await repo.getRsvps(game.id), game.capPlayers);
check('after dropout: user 4 promoted into squad', confirmed.has('4') && !confirmed.has('1'));
check('promotion message sent', sent.length > sentBefore && anySentIncludes('abriu uma vaga'));

// idempotency: re-running the same OUT must NOT re-notify
const sentBefore2 = sent.length;
await games.handleRsvp(sender, repo, game.id, '1', 'OUT', NOW + DAY + 200);
check('repeat dropout does not double-notify', !sent.slice(sentBefore2).some((m) => m.text.includes('abriu uma vaga')));

// close RSVP → confirmed (3 >= min 2) → LOCKED
game = (await repo.getGame(game.id))!;
await games.closeRsvp(sender, repo, game, game.rsvpCloseAt! + 1);
game = (await repo.getGame(game.id))!;
check('RSVP closed → LOCKED', game.status === 'LOCKED');
check('final squad announced', anySentIncludes('Equipa final'));
// Confirmed squad now = users 2,3,4 (user 1 dropped out before close).

// --- v2: check-in window → ghosts → admin clear ---
await games.openCheckin(sender, repo, game, slotB + 1); // kickoff reached
game = (await repo.getGame(game.id))!;
check('LOCKED → CHECKIN_OPEN at kickoff', game.status === 'CHECKIN_OPEN' && game.checkinMsgId != null);
check('check-in board posted', anySentIncludes('Hora do jogo'));

// users 2 and 3 tap Cheguei; user 4 does NOT (will be a ghost)
await games.handleCheckin(sender, repo, game.id, '2', slotB + 100);
await games.handleCheckin(sender, repo, game.id, '3', slotB + 150);
check('two self check-ins recorded', (await repo.getCheckins(game.id)).length === 2);
await games.handleCheckin(sender, repo, game.id, '2', slotB + 200); // repeat tap
check('repeat check-in does not duplicate', (await repo.getCheckins(game.id)).length === 2);

// close the window → PLAYED + recap with the ghost
game = (await repo.getGame(game.id))!;
await games.closeCheckin(sender, repo, game, game.checkinCloseAt! + 1);
game = (await repo.getGame(game.id))!;
check('CHECKIN_OPEN → PLAYED after window', game.status === 'PLAYED');
check('recap names the ghost', anySentIncludes('Fantasmas'));

let s1 = await loadStats(repo, chatId);
check('stats: exactly 1 game played', s1.totalGames === 1);
check('stats: user 2 has an appearance', statFor(s1, '2', 'u2').appearances === 1 && statFor(s1, '2', 'u2').ghosts === 0);
check('stats: user 4 is a ghost (confirmed, no-show)', statFor(s1, '4', 'u4').ghosts === 1 && statFor(s1, '4', 'u4').appearances === 0);

// admin clears the false ghost → user 4 counts as present
await games.clearGhost(sender, repo, game.id, '4', chatId, '1', game.checkinCloseAt! + 2);
const s2 = await loadStats(repo, chatId);
check('stats: admin clear turns ghost into appearance', statFor(s2, '4', 'u4').ghosts === 0 && statFor(s2, '4', 'u4').appearances === 1);

// --- pure computeStats: subs, reliability %, streak reset ---
// cap = 1, so each game's confirmed squad is the single earliest IN.
const sStats = computeStats({
  games: [
    { id: 1, capPlayers: 1, kickoffAt: 1000 },
    { id: 2, capPlayers: 1, kickoffAt: 2000 },
    { id: 3, capPlayers: 1, kickoffAt: 3000 },
    { id: 4, capPlayers: 1, kickoffAt: 4000 },
  ],
  rsvps: [
    { gameId: 1, tgUserId: '10', status: 'IN', rankAt: 1 }, // p10 confirmed
    { gameId: 1, tgUserId: '20', status: 'IN', rankAt: 2 }, // p20 waitlisted sub
    { gameId: 2, tgUserId: '10', status: 'IN', rankAt: 1 },
    { gameId: 3, tgUserId: '10', status: 'IN', rankAt: 1 },
    { gameId: 4, tgUserId: '10', status: 'IN', rankAt: 1 }, // p10 confirmed but absent below
    { gameId: 4, tgUserId: '30', status: 'IN', rankAt: 2 }, // p30 waitlisted sub
  ],
  presentKeys: new Set(['1:10', '2:10', '3:10', '1:20', '4:30']), // p10 absent game 4
  names: new Map([
    ['10', 'Ana'],
    ['20', 'Bea'],
    ['30', 'Caz'],
  ]),
});
const p10 = statFor(sStats, '10', 'Ana');
check('computeStats: p10 appearances 3 / confirmedFor 4', p10.appearances === 3 && p10.confirmedFor === 4);
check('computeStats: p10 reliability 75%', p10.reliabilityPct === 75);
check('computeStats: p10 one ghost (missed game 4)', p10.ghosts === 1);
check('computeStats: p10 streak reset (current 0, best 3)', p10.currentStreak === 0 && p10.bestStreak === 3);
const p20 = statFor(sStats, '20', 'Bea');
check('computeStats: sub earns appearance, no reliability', p20.appearances === 1 && p20.confirmedFor === 0 && p20.reliabilityPct === null);
check('computeStats: late sub current streak 1', statFor(sStats, '30', 'Caz').currentStreak === 1);
check('computeStats: reliability board only ranks >= 3 games', topByReliability(sStats, 5).every((p) => p.confirmedFor >= 3));
check('computeStats: ghost board includes p10', topByGhosts(sStats, 5).some((p) => p.tgUserId === '10'));

// --- weekly auto-game (Sunday 18:00) with a fake FieldClient — stays offline ---
const fakeField: FieldClient = {
  async fetchWorkingHours() {
    return { workingHours: [{ day: 1, start: '18:00', end: '21:00' }], blocked: [] }; // Mon 18/19/20
  },
  async fetchBookings() {
    return [];
  },
};
const emptyField: FieldClient = {
  async fetchWorkingHours() {
    return { workingHours: [], blocked: [] };
  },
  async fetchBookings() {
    return [];
  },
};
const sundayNow = lisbonToUtc(2026, 6, 21, 18, 0); // Sun 2026-06-21 18:00 Lisbon
check('weekly: trigger window true on Sun 18:00 Lisbon', isWeeklyTriggerWindow(sundayNow));
check('weekly: trigger window false on Mon 18:00', !isWeeklyTriggerWindow(lisbonToUtc(2026, 6, 15, 18, 0)));

const wChat = `weekly-${Date.now()}`;
await maybeCreateWeeklyGame(sender, repo, fakeField, { channelId: wChat, createdBy: '1' }, sundayNow);
const wGame = await repo.getCurrentGame(wChat);
check('weekly: auto-game created in VOTING', !!wGame && wGame.status === 'VOTING');
check('weekly: created with the field free slots', wGame != null && (await repo.getSlots(wGame.id)).length === 3);

const sentBeforeW = sent.length;
await maybeCreateWeeklyGame(sender, repo, fakeField, { channelId: wChat, createdBy: '1' }, sundayNow + 60_000);
check(
  'weekly: a second tick in the hour does not duplicate',
  sent.length === sentBeforeW && (await repo.getActiveGames()).filter((g) => g.chatId === wChat).length === 1,
);

const wChatEmpty = `weekly-empty-${Date.now()}`;
const sentBeforeE = sent.length;
await maybeCreateWeeklyGame(sender, repo, emptyField, { channelId: wChatEmpty, createdBy: '1' }, sundayNow);
check(
  'weekly: no free slots → no game and no message',
  (await repo.getCurrentGame(wChatEmpty)) === null && sent.length === sentBeforeE,
);

const wChatMon = `weekly-mon-${Date.now()}`;
await maybeCreateWeeklyGame(sender, repo, fakeField, { channelId: wChatMon, createdBy: '1' }, lisbonToUtc(2026, 6, 15, 18, 0));
check('weekly: wrong day → no game created', (await repo.getCurrentGame(wChatMon)) === null);

console.log(`\n${failures === 0 ? '🎉 All checks passed' : `💥 ${failures} check(s) failed`}`);
await proxy.dispose();
if (failures > 0) throw new Error(`${failures} self-test check(s) failed`);
