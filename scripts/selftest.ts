// Engine self-test: drives the real services against the local D1 with a fake Discord sender.
// Simulates a full weekly loop (vote → winner → RSVP → waitlist → promotion → close → check-in).
// User/channel ids are strings here, exactly like real Discord snowflakes.
// Run with: npm run selftest   (no Discord token needed)
import { getPlatformProxy } from 'wrangler';
import type { Env, Game } from '../src/types';
import type { Sender } from '../src/discord/rest';
import { createRepo } from '../src/db/repo';
import * as games from '../src/services/games';
import { confirmedIds, splitSquad } from '../src/core/rsvp';
import { pickWinner, tallyVotes } from '../src/core/voting';
import { renderVoteMessage } from '../src/render/vote-message';
import { parseDateTime, formatWhen, formatDay, discordTs, lisbonToUtc, lisbonParts, monthWindow, formatMonth } from '../src/core/time';
import { computeFreeSlots } from '../src/core/availability';
import { isAutoOpenHour, maybeOpenNextGame } from '../src/services/weekly';
import type { FieldClient } from '../src/services/field';
import { loadStats } from '../src/services/stats';
import {
  computeStats,
  statFor,
  topByGhosts,
  topByReliability,
  topByBestStreak,
  topByEarlyBird,
  topByWins,
  topByWinPct,
  topByBestWinStreak,
  topByGoals,
  topByAssists,
  perfectRecord,
  playerOfTheMonth,
  reliabilityRawPct,
} from '../src/core/stats';
import { applyTeamSelect, loadTeamsState, publishTeams, recordResult } from '../src/services/teams';
import { loadCaptureState } from '../src/services/capture';
import { loadPaymentState, setPaidSet } from '../src/services/payments';
import { renderPaymentBoard } from '../src/render/payment-message';
import { parsePriceField } from '../src/discord/payments';
import { renderCapturePanel } from '../src/render/capture-message';
import { renderResultCard, renderTeamsBoard } from '../src/render/teams-message';
import { seedTestGame } from '../src/services/testseed';
import type { Repo } from '../src/db/repo';
import { M } from '../src/messages';
import { loadHistory } from '../src/services/history';
import { renderComparison, renderPersonalCard, renderStats, renderTopScorers } from '../src/render/stats-message';
import { assistsEnabled, golosEnabled, pagamentosEnabled, formatEuros, esc, parseAdminIds } from '../src/util';
import { renderHistory } from '../src/render/history-message';
import { capturePanelComponents, historyComponents, parseCb } from '../src/discord/components';
import { parseNovoJogoFields } from '../src/discord/novojogo';
import { MIN_VOTE_WINDOW_MS, VOTE_MAX_WAIT_MS } from '../src/config';

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? '✅' : '❌'} ${name}`);
  if (!cond) failures++;
}

// --- Fake Discord sender: records message contents instead of sending them ---
const sent: { chatId: string; text: string }[] = [];
const edits: { msgId: string; content?: string; componentsCleared: boolean }[] = [];
let msgId = 1000;
const sender: Sender = {
  async send(chatId, msg) {
    // Boards are embeds — record title + description + any field name/value + footer.
    const emb = (msg.embeds ?? [])
      .map((e) => {
        const x = e as {
          title?: string;
          description?: string;
          fields?: { name: string; value: string }[];
          footer?: { text: string };
        };
        const f = (x.fields ?? []).map((fl) => `${fl.name}\n${fl.value}`).join('\n');
        return [x.title ?? '', x.description ?? '', f, x.footer?.text ?? ''].join('\n');
      })
      .join('\n');
    sent.push({ chatId, text: `${msg.content ?? ''}\n${emb}` });
    return String(++msgId);
  },
  async edit(_chatId, editMsgId, msg) {
    edits.push({ msgId: editMsgId, content: msg.content, componentsCleared: Array.isArray(msg.components) && msg.components.length === 0 });
  },
};
const anySentIncludes = (s: string) => sent.some((m) => m.text.includes(s));
const editsFor = (id: string) => edits.filter((e) => e.msgId === id);

// A sender whose send() always throws — for exercising the openRsvp failure/revert path.
const throwingSender: Sender = {
  async send() {
    throw new Error('boom');
  },
  async edit() {
    /* not reached before the throw in the scenarios we use this for */
  },
};

// --- Pure-function checks ---
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0); // 2026-06-15 12:00 UTC
check('parseDateTime parses "20/06 18:00"', parseDateTime('20/06 18:00', NOW) !== null);
check('parseDateTime rejects garbage', parseDateTime('amanhã às tantas', NOW) === null);
check('formatWhen produces a label', /\d{2}:\d{2}/.test(formatWhen(NOW)));
// NOW = Mon 2026-06-15 12:00 UTC → Lisbon 13:00. Deterministic pt-PT labels (Workers-ICU-proof).
check('formatDay: pt-PT short label', formatDay(NOW) === 'Seg, 15 jun');
check('formatWhen: pt-PT short + time', formatWhen(NOW) === 'Seg, 15 jun · 13:00');
check('formatMonth: pt-PT long lowercase', formatMonth(NOW) === 'junho');
check('discordTs: native live timestamp tag (seconds + style)', /^<t:\d+:R>$/.test(discordTs(NOW)) && discordTs(NOW, 'F') === `<t:${Math.floor(NOW / 1000)}:F>`);

// --- validation hardening: parseDateTime rejects impossible calendar days ---
check('parseDateTime rejects 30 February', parseDateTime('30/02 21:00', NOW) === null);
check('parseDateTime rejects 31 April', parseDateTime('31/04/2026 20:00', NOW) === null);
check('parseDateTime rejects 29 Feb in a non-leap year', parseDateTime('29/02/2027 20:00', NOW) === null);
check('parseDateTime accepts 29 Feb in a leap year', parseDateTime('29/02/2028 20:00', NOW) !== null);

// --- validation hardening: /novojogo "Jogadores" field rejects 0 and junk ---
const baseNovoFields = { slots: '20/06 18:00\n21/06 18:00' };
check('parseNovoJogoFields rejects "0" players', 'error' in parseNovoJogoFields({ ...baseNovoFields, players: '0' }, NOW));
check('parseNovoJogoFields rejects "0-14" players', 'error' in parseNovoJogoFields({ ...baseNovoFields, players: '0-14' }, NOW));
check('parseNovoJogoFields rejects junk players ("x10")', 'error' in parseNovoJogoFields({ ...baseNovoFields, players: 'x10' }, NOW));
check('parseNovoJogoFields accepts "10-14"', !('error' in parseNovoJogoFields({ ...baseNovoFields, players: '10-14' }, NOW)));

// --- esc(): masked-link injection closed + ping defang still works ---
check(
  'esc: escapes markdown link syntax (no masked link)',
  esc('[clica aqui](https://evil.example)') === '\\[clica aqui\\]\\(https://evil.example\\)',
);
check('esc: defangs @everyone', !esc('@everyone').includes('@everyone'));
check('esc: defangs a raw mention', !esc('<@123456>').includes('<@'));

// --- parseAdminIds: trims, dedupes, tolerant of undefined/empty parts ---
const parsedAdminIds = parseAdminIds(' 1, 2,,3 ,2');
check('parseAdminIds: parses + trims + dedupes', parsedAdminIds.size === 3 && parsedAdminIds.has('1') && parsedAdminIds.has('2') && parsedAdminIds.has('3'));
check('parseAdminIds: undefined → empty set', parseAdminIds(undefined).size === 0);

// vote board shows who voted what (names listed under each slot)
const demoSlots = [{ id: 7, gameId: 1, kickoffAt: NOW, label: 'Sáb 18:00', sortOrder: 0 }];
const demoBoard = renderVoteMessage(
  'Campo',
  tallyVotes(demoSlots, [{ gameId: 1, slotId: 7, tgUserId: 'a', createdAt: NOW }]),
  NOW,
  1,
  new Map([[7, ['Telmo', 'Ana']]]),
  14,
);
check('vote board lists voter names under a slot', demoBoard.includes('Telmo') && demoBoard.includes('Ana'));
check('vote board: deadline shown as a live Discord timestamp', demoBoard.includes('<t:'));
check('vote board: footer announces the early close at minPlayers votes', demoBoard.includes('Fecha quando um horário tiver **14** votos'));

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
  minPlayers: 3, // 3 (not 2) so the setup votes below stay under the early-close threshold
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
// users 1,2 vote slot B; user 1 also votes slot A → B wins clearly. B stays at 2 < minPlayers (3),
// so the early-close threshold doesn't fire mid-setup and the explicit close below does the work.
await games.handleVote(sender, repo, game.id, b.id, '1', NOW);
await games.handleVote(sender, repo, game.id, b.id, '2', NOW);
await games.handleVote(sender, repo, game.id, a.id, '1', NOW);
check('pickWinner picks slot B', pickWinner(slots, await repo.getVotes(game.id)).winner?.id === b.id);
const namedVotes = await repo.getVotesWithNames(game.id);
check(
  'getVotesWithNames joins votes to names',
  namedVotes.length === 3 && namedVotes.filter((v) => v.slotId === b.id).length === 2,
);

// Forced, like the admin's /fecharvotacao: an unforced (tick-style) close always cancels now.
await games.closeVoting(sender, repo, game, NOW + DAY + 1, { forced: true });
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

// close RSVP → confirmed (3 >= min 3) → LOCKED
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

// --- v3 e2e: teams + result on the played game (confirmed squad = users 2,3,4) ---
game = (await repo.getGame(game.id))!;
check('teams: placeholder auto-posted at LOCKED', game.teamsMsgId != null && anySentIncludes('Equipas a caminho'));
await applyTeamSelect(repo, game, 'A', ['2']); // Alpha = user 2
await applyTeamSelect(repo, game, 'B', ['3', '4']); // Beta = users 3,4
const tView = (await loadTeamsState(repo, game)).view;
check('teams: Alpha=1, Beta=2, none left out', tView.alpha.length === 1 && tView.beta.length === 2 && tView.out.length === 0);
check(
  'teams: publish refused when a side is empty',
  (await (async () => {
    await applyTeamSelect(repo, game, 'B', []);
    const refused = await publishTeams(sender, repo, (await repo.getGame(game.id))!, game.checkinCloseAt! + 5);
    await applyTeamSelect(repo, game, 'B', ['3', '4']); // restore
    return refused;
  })()) === false,
);
check('teams: publish succeeds with both sides', (await publishTeams(sender, repo, game, game.checkinCloseAt! + 10)) === true);
game = (await repo.getGame(game.id))!;
check('teams: publish locks the teams (teams_locked_at set)', game.teamsLockedAt != null);
// score: Alpha 5 – 2 Beta → user 2 wins, users 3 & 4 lose
await recordResult(sender, repo, game, 5, 2, '1', game.checkinCloseAt! + 20);
check('result: public card posted', anySentIncludes('Resultado') && anySentIncludes('Vitória da'));
// embed fields: Alpha | Beta side by side on the result card + teams board
const demoView = { alpha: [{ tgUserId: '2', displayName: 'A' }], beta: [{ tgUserId: '3', displayName: 'B' }], out: [{ tgUserId: '4', displayName: 'C' }] };
const rcCard = renderResultCard({ ...demoView, out: [] }, 3, 2, 'Sáb');
check('result card: Alpha/Beta as 2 inline embed fields + score in body', (rcCard.fields?.length ?? 0) === 2 && rcCard.fields?.[0].inline === true && (rcCard.description ?? '').includes('Vitória'));
const tbCard = renderTeamsBoard(demoView);
check('teams board: Alpha/Beta inline + "de fora" full-width field', (tbCard.fields?.length ?? 0) === 3 && tbCard.fields?.[0].inline === true && tbCard.fields?.[2].inline !== true);
const sR = await loadStats(repo, chatId);
check('result: user 2 has 1 win (V-E-D 1-0-0)', statFor(sR, '2', 'u2').wins === 1 && statFor(sR, '2', 'u2').losses === 0 && statFor(sR, '2', 'u2').resultGames === 1);
check('result: user 3 has 1 loss', statFor(sR, '3', 'u3').losses === 1 && statFor(sR, '3', 'u3').wins === 0);
// re-recording overwrites (Beta wins 1–4) → user 2 now has a loss, not a win
await recordResult(sender, repo, game, 1, 4, '1', game.checkinCloseAt! + 30);
const sR2 = await loadStats(repo, chatId);
check('result: re-recording overwrites the score', statFor(sR2, '2', 'u2').wins === 0 && statFor(sR2, '2', 'u2').losses === 1 && statFor(sR2, '3', 'u3').wins === 1);

// --- v4 e2e: ⚽ golos/assistências capture on the played game ---
// Teams here: Alpha = user 2, Beta = users 3 & 4. Score is Alpha 1–4 Beta.
await repo.addGoalEvent(game.id, '3', 'G', game.checkinCloseAt! + 40);
await repo.addGoalEvent(game.id, '3', 'G', game.checkinCloseAt! + 41);
await repo.addGoalEvent(game.id, '4', 'G', game.checkinCloseAt! + 42);
await repo.addGoalEvent(game.id, '4', 'G', game.checkinCloseAt! + 43); // extra goal, undone below
await repo.undoLastGoalEvent(game.id, 'G'); // removes user 4's most recent goal
await repo.addGoalEvent(game.id, '2', 'A', game.checkinCloseAt! + 44);
const capState = await loadCaptureState(repo, game);
check('capture: tallies — user 3 has 2 goals, user 4 has 1', (capState.goals.get('3') ?? 0) === 2 && (capState.goals.get('4') ?? 0) === 1);
check('capture: undo removed the extra goal (3 goals total)', [...capState.goals.values()].reduce((a, b) => a + b, 0) === 3);
check('capture: assist recorded for user 2', (capState.assists.get('2') ?? 0) === 1);
const capPanel = renderCapturePanel(capState);
check('capture panel: shows the score line + a scorer tally', capPanel.includes('🅰️ 1–4 🅱️') && capPanel.includes('⚽×2'));
const sG = await loadStats(repo, chatId);
check('stats: golos counted (user 3 = 2, top scorer)', statFor(sG, '3', 'u3').goals === 2 && topByGoals(sG, 5)[0]?.tgUserId === '3');
check('stats: assists counted (user 2 = 1, top assister)', statFor(sG, '2', 'u2').assists === 1 && topByAssists(sG, 5)[0]?.tgUserId === '2');
check('render: ⚽ Goleadores + 🅰️ Assistências boards present', renderStats(sG, sG, 'junho', null).includes('Goleadores') && renderStats(sG, sG, 'junho', null).includes('Assistências'));
check('render: /topmarcadores shows just the two boards', renderTopScorers(sG).includes('Goleadores') && renderTopScorers(sG).includes('Assistências'));

// --- 💶 pagamentos e2e on the played game (confirmed squad = users 2,3,4) ---
check('pay flag: default on, explicit off values off', pagamentosEnabled({}) === true && !pagamentosEnabled({ PAGAMENTOS_ENABLED: 'false' }) && !pagamentosEnabled({ PAGAMENTOS_ENABLED: 'off' }));
check('formatEuros: cents → pt-PT euros', formatEuros(500) === '5,00€' && formatEuros(550) === '5,50€' && formatEuros(1234) === '12,34€');
check('parsePriceField: accepts 5 / 5,50 / 3.5', (parsePriceField('5') as { cents: number }).cents === 500 && (parsePriceField('5,50') as { cents: number }).cents === 550 && (parsePriceField('3.5') as { cents: number }).cents === 350);
check('parsePriceField: rejects junk, negatives, zero', 'error' in parsePriceField('abc') && 'error' in parsePriceField('-1') && 'error' in parsePriceField('0'));
await repo.setGamePrice(game.id, 500, NOW);
await setPaidSet(repo, (await repo.getGame(game.id))!, ['2', '4', '999'], NOW); // 999 not in squad → filtered out
const payState = await loadPaymentState(repo, (await repo.getGame(game.id))!);
check('pay: payers = confirmed squad (3 players)', payState.players.length === 3);
check('pay: price stored (500c)', payState.priceCents === 500);
check('pay: only squad members marked paid (2 & 4, not 3/999)', payState.paid.has('2') && payState.paid.has('4') && !payState.paid.has('3') && !payState.paid.has('999') && payState.paid.size === 2);
const payBoard = renderPaymentBoard(payState);
check('pay board: shows price, collected/expected + owe section', payBoard.includes('5,00€') && payBoard.includes('10,00€') && payBoard.includes('15,00€') && payBoard.includes('Em falta'));
await setPaidSet(repo, (await repo.getGame(game.id))!, [], NOW); // untick everyone
check('pay: clearing the selection marks nobody paid', (await loadPaymentState(repo, (await repo.getGame(game.id))!)).paid.size === 0);

// --- GOLOS_ENABLED feature flag: default on; "false"/"0"/"off"/"no" turn it off ---
check('flag: default (unset) is ON', golosEnabled({}) === true && golosEnabled({ GOLOS_ENABLED: 'true' }) === true);
check('flag: explicit off values turn it OFF', !golosEnabled({ GOLOS_ENABLED: 'false' }) && !golosEnabled({ GOLOS_ENABLED: '0' }) && !golosEnabled({ GOLOS_ENABLED: 'off' }));
check('flag off: /stats hides the golos boards', !renderStats(sG, sG, 'junho', null, false).includes('Goleadores'));
check('flag off: personal card hides the ⚽/🅰️ lines', !renderPersonalCard(statFor(sG, '3', 'u3'), sG, false).includes('⚽ Golos'));
check('flag off: comparison hides the ⚽/🅰️ rows', !renderComparison(statFor(sG, '3', 'u3'), statFor(sG, '4', 'u4'), false).includes('⚽ Golos'));
check(
  'flag off: /historico hides the scorer (shown when on)',
  renderHistory(await loadHistory(repo, chatId, 0, null, null, true)).includes('⚽') &&
    !renderHistory(await loadHistory(repo, chatId, 0, null, null, false)).includes('⚽'),
);

// --- ASSISTS_ENABLED sub-flag: keep golos on, drop only 🅰️ assistências ---
// chatId scorers: user 3 = 2 golos, user 4 = 1 golo, user 2 = 1 assist.
check('assists flag: default on, explicit off values off', assistsEnabled({}) === true && !assistsEnabled({ ASSISTS_ENABLED: 'false' }) && !assistsEnabled({ ASSISTS_ENABLED: 'off' }));
check(
  'assists off: /stats keeps ⚽ Goleadores but drops 🅰️ Assistências board',
  renderStats(sG, sG, 'junho', null, true, false).includes('⚽ **Goleadores**') &&
    !renderStats(sG, sG, 'junho', null, true, false).includes('🅰️ **Assistências**') &&
    renderStats(sG, sG, 'junho', null, true, true).includes('🅰️ **Assistências**'),
);
check(
  'assists off: personal card drops the 🅰️ line (kept when on)',
  renderPersonalCard(statFor(sG, '2', 'u2'), sG, true, true).includes('🅰️ Assistências') &&
    !renderPersonalCard(statFor(sG, '2', 'u2'), sG, true, false).includes('🅰️ Assistências'),
);
check(
  'assists off: comparison drops the 🅰️ row (kept when on)',
  renderComparison(statFor(sG, '2', 'u2'), statFor(sG, '3', 'u3'), true, true).includes('🅰️ Assistências') &&
    !renderComparison(statFor(sG, '2', 'u2'), statFor(sG, '3', 'u3'), true, false).includes('🅰️ Assistências'),
);
check(
  'assists off: /topmarcadores drops the 🅰️ board (kept when on)',
  renderTopScorers(sG, true).includes('🅰️ **Assistências**') && !renderTopScorers(sG, false).includes('🅰️ **Assistências**'),
);
const selectCount = (rows: { components: { type: number }[] }[]) => rows.filter((r) => r.components[0]?.type === 3).length;
check(
  'assists off: capture panel drops the 🅰️ select',
  selectCount(capturePanelComponents(game.id, capState.players, true)) === 2 &&
    selectCount(capturePanelComponents(game.id, capState.players, false)) === 1,
);
check(
  'assists off: capture tally hides 🅰️ (shown when on)',
  renderCapturePanel(capState, true).includes('🅰️×1') && !renderCapturePanel(capState, false).includes('🅰️×'),
);

// --- 📜 histórico: e2e page off the played game + pure render/pagination ---
// chatId now has exactly 1 PLAYED game, score Alpha 1–4 Beta (user 2 = Alpha loss, 3 & 4 = Beta win).
const hAll = await loadHistory(repo, chatId, 0, null, null);
check('history: one game, single page', hAll.entries.length === 1 && hAll.totalPages === 1);
const hAllText = renderHistory(hAll);
check('history global: shows the Beta-win line', /1[–-]4/.test(hAllText) && hAllText.includes('🏆 Beta') && !hAllText.includes('sem resultado'));
check('history: single page → no pagination buttons', historyComponents(hAll.page, hAll.totalPages, hAll.tgUserId).length === 0);

const hLoser = renderHistory(await loadHistory(repo, chatId, 0, '2', 'Dois')); // Alpha → lost, his goals first 1–4
check('history person: Alpha loser shows Derrota (1–4)', hLoser.includes('Alpha') && /Derrota \(1[–-]4\)/.test(hLoser));
const hWinner = renderHistory(await loadHistory(repo, chatId, 0, '3', 'Tres')); // Beta → won, his goals first 4–1
check('history person: Beta winner shows Vitória (4–1)', hWinner.includes('Beta') && /Vit[oó]ria \(4[–-]1\)/.test(hWinner));
check('history person: empty state for a no-show', renderHistory(await loadHistory(repo, chatId, 0, '999', 'Zé')).includes('ainda não tem jogos'));

// pure: pagination math + custom_id round-trip + date label
const pager = (historyComponents(1, 3, null)[0] as { components: { custom_id: string; disabled?: boolean; label: string }[] }).components;
check(
  'history pager: middle page of 3 → both arrows live, indicator disabled',
  pager.length === 3 &&
    pager[0].custom_id === 'hg:0' && pager[0].disabled !== true &&
    pager[1].disabled === true && pager[1].label.includes('2/3') &&
    pager[2].custom_id === 'hg:2' && pager[2].disabled !== true,
);
const pagerP = (historyComponents(0, 2, '123')[0] as { components: { custom_id: string; disabled?: boolean }[] }).components;
check('history pager: per-person ids + prev disabled on first page', pagerP[0].disabled === true && pagerP[2].custom_id === 'hp:1:123');
check('parseCb hg round-trip', JSON.stringify(parseCb('hg:2')) === JSON.stringify({ kind: 'historyPage', page: 2, tgUserId: null }));
check('parseCb hp round-trip', JSON.stringify(parseCb('hp:1:123')) === JSON.stringify({ kind: 'historyPage', page: 1, tgUserId: '123' }));
check('parseCb rejects non-numeric hp user', parseCb('hp:1:abc') === null);
check('formatDay: date-only label (no time)', formatDay(NOW).length > 0 && !formatDay(NOW).includes(':'));

// --- 📜 histórico paginado: seed several games (/testjogo jogos:6) and walk the pages ---
const histChat = `hist-${Date.now()}`;
const seeded = await seedTestGame(sender, repo, histChat, 'admin', NOW, 6);
check('seed: /testjogo jogos:6 creates 6 complete games', seeded.games === 6 && seeded.players === 8);
const hp0 = await loadHistory(repo, histChat, 0, null, null);
check('history: 6 games → 2 pages, first page full (5)', hp0.totalPages === 2 && hp0.entries.length === 5);
check('history: newest-first ordering', hp0.entries.every((e, k) => k === 0 || hp0.entries[k - 1].kickoffAt >= e.kickoffAt));
check('history: every seeded game has a score', hp0.entries.every((e) => e.goalsA != null && e.goalsB != null));
check('history: seeded games show a ⚽ top scorer', renderHistory(hp0).includes('⚽ Tester'));
const hp1 = await loadHistory(repo, histChat, 1, null, null);
check('history: second page has the remaining 1', hp1.page === 1 && hp1.entries.length === 1);
check('history: page clamps past the end', (await loadHistory(repo, histChat, 99, null, null)).page === 1);
check('history pager: 2 pages → arrow row present', historyComponents(hp0.page, hp0.totalPages, null).length === 1);
const histPerson = await loadHistory(repo, histChat, 0, '900000000000000001', 'Tester 1'); // Alpha, present in all 6
check('history person: present in all 6 (2 pages), side known each', histPerson.totalPages === 2 && histPerson.entries.every((e) => e.side != null));
// single seed still wipes + leaves exactly one game (the original /testjogo behaviour)
const one = await seedTestGame(sender, repo, histChat, 'admin', NOW, 1);
check('seed: /testjogo (no count) wipes to a single game', one.games === 1 && (await loadHistory(repo, histChat, 0, null, null)).totalPages === 1);

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
  results: [],
  teams: [],
  events: [],
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

// --- render: personal card with rank + comparison ---
const cardAna = renderPersonalCard(p10, sStats);
check('card: shows appearances rank (1º de 3)', cardAna.includes('1º de 3'));
check('card: shows reliability rank (1º de 1)', cardAna.includes('1º de 1'));
check('card: no streak rank when current streak is 0', !/Sequência:.*º de/.test(cardAna));
const cardZero = renderPersonalCard(statFor(sStats, '999', 'Zé'), sStats);
check('card: zeroed player (never played) shows the empty card', cardZero.includes('Zé') && cardZero.includes('Aparece num jogo'));
check('statFor: unknown id returns a zeroed row with the given name', statFor(sStats, '999', 'Zé').appearances === 0 && statFor(sStats, '999', 'Zé').name === 'Zé');

const comp = renderComparison(p10, p20); // Ana (3 jogos, 75%, 1 fantasma) vs Bea (1 jogo, sem fiab., 0 fantasmas)
check('comparison: includes both names', comp.includes('Ana') && comp.includes('Bea'));
check('comparison: bolds the appearances leader', comp.includes('Presenças: **3** — 1'));
check('comparison: lower ghosts wins (bolds the 0)', comp.includes('Fantasma: 1 — **0**'));
check('comparison: missing reliability shows as —', comp.includes('Fiabilidade: **75%** — —'));

// --- monthly view, Jogador do Mês, early-bird & best-streak boards ---
// One May game + three June games; A always confirms first and shows up, B misses June's middle game.
const may = lisbonToUtc(2026, 5, 10, 20, 0);
const jun1 = lisbonToUtc(2026, 6, 5, 20, 0);
const jun2 = lisbonToUtc(2026, 6, 12, 20, 0);
const jun3 = lisbonToUtc(2026, 6, 19, 20, 0);
const monthInput = {
  games: [
    { id: 1, capPlayers: 2, kickoffAt: may },
    { id: 2, capPlayers: 2, kickoffAt: jun1 },
    { id: 3, capPlayers: 2, kickoffAt: jun2 },
    { id: 4, capPlayers: 2, kickoffAt: jun3 },
  ],
  rsvps: [
    { gameId: 1, tgUserId: 'A', status: 'IN' as const, rankAt: 1 }, // A is always first to confirm
    { gameId: 2, tgUserId: 'A', status: 'IN' as const, rankAt: 1 },
    { gameId: 3, tgUserId: 'A', status: 'IN' as const, rankAt: 1 },
    { gameId: 4, tgUserId: 'A', status: 'IN' as const, rankAt: 1 },
    { gameId: 1, tgUserId: 'B', status: 'IN' as const, rankAt: 2 },
    { gameId: 2, tgUserId: 'B', status: 'IN' as const, rankAt: 2 },
    { gameId: 3, tgUserId: 'B', status: 'IN' as const, rankAt: 2 },
    { gameId: 4, tgUserId: 'B', status: 'IN' as const, rankAt: 2 },
  ],
  presentKeys: new Set(['1:A', '2:A', '3:A', '4:A', '1:B', '2:B', '4:B']), // B no-shows jun2 (game 3)
  names: new Map([
    ['A', 'Ari'],
    ['B', 'Bru'],
  ]),
  results: [],
  teams: [],
  events: [],
};
const allTime = computeStats(monthInput);
const monthStats = computeStats(monthInput, monthWindow(NOW)); // NOW is June 2026

check('month: window keeps only June games (3 of 4)', monthStats.totalGames === 3 && allTime.totalGames === 4);
check('month: A confirmed + present all 3, no ghost', statFor(monthStats, 'A', 'Ari').appearances === 3 && statFor(monthStats, 'A', 'Ari').ghosts === 0);
check('month: B is a ghost once (jun2 no-show)', statFor(monthStats, 'B', 'Bru').ghosts === 1 && statFor(monthStats, 'B', 'Bru').appearances === 2);
check('month: raw reliability ungated (B = 67%)', reliabilityRawPct(statFor(monthStats, 'B', 'Bru')) === 67);
check('MOTM: Ari wins the month', playerOfTheMonth(monthStats)?.tgUserId === 'A');
const mayOnly = computeStats(monthInput, { since: lisbonToUtc(2026, 5, 1, 0, 0), until: lisbonToUtc(2026, 6, 1, 0, 0) });
check('MOTM: no winner when the month has < 2 games', mayOnly.totalGames === 1 && playerOfTheMonth(mayOnly) === null);

check('early-bird: A was first to confirm all 4 games', statFor(allTime, 'A', 'Ari').earlyBirdWins === 4 && statFor(allTime, 'B', 'Bru').earlyBirdWins === 0);
check('early-bird board: A on top', topByEarlyBird(allTime, 5)[0]?.tgUserId === 'A');
check('best-streak board: A best is 4 (all-time)', topByBestStreak(allTime, 5)[0]?.tgUserId === 'A' && statFor(allTime, 'A', 'Ari').bestStreak === 4);

// perfect record: 100% present-while-confirmed across >= PERFECT_RECORD_MIN_GAMES (5) games
const perfectInput = {
  games: [1, 2, 3, 4, 5].map((id) => ({ id, capPlayers: 2, kickoffAt: id * 1000 })),
  rsvps: [1, 2, 3, 4, 5].flatMap((g) => [
    { gameId: g, tgUserId: 'P', status: 'IN' as const, rankAt: 1 },
    { gameId: g, tgUserId: 'Q', status: 'IN' as const, rankAt: 2 },
  ]),
  presentKeys: new Set(['1:P', '2:P', '3:P', '4:P', '5:P', '1:Q', '2:Q', '4:Q', '5:Q']), // Q misses game 3
  names: new Map([
    ['P', 'Perfeito'],
    ['Q', 'Quase'],
  ]),
  results: [],
  teams: [],
  events: [],
};
const perfStats = computeStats(perfectInput);
check('perfect record: P qualifies (5/5), Q excluded (1 ghost)', perfectRecord(perfStats, 5).map((p) => p.tgUserId).join() === 'P');

// --- v3 pure: wins / draws / losses, win% gating, win streak ---
// W is always on side A, L on side B. Scores: A wins, A wins, draw, B wins.
const winInput = {
  games: [1, 2, 3, 4].map((id) => ({ id, capPlayers: 2, kickoffAt: id * 1000 })),
  rsvps: [1, 2, 3, 4].flatMap((g) => [
    { gameId: g, tgUserId: 'W', status: 'IN' as const, rankAt: 1 },
    { gameId: g, tgUserId: 'L', status: 'IN' as const, rankAt: 2 },
  ]),
  presentKeys: new Set<string>(),
  names: new Map([
    ['W', 'Vence'],
    ['L', 'Perde'],
  ]),
  results: [
    { gameId: 1, goalsA: 3, goalsB: 1 },
    { gameId: 2, goalsA: 2, goalsB: 0 },
    { gameId: 3, goalsA: 1, goalsB: 1 },
    { gameId: 4, goalsA: 0, goalsB: 2 },
  ],
  teams: [1, 2, 3, 4].flatMap((g) => [
    { gameId: g, tgUserId: 'W', side: 'A' as const },
    { gameId: g, tgUserId: 'L', side: 'B' as const },
  ]),
  events: [],
};
const winStats = computeStats(winInput);
const W = statFor(winStats, 'W', 'Vence');
check('wins: W record V-E-D 2-1-1 over 4 result games', W.wins === 2 && W.draws === 1 && W.losses === 1 && W.resultGames === 4);
check('wins: W win% = 50 (2/4)', W.winPct === 50);
check('wins: W current streak 0 (lost last), best 2', W.currentWinStreak === 0 && W.bestWinStreak === 2);
const L = statFor(winStats, 'L', 'Perde');
check('wins: L record V-E-D 1-1-2 (mirror)', L.wins === 1 && L.draws === 1 && L.losses === 2);
check('wins: L current streak 1 (won last)', L.currentWinStreak === 1 && L.bestWinStreak === 1);
check('wins board: W on top', topByWins(winStats, 5)[0]?.tgUserId === 'W');
check('win% board: gated to >= MIN_GAMES_FOR_WINRATE', topByWinPct(winStats, 5).every((p) => p.resultGames >= 3));
check('win-streak board: W best 2 on top', topByBestWinStreak(winStats, 5)[0]?.tgUserId === 'W');
// render: result lines appear on the card, comparison and group boards
const cardW = renderPersonalCard(W, winStats);
check('card: shows V-E-D and win%', cardW.includes('V-E-D 2-1-1') && cardW.includes('% de vitórias'));
const compWL = renderComparison(W, L);
check('comparison: bolds the wins leader (W=2 over L=1)', compWL.includes('Vitórias: **2** — 1'));
check('group render: result boards present', renderStats(winStats, winStats, 'junho', null).includes('Mais vitórias'));

// render: the month block + new boards appear in /stats output
const groupRender = renderStats(allTime, monthStats, formatMonth(NOW), null);
check('render: month block shows the month name', groupRender.includes('Este mês') && groupRender.includes(formatMonth(NOW)));
check('render: MOTM badge names the winner', groupRender.includes('Jogador do Mês') && groupRender.includes('Ari'));
check('render: best-streak & early-bird boards present', groupRender.includes('Maior sequência de sempre') && groupRender.includes('Early bird'));
const emptyMonth = computeStats(monthInput, { since: lisbonToUtc(2027, 1, 1, 0, 0), until: lisbonToUtc(2027, 2, 1, 0, 0) });
check('render: empty month shows the gentle fallback', emptyMonth.totalGames === 0 && renderStats(allTime, emptyMonth, 'janeiro', null).includes('ainda sem jogos este mês'));

// --- event-driven auto-game with a fake FieldClient — stays offline ---
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
const dayNow = lisbonToUtc(2026, 6, 16, 18, 0); // Tue 2026-06-16 18:00 Lisbon — a daytime hour
check('auto: open hour true at 18:00 on a weekday', isAutoOpenHour(dayNow));
check('auto: open hour false at 03:00 (too early)', !isAutoOpenHour(lisbonToUtc(2026, 6, 16, 3, 0)));
check('auto: open hour false at 23:00 (too late)', !isAutoOpenHour(lisbonToUtc(2026, 6, 16, 23, 0)));

const wChat = `auto-${Date.now()}`;
await maybeOpenNextGame(sender, repo, fakeField, { channelId: wChat, createdBy: '1' }, dayNow);
const wGame = await repo.getCurrentGame(wChat);
check('auto: next game opened in VOTING', !!wGame && wGame.status === 'VOTING');
check('auto: created with the field free slots', wGame != null && (await repo.getSlots(wGame.id)).length === 3);

const sentBeforeW = sent.length;
await maybeOpenNextGame(sender, repo, fakeField, { channelId: wChat, createdBy: '1' }, dayNow + 60_000);
check(
  'auto: a second tick while a game is in progress does not duplicate',
  sent.length === sentBeforeW && (await repo.getActiveGames()).filter((g) => g.chatId === wChat).length === 1,
);

const wChatEmpty = `auto-empty-${Date.now()}`;
const sentBeforeE = sent.length;
await maybeOpenNextGame(sender, repo, emptyField, { channelId: wChatEmpty, createdBy: '1' }, dayNow);
check(
  'auto: no free slots → no game and no message',
  (await repo.getCurrentGame(wChatEmpty)) === null && sent.length === sentBeforeE,
);

const wChatNight = `auto-night-${Date.now()}`;
await maybeOpenNextGame(sender, repo, fakeField, { channelId: wChatNight, createdBy: '1' }, lisbonToUtc(2026, 6, 16, 3, 0));
check('auto: off-hours → no game created', (await repo.getCurrentGame(wChatNight)) === null);

// Event-driven: once the previous game ends (PLAYED), the next one opens — but the cooldown
// stops it reopening immediately, then lets it through once enough time has passed.
await repo.setStatus(wGame!.id, 'PLAYED', dayNow);
check('auto: previous game no longer active after PLAYED', (await repo.getCurrentGame(wChat)) === null);
await maybeOpenNextGame(sender, repo, fakeField, { channelId: wChat, createdBy: '1' }, dayNow + 60_000);
check('auto: cooldown blocks reopening right after the last game', (await repo.getCurrentGame(wChat)) === null);
const nextDay = lisbonToUtc(2026, 6, 17, 10, 0); // Wed 10:00 — 16h later, past the cooldown, daytime
await maybeOpenNextGame(sender, repo, fakeField, { channelId: wChat, createdBy: '1' }, nextDay);
const wGame2 = await repo.getCurrentGame(wChat);
check('auto: after the cooldown, the next game opens', !!wGame2 && wGame2.status === 'VOTING');

// An admin's /cancelar is NOT a hard stop for the cron: after ANY terminal game — PLAYED,
// CANCELLED or CANCELLED_ADMIN — the auto-open relaunches a fresh poll. The usual guards
// still apply: the 12h cooldown blocks an immediate reopen, the daytime gate still holds.
const wChatCancel = `auto-cancel-${Date.now()}`;
await maybeOpenNextGame(sender, repo, fakeField, { channelId: wChatCancel, createdBy: '1' }, dayNow);
const cGame = (await repo.getCurrentGame(wChatCancel))!;
await games.cancelGame(sender, repo, cGame, dayNow + 1000);
check('cancel: /cancelar marks the game CANCELLED_ADMIN', (await repo.getGame(cGame.id))!.status === 'CANCELLED_ADMIN');
await maybeOpenNextGame(sender, repo, fakeField, { channelId: wChatCancel, createdBy: '1' }, dayNow + 60_000);
check('cancel: the cooldown still blocks reopening right after /cancelar', (await repo.getCurrentGame(wChatCancel)) === null);
const wellPastCooldown = lisbonToUtc(2026, 6, 18, 10, 0); // Thu 10:00 — a day later, daytime, cooldown gone
await maybeOpenNextGame(sender, repo, fakeField, { channelId: wChatCancel, createdBy: '1' }, wellPastCooldown);
check(
  'cancel: past the cooldown, the cron auto-opens a fresh poll even after /cancelar',
  (await repo.getCurrentGame(wChatCancel))?.status === 'VOTING',
);

// createGame refuses a sub-2-slot poll outright (final defence): it'd be unvotable and would
// block the auto-open via dedup. No game row should be left behind.
const wChatGuard = `guard-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: wChatGuard, createdBy: '1', locationNote: 'X', minPlayers: 2, capPlayers: 3,
  voteDeadline: dayNow + DAY, slots: [{ kickoffAt: dayNow + DAY, label: 'só um' }], now: dayNow,
});
check('createGame: refuses a < 2-slot poll (no game created)', (await repo.getCurrentGame(wChatGuard)) === null);

