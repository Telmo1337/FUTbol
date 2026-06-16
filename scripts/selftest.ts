// Engine self-test: drives the real services against the local D1 with a fake Telegram API.
// Simulates a full weekly loop (vote → winner → RSVP → waitlist → promotion → close).
// Run with: npm run selftest   (no Telegram token needed)
import { getPlatformProxy } from 'wrangler';
import type { Api } from 'grammy';
import type { Env } from '../src/types';
import { createRepo } from '../src/db/repo';
import * as games from '../src/services/games';
import { confirmedIds, splitSquad } from '../src/core/rsvp';
import { pickWinner } from '../src/core/voting';
import { parseDateTime, formatWhen } from '../src/core/time';

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? '✅' : '❌'} ${name}`);
  if (!cond) failures++;
}

// --- Fake Telegram API: records messages instead of sending them ---
const sent: { chatId: number; text: string }[] = [];
let msgId = 1000;
const fakeApi = {
  async sendMessage(chatId: number, text: string) {
    sent.push({ chatId, text });
    return { message_id: ++msgId };
  },
  async editMessageText() {
    return true;
  },
  async editMessageReplyMarkup() {
    return true;
  },
} as unknown as Api;
const lastSent = () => sent[sent.length - 1]?.text ?? '';
const anySentIncludes = (s: string) => sent.some((m) => m.text.includes(s));

// --- Pure-function checks ---
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0); // 2026-06-15 12:00 UTC
check('parseDateTime parses "20/06 18:00"', parseDateTime('20/06 18:00', NOW) !== null);
check('parseDateTime rejects garbage', parseDateTime('amanhã às tantas', NOW) === null);
check('formatWhen produces a label', /\d{2}:\d{2}/.test(formatWhen(NOW)));

const proxy = await getPlatformProxy<Env>();
const repo = createRepo(proxy.env.DB);

// --- End-to-end weekly loop ---
const chatId = -100123456 - msgId; // unique-ish per run
const DAY = 86_400_000;
const slotA = NOW + 2 * DAY;
const slotB = NOW + 3 * DAY;
const slotC = NOW + 4 * DAY;

await games.createGame(fakeApi, repo, {
  chatId,
  createdBy: 1,
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
await games.handleVote(fakeApi, repo, game.id, b.id, 1, NOW);
await games.handleVote(fakeApi, repo, game.id, b.id, 2, NOW);
await games.handleVote(fakeApi, repo, game.id, b.id, 3, NOW);
await games.handleVote(fakeApi, repo, game.id, a.id, 1, NOW);
check('pickWinner picks slot B', pickWinner(slots, await repo.getVotes(game.id)).winner?.id === b.id);

await games.closeVoting(fakeApi, repo, game, NOW + DAY + 1);
game = (await repo.getGame(game.id))!;
check('voting closed → RSVP_OPEN', game.status === 'RSVP_OPEN' && game.winningSlotId === b.id);

// 4 players say IN, in order. cap=3 → #4 waitlisted.
for (const uid of [1, 2, 3, 4]) await games.handleRsvp(fakeApi, repo, game.id, uid, 'IN', NOW + DAY + 1 + uid);
let split = splitSquad(await repo.getRsvps(game.id), game.capPlayers);
check('squad: 3 confirmed', split.confirmed.length === 3);
check('squad: 1 waitlisted (user 4)', split.waitlist.length === 1 && split.waitlist[0].tgUserId === 4);
check('GAME_ON nudge fired when min reached', anySentIncludes('Temos jogo'));

// user 1 (earliest) drops out → user 4 promoted + notified
const sentBefore = sent.length;
await games.handleRsvp(fakeApi, repo, game.id, 1, 'OUT', NOW + DAY + 100);
const confirmed = confirmedIds(await repo.getRsvps(game.id), game.capPlayers);
check('after dropout: user 4 promoted into squad', confirmed.has(4) && !confirmed.has(1));
check('promotion message sent', sent.length > sentBefore && anySentIncludes('abriu uma vaga'));

// idempotency: re-running the same OUT must NOT re-notify
const sentBefore2 = sent.length;
await games.handleRsvp(fakeApi, repo, game.id, 1, 'OUT', NOW + DAY + 200);
check('repeat dropout does not double-notify', !sent.slice(sentBefore2).some((m) => m.text.includes('abriu uma vaga')));

// close RSVP → confirmed (3 >= min 2) → LOCKED
game = (await repo.getGame(game.id))!;
await games.closeRsvp(fakeApi, repo, game, game.rsvpCloseAt! + 1);
game = (await repo.getGame(game.id))!;
check('RSVP closed → LOCKED', game.status === 'LOCKED');
check('final squad announced', anySentIncludes('Equipa final'));

console.log(`\n${failures === 0 ? '🎉 All checks passed' : `💥 ${failures} check(s) failed`}`);
await proxy.dispose();
if (failures > 0) throw new Error(`${failures} self-test check(s) failed`);