// --- tie-break robustness: past slots ignored, tie prompt disarmed, CAS, revert-on-failure ---
const pastKickoff = NOW - DAY;

// 1) A tie between two FUTURE slots must win even when a PAST slot has more raw votes —
//    this is exactly the production bug (a stale slot silently outvoting live options).
//    minPlayers 5 keeps every slot under the early-close threshold (2 votes max each), so the
//    explicit close below (forced, like /fecharvotacao — unforced closes now always cancel)
//    is what settles the poll.
const tieChat = `tie-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: tieChat,
  createdBy: '1',
  locationNote: 'Campo',
  minPlayers: 5,
  capPlayers: 10,
  voteDeadline: NOW + DAY,
  slots: [
    { kickoffAt: pastKickoff, label: 'passado' },
    { kickoffAt: slotA, label: formatWhen(slotA) },
    { kickoffAt: slotB, label: formatWhen(slotB) },
  ],
  now: NOW,
});
let tieGame = (await repo.getCurrentGame(tieChat))!;
const [pastSlot, futureA, futureB] = await repo.getSlots(tieGame.id);
for (const uid of ['10', '11', '12']) await games.handleVote(sender, repo, tieGame.id, pastSlot.id, uid, NOW);
await games.handleVote(sender, repo, tieGame.id, futureA.id, '20', NOW);
await games.handleVote(sender, repo, tieGame.id, futureA.id, '21', NOW);
await games.handleVote(sender, repo, tieGame.id, futureB.id, '30', NOW);
await games.handleVote(sender, repo, tieGame.id, futureB.id, '31', NOW);

await games.closeVoting(sender, repo, tieGame, NOW + DAY + 1, { forced: true });
tieGame = (await repo.getGame(tieGame.id))!;
check(
  'closeVoting: a past slot with more votes never wins — future slots tie instead',
  tieGame.status === 'TIEBREAK' && tieGame.tieMsgId != null,
);
check(
  'closeVoting: tie prompt disarms the OLD vote board (keyboard removed)',
  editsFor(tieGame.voteMsgId!).some((e) => e.componentsCleared),
);

// 2) resolveTie outcomes: past slot rejected, foreign slot rejected, valid future slot accepted
//    (and disarms the tie prompt), a second pick on the same game is rejected.
check(
  'resolveTie: rejects a past slot without changing status',
  (await games.resolveTie(sender, repo, tieGame.id, pastSlot.id, NOW + DAY + 1)) === 'past-slot' &&
    (await repo.getGame(tieGame.id))!.status === 'TIEBREAK',
);
const otherChat = `tie-other-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: otherChat, createdBy: '1', locationNote: 'X', minPlayers: 2, capPlayers: 10,
  voteDeadline: NOW + DAY, slots: [{ kickoffAt: slotA, label: 'a' }, { kickoffAt: slotB, label: 'b' }], now: NOW,
});
const foreignSlot = (await repo.getSlots((await repo.getCurrentGame(otherChat))!.id))[0];
check(
  'resolveTie: rejects a slot belonging to another game',
  (await games.resolveTie(sender, repo, tieGame.id, foreignSlot.id, NOW + DAY + 1)) === 'bad-slot',
);
check(
  'resolveTie: a valid future slot resolves → RSVP_OPEN + rsvp board posted',
  (await games.resolveTie(sender, repo, tieGame.id, futureA.id, NOW + DAY + 1)) === 'ok',
);
tieGame = (await repo.getGame(tieGame.id))!;
check(
  'resolveTie: winning slot + rsvp message recorded',
  tieGame.status === 'RSVP_OPEN' && tieGame.winningSlotId === futureA.id && tieGame.rsvpMsgId != null,
);
check(
  'resolveTie: disarms the tie prompt with the chosen label, no buttons',
  editsFor(tieGame.tieMsgId!).some((e) => e.componentsCleared && (e.content ?? '').includes('Horário escolhido')),
);
check(
  'resolveTie: a second pick on the same game is rejected (already resolved)',
  (await games.resolveTie(sender, repo, tieGame.id, futureB.id, NOW + DAY + 1)) === 'not-tiebreak',
);

// 3) lockWinner is a guarded write: once RSVP_OPEN, a stray call can never re-lock it.
check(
  'repo.lockWinner: guarded write returns false once the game left VOTING/TIEBREAK',
  (await repo.lockWinner(tieGame.id, futureB.id, NOW + 2 * DAY, NOW + DAY + 2)) === false,
);

// 4) closeVoting with EVERY slot in the past: cancels (not admin-cancels) so the cron may
//    relaunch, and tells the group why instead of the misleading "not enough players".
const expiredChat = `tie-expired-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: expiredChat, createdBy: '1', locationNote: 'Campo', minPlayers: 2, capPlayers: 10,
  voteDeadline: NOW + DAY,
  slots: [{ kickoffAt: pastKickoff, label: 'a' }, { kickoffAt: pastKickoff + 1000, label: 'b' }],
  now: NOW,
});
let expiredGame = (await repo.getCurrentGame(expiredChat))!;
await games.closeVoting(sender, repo, expiredGame, NOW + DAY + 1);
expiredGame = (await repo.getGame(expiredGame.id))!;
check(
  'closeVoting: all-past slots → plain CANCELLED (not admin) + explains why',
  expiredGame.status === 'CANCELLED' && anySentIncludes('já passaram'),
);
await maybeOpenNextGame(sender, repo, fakeField, { channelId: expiredChat, createdBy: '1' }, dayNow);
check(
  'auto: plain CANCELLED from an expired tiebreak still lets the cron relaunch',
  (await repo.getCurrentGame(expiredChat))?.status === 'VOTING',
);

// 5) A tie that mixes a past + a future slot resolves automatically to the future one —
//    no pointless one-button prompt when there's already a real vote to honour.
const autoChat = `tie-auto-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: autoChat, createdBy: '1', locationNote: 'Campo', minPlayers: 2, capPlayers: 10,
  voteDeadline: NOW + DAY,
  slots: [{ kickoffAt: pastKickoff, label: 'passado' }, { kickoffAt: slotA, label: formatWhen(slotA) }],
  now: NOW,
});
let autoGame = (await repo.getCurrentGame(autoChat))!;
const [autoPast, autoFuture] = await repo.getSlots(autoGame.id);
await games.handleVote(sender, repo, autoGame.id, autoPast.id, '1', NOW);
await games.handleVote(sender, repo, autoGame.id, autoFuture.id, '2', NOW);
// Forced, like /fecharvotacao: unforced closes now always cancel, they never pick a winner.
await games.closeVoting(sender, repo, autoGame, NOW + DAY + 1, { forced: true });
autoGame = (await repo.getGame(autoGame.id))!;
check(
  'closeVoting: past+future 1-1 "tie" auto-resolves to the future slot (no admin prompt)',
  autoGame.status === 'RSVP_OPEN' && autoGame.winningSlotId === autoFuture.id,
);

// 6) openRsvp failure (Discord POST throws): the status reverts instead of stranding the
//    game in RSVP_OPEN with no board — a retry with a working sender then self-heals.
const revertChat = `tie-revert-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: revertChat, createdBy: '1', locationNote: 'Campo', minPlayers: 2, capPlayers: 10,
  voteDeadline: NOW + DAY, slots: [{ kickoffAt: slotA, label: 'a' }, { kickoffAt: slotB, label: 'b' }], now: NOW,
});
let revertGame = (await repo.getCurrentGame(revertChat))!;
const [revertA] = await repo.getSlots(revertGame.id);
// A single vote: a clear winner, no tie — and below the minPlayers (2) early-close threshold,
// so the poll stays open until the forced close below (the path /fecharvotacao takes).
await games.handleVote(sender, repo, revertGame.id, revertA.id, '1', NOW);
let threw = false;
try {
  await games.closeVoting(throwingSender, repo, revertGame, NOW + DAY + 1, { forced: true });
} catch {
  threw = true;
}
check('openRsvp: a failed board post throws (surfaces the error)', threw);
check(
  'openRsvp: status reverted to VOTING after the failed post (not stuck in RSVP_OPEN)',
  (await repo.getGame(revertGame.id))!.status === 'VOTING',
);
revertGame = (await repo.getGame(revertGame.id))!;
await games.closeVoting(sender, repo, revertGame, NOW + DAY + 2, { forced: true });
check('openRsvp: retrying with a working sender self-heals to RSVP_OPEN', (await repo.getGame(revertGame.id))!.status === 'RSVP_OPEN');

// 7) /jogo repost on a TIEBREAK game: only still-valid options are offered, and the old
//    prompt is disarmed rather than left duplicated.
const repostChat = `tie-repost-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: repostChat, createdBy: '1', locationNote: 'Campo', minPlayers: 2, capPlayers: 10,
  voteDeadline: NOW + DAY,
  slots: [{ kickoffAt: pastKickoff, label: 'passado' }, { kickoffAt: slotA, label: formatWhen(slotA) }, { kickoffAt: slotB, label: formatWhen(slotB) }],
  now: NOW,
});
let repostGame = (await repo.getCurrentGame(repostChat))!;
const [rpPast, rpA, rpB] = await repo.getSlots(repostGame.id);
await games.handleVote(sender, repo, repostGame.id, rpPast.id, '1', NOW);
await games.handleVote(sender, repo, repostGame.id, rpA.id, '2', NOW);
await games.handleVote(sender, repo, repostGame.id, rpB.id, '3', NOW);
// Forced close (1-1 tie between the two future slots): unforced closes now always cancel.
await games.closeVoting(sender, repo, repostGame, NOW + DAY + 1, { forced: true });
repostGame = (await repo.getGame(repostGame.id))!;
const oldTieMsgId = repostGame.tieMsgId!;
const rpVotes = await repo.getVotes(repostGame.id);
const rpOptions = games.tieOptions([rpPast, rpA, rpB], rpVotes, NOW + DAY + 1);
check('tieOptions: excludes the past slot from the option set (pure)', rpOptions.every((s) => s.id !== rpPast.id));
await games.repost(sender, repo, repostGame, NOW + DAY + 5);
repostGame = (await repo.getGame(repostGame.id))!;
check('repost on TIEBREAK: posts a fresh prompt (tieMsgId changes)', repostGame.tieMsgId !== oldTieMsgId);
check('repost on TIEBREAK: disarms the old prompt', editsFor(oldTieMsgId).some((e) => e.componentsCleared));

// 8) /cancelar on a TIEBREAK game disarms its prompt too (not just RSVP/vote boards).
await games.cancelGame(sender, repo, repostGame, NOW + DAY + 10);
check(
  '/cancelar on TIEBREAK: disarms the (still-live) tie prompt',
  editsFor(repostGame.tieMsgId!).some((e) => e.componentsCleared),
);

// --- guarded state transitions: a stale-snapshot double-writer (the tick racing an admin
// command, or two overlapping ticks) must only fire its side effects (board post/edit,
// pings) ONCE. Each scenario below drives two calls with the SAME stale `game` object, exactly
// how tick.ts and an interaction handler would each hold their own outdated read. ---

// 1) repo.transitionStatus is the guard primitive itself: only the first matching call wins.
const transChat = `trans-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: transChat, createdBy: '1', locationNote: 'X', minPlayers: 2, capPlayers: 10,
  voteDeadline: NOW + DAY, slots: [{ kickoffAt: slotA, label: 'a' }, { kickoffAt: slotB, label: 'b' }], now: NOW,
});
const transGame = (await repo.getCurrentGame(transChat))!;
check('transitionStatus: guarded write succeeds from a matching status', (await repo.transitionStatus(transGame.id, 'VOTING', 'TIEBREAK', NOW)) === true);
check('transitionStatus: a stale from-status no longer matches → false, no throw', (await repo.transitionStatus(transGame.id, 'VOTING', 'RSVP_OPEN', NOW)) === false);
check('transitionStatus: array form matches on any of the given statuses', (await repo.transitionStatus(transGame.id, ['VOTING', 'TIEBREAK'], 'CANCELLED', NOW)) === true);
check('transitionStatus: the losing calls never changed the row', (await repo.getGame(transGame.id))!.status === 'CANCELLED');

// 2) closeVoting's tie branch (VOTING → TIEBREAK): a second stale call must not post a second
//    tie prompt (this is exactly the PR #29 orphaned-live-button incident, generalized).
const tieRaceChat = `tie-race-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: tieRaceChat, createdBy: '1', locationNote: 'X', minPlayers: 2, capPlayers: 10,
  voteDeadline: NOW + DAY, slots: [{ kickoffAt: slotA, label: 'a' }, { kickoffAt: slotB, label: 'b' }], now: NOW,
});
const tieRaceGame = (await repo.getCurrentGame(tieRaceChat))!;
const [traA, traB] = await repo.getSlots(tieRaceGame.id);
await games.handleVote(sender, repo, tieRaceGame.id, traA.id, '1', NOW); // 1-1 tie
await games.handleVote(sender, repo, tieRaceGame.id, traB.id, '2', NOW);
const sentBeforeTieRace = sent.length;
// Forced, like /fecharvotacao (unforced closes now always cancel): both calls see the same
// stale VOTING snapshot.
await games.closeVoting(sender, repo, tieRaceGame, NOW + DAY + 1, { forced: true });
await games.closeVoting(sender, repo, tieRaceGame, NOW + DAY + 1, { forced: true });
check(
  'closeVoting tie branch: a stale double-call posts exactly one tie prompt',
  sent.slice(sentBeforeTieRace).filter((m) => m.text.includes('Empate na votação')).length === 1,
);

// Build a shared LOCKED-then-CHECKIN_OPEN fixture for the closeRsvp / openCheckin / closeCheckin
// double-call races below.
async function fixtureToCheckinOpen(chatId: string): Promise<Game> {
  await games.createGame(sender, repo, {
    chatId, createdBy: '1', locationNote: 'X', minPlayers: 1, capPlayers: 5,
    voteDeadline: NOW + DAY, slots: [{ kickoffAt: slotA, label: 'a' }, { kickoffAt: slotB, label: 'b' }], now: NOW,
  });
  let g = (await repo.getCurrentGame(chatId))!;
  const [fSlotA] = await repo.getSlots(g.id);
  await games.handleVote(sender, repo, g.id, fSlotA.id, '1', NOW);
  await games.closeVoting(sender, repo, g, NOW + DAY + 1);
  g = (await repo.getGame(g.id))!;
  await games.handleRsvp(sender, repo, g.id, '1', 'IN', NOW + DAY + 1);
  g = (await repo.getGame(g.id))!;
  await games.closeRsvp(sender, repo, g, g.rsvpCloseAt! + 1);
  g = (await repo.getGame(g.id))!;
  await games.openCheckin(sender, repo, g, NOW + DAY + 5);
  return (await repo.getGame(g.id))!;
}

// 3) closeRsvp (RSVP_OPEN → LOCKED): a stale double-call posts exactly one "Equipa final".
const rsvpRaceChat = `rsvp-close-race-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: rsvpRaceChat, createdBy: '1', locationNote: 'X', minPlayers: 1, capPlayers: 5,
  voteDeadline: NOW + DAY, slots: [{ kickoffAt: slotA, label: 'a' }, { kickoffAt: slotB, label: 'b' }], now: NOW,
});
let rsvpRaceGame = (await repo.getCurrentGame(rsvpRaceChat))!;
const [rrSlotA] = await repo.getSlots(rsvpRaceGame.id);
await games.handleVote(sender, repo, rsvpRaceGame.id, rrSlotA.id, '1', NOW);
await games.closeVoting(sender, repo, rsvpRaceGame, NOW + DAY + 1);
rsvpRaceGame = (await repo.getGame(rsvpRaceGame.id))!;
await games.handleRsvp(sender, repo, rsvpRaceGame.id, '1', 'IN', NOW + DAY + 1);
rsvpRaceGame = (await repo.getGame(rsvpRaceGame.id))!;
const sentBeforeRsvpRace = sent.length;
await games.closeRsvp(sender, repo, rsvpRaceGame, rsvpRaceGame.rsvpCloseAt! + 1); // same stale RSVP_OPEN snapshot twice
await games.closeRsvp(sender, repo, rsvpRaceGame, rsvpRaceGame.rsvpCloseAt! + 2);
check(
  'closeRsvp: a stale double-call posts exactly one "Equipa final"',
  sent.slice(sentBeforeRsvpRace).filter((m) => m.text.includes('Equipa final')).length === 1,
);

// 4) openCheckin (LOCKED → CHECKIN_OPEN): a stale double-call posts exactly one check-in board
//    and one squad ping.
const checkinOpenRaceChat = `checkin-open-race-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: checkinOpenRaceChat, createdBy: '1', locationNote: 'X', minPlayers: 1, capPlayers: 5,
  voteDeadline: NOW + DAY, slots: [{ kickoffAt: slotA, label: 'a' }, { kickoffAt: slotB, label: 'b' }], now: NOW,
});
let corGame = (await repo.getCurrentGame(checkinOpenRaceChat))!;
const [corSlotA] = await repo.getSlots(corGame.id);
await games.handleVote(sender, repo, corGame.id, corSlotA.id, '1', NOW);
await games.closeVoting(sender, repo, corGame, NOW + DAY + 1);
corGame = (await repo.getGame(corGame.id))!;
await games.handleRsvp(sender, repo, corGame.id, '1', 'IN', NOW + DAY + 1);
corGame = (await repo.getGame(corGame.id))!;
await games.closeRsvp(sender, repo, corGame, corGame.rsvpCloseAt! + 1);
corGame = (await repo.getGame(corGame.id))!; // still LOCKED — the stale snapshot both racers hold
const sentBeforeCOR = sent.length;
await games.openCheckin(sender, repo, corGame, NOW + DAY + 5);
await games.openCheckin(sender, repo, corGame, NOW + DAY + 5);
check(
  'openCheckin: a stale double-call posts exactly one check-in board',
  sent.slice(sentBeforeCOR).filter((m) => m.text.includes('Hora do jogo')).length === 1,
);

// 5) closeCheckin (CHECKIN_OPEN → PLAYED): a stale double-call (the tick racing the admin's
//    /resultado submit — the scenario this fix targets) posts exactly one recap.
const ccChat = `checkin-close-race-${Date.now()}`;
const ccGame = await fixtureToCheckinOpen(ccChat);
const sentBeforeCC = sent.length;
await games.closeCheckin(sender, repo, ccGame, NOW + DAY + 10); // same stale CHECKIN_OPEN snapshot twice
await games.closeCheckin(sender, repo, ccGame, NOW + DAY + 11);
check(
  'closeCheckin: a stale double-call posts exactly one recap',
  sent.slice(sentBeforeCC).filter((m) => m.text.includes('Resumo —')).length === 1,
);
check('closeCheckin: the game only ends up PLAYED once (no error from the second call)', (await repo.getGame(ccGame.id))!.status === 'PLAYED');

// 6) toggleVote: a concurrent double-tap on the same (empty) slot must never throw a PK
//    violation — the losing insert is a silent no-op.
const tvChat = `toggle-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: tvChat, createdBy: '1', locationNote: 'X', minPlayers: 2, capPlayers: 10,
  voteDeadline: NOW + DAY, slots: [{ kickoffAt: slotA, label: 'a' }, { kickoffAt: slotB, label: 'b' }], now: NOW,
});
const tvGame = (await repo.getCurrentGame(tvChat))!;
const [tvSlotA] = await repo.getSlots(tvGame.id);
let toggleThrew = false;
try {
  await Promise.all([repo.toggleVote(tvGame.id, tvSlotA.id, 'v1', NOW), repo.toggleVote(tvGame.id, tvSlotA.id, 'v1', NOW)]);
} catch {
  toggleThrew = true;
}
check('toggleVote: concurrent double-add never throws', !toggleThrew);
const afterToggleVotes = (await repo.getVotes(tvGame.id)).filter((v) => v.tgUserId === 'v1');
check('toggleVote: exactly one vote row survives the race', afterToggleVotes.length === 1);
check('toggleVote: a further toggle still removes it cleanly', (await repo.toggleVote(tvGame.id, tvSlotA.id, 'v1', NOW)) === 'removed');
check('toggleVote: toggling again re-adds it', (await repo.toggleVote(tvGame.id, tvSlotA.id, 'v1', NOW)) === 'added');

// --- team-select isolation: the two independent Alpha/Beta selects must not clobber each
// other's write (the old design read-modify-wrote the WHOLE result_teams set per submit). ---
const tsChat = `teamsplit-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: tsChat, createdBy: '1', locationNote: 'X', minPlayers: 1, capPlayers: 5,
  voteDeadline: NOW + DAY, slots: [{ kickoffAt: slotA, label: 'a' }, { kickoffAt: slotB, label: 'b' }], now: NOW,
});
let tsGame = (await repo.getCurrentGame(tsChat))!;
const [tsSlotA] = await repo.getSlots(tsGame.id);
await games.handleVote(sender, repo, tsGame.id, tsSlotA.id, '1', NOW);
await games.closeVoting(sender, repo, tsGame, NOW + DAY + 1);
tsGame = (await repo.getGame(tsGame.id))!;
for (const uid of ['1', '2', '3']) await games.handleRsvp(sender, repo, tsGame.id, uid, 'IN', NOW + DAY + 1);
tsGame = (await repo.getGame(tsGame.id))!;
await games.closeRsvp(sender, repo, tsGame, tsGame.rsvpCloseAt! + 1);
tsGame = (await repo.getGame(tsGame.id))!;

await applyTeamSelect(repo, tsGame, 'A', ['1']);
await applyTeamSelect(repo, tsGame, 'B', ['2', '3']);
let tsState = await loadTeamsState(repo, tsGame);
check('team-select: two sequential single-side selects → Alpha=1, Beta=2', tsState.aIds.size === 1 && tsState.aIds.has('1') && tsState.bIds.size === 2);

// Concurrent Alpha + Beta submits (two independent admin panel selects fired close together).
await Promise.all([applyTeamSelect(repo, tsGame, 'A', ['1']), applyTeamSelect(repo, tsGame, 'B', ['2', '3'])]);
tsState = await loadTeamsState(repo, tsGame);
check('team-select: concurrent Alpha + Beta submits both survive (no lost update)', tsState.aIds.size === 1 && tsState.bIds.size === 2);

// Cross-pick: claiming user 2 for Alpha pulls them off Beta.
await applyTeamSelect(repo, tsGame, 'A', ['1', '2']);
tsState = await loadTeamsState(repo, tsGame);
check('team-select: claiming a player for one side pulls them off the other', tsState.aIds.has('2') && !tsState.bIds.has('2') && tsState.bIds.size === 1);

// --- payments eligibility union: confirmed squad ∪ checked-in ∪ team-assigned, so a waitlist
// sub who actually showed up (checked in) can be marked paid too. ---
const puChat = `payunion-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: puChat, createdBy: '1', locationNote: 'X', minPlayers: 2, capPlayers: 2,
  voteDeadline: NOW + DAY, slots: [{ kickoffAt: slotA, label: 'a' }, { kickoffAt: slotB, label: 'b' }], now: NOW,
});
let puGame = (await repo.getCurrentGame(puChat))!;
const [puSlotA] = await repo.getSlots(puGame.id);
// 2 votes == minPlayers → the second vote hits the early-close threshold and closes the poll
// itself (RSVP_OPEN, slot A wins); the explicit close below is a guarded no-op.
await games.handleVote(sender, repo, puGame.id, puSlotA.id, '1', NOW);
await games.handleVote(sender, repo, puGame.id, puSlotA.id, '2', NOW);
await games.closeVoting(sender, repo, puGame, NOW + DAY + 1);
puGame = (await repo.getGame(puGame.id))!;
for (const uid of ['1', '2', '3']) await games.handleRsvp(sender, repo, puGame.id, uid, 'IN', NOW + DAY + 1 + Number(uid)); // cap 2 → 3 waitlisted
const puSplit = splitSquad(await repo.getRsvps(puGame.id), puGame.capPlayers);
check('pay union setup: cap 2 → 2 confirmed, user 3 waitlisted', puSplit.confirmed.length === 2 && puSplit.waitlist.some((r) => r.tgUserId === '3'));
puGame = (await repo.getGame(puGame.id))!;
await games.closeRsvp(sender, repo, puGame, puGame.rsvpCloseAt! + 1);
puGame = (await repo.getGame(puGame.id))!;
await games.openCheckin(sender, repo, puGame, NOW + DAY + 5);
puGame = (await repo.getGame(puGame.id))!;
// The waitlisted sub shows up and taps Cheguei — allowed (handleCheckin only requires status
// IN, not "confirmed"), exactly how a real late sub ends up eligible but off the RSVP snapshot.
const puCheckinToast = await games.handleCheckin(sender, repo, puGame.id, '3', NOW + DAY + 6);
check('pay union: a waitlisted-but-IN sub can still self check-in', puCheckinToast === M.cb.checkinDone);
let puPayState = await loadPaymentState(repo, (await repo.getGame(puGame.id))!);
check('pay union: the checked-in waitlist sub is eligible to pay (3 players, not 2)', puPayState.players.length === 3 && puPayState.players.some((p) => p.tgUserId === '3'));
await repo.setGamePrice(puGame.id, 500, NOW);
puPayState = await loadPaymentState(repo, (await repo.getGame(puGame.id))!);
check('pay union: expected total scales to all 3 eligible payers (15,00€)', renderPaymentBoard(puPayState).includes('15,00€'));
await setPaidSet(repo, (await repo.getGame(puGame.id))!, ['3'], NOW);
check('pay union: the checked-in waitlist sub can be marked paid', (await loadPaymentState(repo, (await repo.getGame(puGame.id))!)).paid.has('3'));
// A team-assigned outsider (e.g. from seeded/historical data written outside the RSVP flow) is
// eligible too — loadPaymentState must stay correct even when result_teams has rows RSVP never saw.
await repo.setTeamSide(puGame.id, 'A', ['outsider1']);
puPayState = await loadPaymentState(repo, (await repo.getGame(puGame.id))!);
check('pay union: a team-assigned outsider is eligible too', puPayState.players.some((p) => p.tgUserId === 'outsider1'));

// --- late RSVP: a lock landing in the exact window between handleRsvp's write and its
// completion must be caught by the post-write freshness re-read, not re-arm a locked board. ---
const raceChat = `rsvp-write-race-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: raceChat, createdBy: '1', locationNote: 'X', minPlayers: 1, capPlayers: 5,
  voteDeadline: NOW + DAY, slots: [{ kickoffAt: slotA, label: 'a' }, { kickoffAt: slotB, label: 'b' }], now: NOW,
});
let raceGame = (await repo.getCurrentGame(raceChat))!;
const [raceSlotA] = await repo.getSlots(raceGame.id);
await games.handleVote(sender, repo, raceGame.id, raceSlotA.id, '1', NOW);
await games.closeVoting(sender, repo, raceGame, NOW + DAY + 1);
raceGame = (await repo.getGame(raceGame.id))!;
await games.handleRsvp(sender, repo, raceGame.id, '1', 'IN', NOW + DAY + 1);
raceGame = (await repo.getGame(raceGame.id))!;

// A repo wrapper that closes RSVP the instant the write lands — simulating the tick winning
// the race in the exact window handleRsvp's fresh re-read exists to catch.
let raceClosed = false;
const racyRepo: Repo = {
  ...repo,
  async setRsvp(gameId, tgUserId, status, now) {
    const result = await repo.setRsvp(gameId, tgUserId, status, now);
    if (!raceClosed) {
      raceClosed = true;
      await repo.transitionStatus(gameId, 'RSVP_OPEN', 'LOCKED', now);
    }
    return result;
  },
};
const editsBeforeRace = edits.length;
const raceToast = await games.handleRsvp(sender, racyRepo, raceGame.id, '2', 'IN', NOW + DAY + 2);
check('handleRsvp: a lock landing mid-write is caught by the post-write re-read', raceToast === M.cb.rsvpClosed);
check('handleRsvp: no board re-render once the fresh re-read finds it already locked', edits.length === editsBeforeRace);
check('handleRsvp: the RSVP row itself was still written (not rolled back, just not re-rendered)', (await repo.getRsvps(raceGame.id)).some((r) => r.tgUserId === '2'));

// --- vote deadline: the default is always `created + VOTE_MAX_WAIT_MS` (7 days), no matter
// how soon the earliest slot is — a long window never means a late decision, because the poll
// closes EARLY the moment one slot reaches minPlayers votes. An explicit admin deadline is
// still validated (must be at least MIN_VOTE_WINDOW_MS away). ---
check('parseNovoJogoFields: an explicit deadline less than 3h away is rejected', 'error' in parseNovoJogoFields({ ...baseNovoFields, deadline: '15/06 14:00' }, NOW));
check('parseNovoJogoFields: an explicit deadline 3h+ away is accepted', !('error' in parseNovoJogoFields({ ...baseNovoFields, deadline: '15/06 20:00' }, NOW)));
check('MIN_VOTE_WINDOW_MS is 3h (the explicit-deadline floor)', MIN_VOTE_WINDOW_MS === 3 * 60 * 60 * 1000);
const parsedSoonSlots = parseNovoJogoFields({ slots: '15/06 14:00\n15/06 15:00' }, NOW); // both < 3h from NOW's Lisbon 13:00
check(
  'parseNovoJogoFields: default deadline is exactly now + VOTE_MAX_WAIT_MS, even for same-day slots',
  !('error' in parsedSoonSlots) && parsedSoonSlots.voteDeadline === NOW + VOTE_MAX_WAIT_MS,
);

const soonField: FieldClient = {
  async fetchWorkingHours() {
    return { workingHours: [{ day: 2, start: '18:00', end: '21:00' }], blocked: [] }; // today (Tue), same day as dayNow
  },
  async fetchBookings() {
    return [];
  },
};
const soonChat = `auto-soon-${Date.now()}`;
await maybeOpenNextGame(sender, repo, soonField, { channelId: soonChat, createdBy: '1' }, dayNow);
const soonGame = await repo.getCurrentGame(soonChat);
check(
  'auto-open: default deadline is exactly opened + VOTE_MAX_WAIT_MS, even with a same-day earliest slot',
  soonGame != null && soonGame.voteDeadline === dayNow + VOTE_MAX_WAIT_MS,
);

// --- early close by votes: the poll closes the moment ONE future slot gathers `minPlayers`
// votes (handleVote → closeVoting { forced: true }). Short of that, an unforced (tick-style)
// closeVoting at the deadline ALWAYS cancels — there is no winner-picking at the deadline and
// no distinct-voter quorum anymore. ---

// (a) Unforced close past the deadline cancels even when a slot has votes below minPlayers,
//     and the cancel message names the voter count vs the minimum.
const dlChat = `deadline-cancel-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: dlChat, createdBy: '1', locationNote: 'X', minPlayers: 14, capPlayers: 14,
  voteDeadline: NOW + DAY, slots: [{ kickoffAt: slotA, label: 'a' }, { kickoffAt: slotB, label: 'b' }], now: NOW,
});
const dlGame = (await repo.getCurrentGame(dlChat))!;
const [dlSlotA] = await repo.getSlots(dlGame.id);
await games.handleVote(sender, repo, dlGame.id, dlSlotA.id, '1', NOW); // 2 votes, need 14
await games.handleVote(sender, repo, dlGame.id, dlSlotA.id, '2', NOW);
const sentBeforeDl = sent.length;
await games.closeVoting(sender, repo, dlGame, NOW + DAY + 1); // past deadline, tick-style (unforced)
check(
  'closeVoting: unforced close at the deadline cancels — no winner from votes below minPlayers',
  (await repo.getGame(dlGame.id))!.status === 'CANCELLED',
);
check(
  'closeVoting: the cancel message names the minimum and how many voted (14 vs 2)',
  sent.slice(sentBeforeDl).some((m) => m.text.includes('sem nenhum horário com **14** votos (**2** pessoas votaram)')),
);

// (b) The threshold close: hitting minPlayers votes on one slot closes the poll immediately —
//     no explicit closeVoting needed — and locks that slot as the winner.
const earlyChat = `early-close-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: earlyChat, createdBy: '1', locationNote: 'X', minPlayers: 2, capPlayers: 14,
  voteDeadline: NOW + 7 * DAY, slots: [{ kickoffAt: slotA, label: 'a' }, { kickoffAt: slotB, label: 'b' }], now: NOW,
});
const ecGame = (await repo.getCurrentGame(earlyChat))!;
const [ecSlotA, ecSlotB] = await repo.getSlots(ecGame.id);
await games.handleVote(sender, repo, ecGame.id, ecSlotA.id, '1', NOW);
check('early close: one vote below the threshold keeps the poll open', (await repo.getGame(ecGame.id))!.status === 'VOTING');
await games.handleVote(sender, repo, ecGame.id, ecSlotA.id, '2', NOW); // 2 == minPlayers → decided
const ecAfter = (await repo.getGame(ecGame.id))!;
check(
  'early close: hitting minPlayers votes on one slot closes the poll right away → RSVP_OPEN with that slot',
  ecAfter.status === 'RSVP_OPEN' && ecAfter.winningSlotId === ecSlotA.id,
);
await games.handleVote(sender, repo, ecGame.id, ecSlotB.id, '3', NOW);
check('early close: votes landing after the auto-close are ignored', (await repo.getVotes(ecGame.id)).length === 2);

// Votes on PAST slots never count toward the threshold — they're no longer a real option.
const pastOnlyChat = `past-votes-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: pastOnlyChat, createdBy: '1', locationNote: 'X', minPlayers: 2, capPlayers: 14,
  voteDeadline: NOW + 7 * DAY,
  slots: [{ kickoffAt: pastKickoff, label: 'passado' }, { kickoffAt: slotA, label: 'a' }, { kickoffAt: slotB, label: 'b' }],
  now: NOW,
});
const poGame = (await repo.getCurrentGame(pastOnlyChat))!;
const [poPast] = await repo.getSlots(poGame.id);
await games.handleVote(sender, repo, poGame.id, poPast.id, '1', NOW);
await games.handleVote(sender, repo, poGame.id, poPast.id, '2', NOW); // 2 == minPlayers, but the slot is past
check('early close: past-slot votes never trigger the threshold close', (await repo.getGame(poGame.id))!.status === 'VOTING');

// (c) Votes spread across slots with none reaching minPlayers do NOT close the poll — and
//     toggling a vote off drops a slot back below the threshold.
const spreadChat = `spread-votes-${Date.now()}`;
await games.createGame(sender, repo, {
  chatId: spreadChat, createdBy: '1', locationNote: 'X', minPlayers: 3, capPlayers: 14,
  voteDeadline: NOW + 7 * DAY, slots: [{ kickoffAt: slotA, label: 'a' }, { kickoffAt: slotB, label: 'b' }], now: NOW,
});
const spGame = (await repo.getCurrentGame(spreadChat))!;
const [spSlotA, spSlotB] = await repo.getSlots(spGame.id);
await games.handleVote(sender, repo, spGame.id, spSlotA.id, '1', NOW); // A: 2 < 3
await games.handleVote(sender, repo, spGame.id, spSlotA.id, '2', NOW);
await games.handleVote(sender, repo, spGame.id, spSlotB.id, '3', NOW); // B: 1 < 3
check('early close: votes spread across slots, none at minPlayers → poll stays open', (await repo.getGame(spGame.id))!.status === 'VOTING');
await games.handleVote(sender, repo, spGame.id, spSlotB.id, '3', NOW); // toggle off → B back to 0
check(
  'early close: toggling a vote off drops the slot back down (still VOTING)',
  (await repo.getGame(spGame.id))!.status === 'VOTING' && (await repo.getVotes(spGame.id)).filter((v) => v.slotId === spSlotB.id).length === 0,
);

// (d) The admin's /fecharvotacao (forced) still closes immediately and picks the top slot,
//     even with every slot below minPlayers.
await games.closeVoting(sender, repo, spGame, NOW + DAY + 1, { forced: true });
const spAfter = (await repo.getGame(spGame.id))!;
check(
  'closeVoting: forced (admin /fecharvotacao) picks the winner even below minPlayers',
  spAfter.status === 'RSVP_OPEN' && spAfter.winningSlotId === spSlotA.id,
);

console.log(`\n${failures === 0 ? '🎉 All checks passed' : `💥 ${failures} check(s) failed`}`);
await proxy.dispose();
if (failures > 0) throw new Error(`${failures} self-test check(s) failed`);
