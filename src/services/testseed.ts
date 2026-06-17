// /testjogo seed: builds fully-confirmed PLAYED game(s) with fake players in a test channel.
// Gated to TEST_CHANNEL_ID; stats are per-channel, so this never touches the real group's numbers.
// Re-running always wipes the previous test games first.
//   • `/testjogo`          → 1 game, teams left unformed + the placeholder posted, so the
//                            equipas→resultado flow can be exercised solo (no result yet).
//   • `/testjogo jogos:N`  → N complete games (teams auto-split 4v4 + a varied score each),
//                            newest→oldest, no boards posted — to populate /historico + /stats.
import type { Sender } from '../discord/rest';
import type { Repo } from '../db/repo';
import type { ResultSide } from '../types';
import { postTeamsPlaceholder } from './teams';
import { RSVP_CLOSE_BEFORE_KICKOFF_MS } from '../config';

const TEST_CREATOR = 'TESTBOT'; // marker so cleanup can find/remove test games
const TEST_PLAYERS = 8; // a clean 4v4 to split
const MAX_TEST_GAMES = 12;
const HOUR = 3_600_000;
// Varied scores so the auto-completed games have different winners on the boards.
const TEST_SCORES: [number, number][] = [
  [5, 2],
  [1, 3],
  [4, 4],
  [2, 0],
  [3, 6],
  [7, 1],
];

const fakeId = (i: number) => `90000000000000000${i}`; // fake snowflake-ish ids (digits only)

/** Seed one fully-confirmed PLAYED game. With `withResult`, also splits 4v4 and records a score. */
async function seedOneGame(
  repo: Repo,
  chatId: string,
  kickoffAt: number,
  now: number,
  withResult: boolean,
  variant = 0,
): Promise<number> {
  const gameId = await repo.createGame({
    chatId,
    createdBy: TEST_CREATOR,
    locationNote: '🧪 Jogo de teste',
    minPlayers: TEST_PLAYERS,
    capPlayers: TEST_PLAYERS,
    voteDeadline: now,
    now,
  });
  await repo.addSlots(gameId, [{ kickoffAt, label: '🧪 teste', sortOrder: 0 }]);
  const slot = (await repo.getSlots(gameId))[0];

  // Confirm + check in all fake players in parallel (keeps well under Discord's 3s window).
  await Promise.all(
    Array.from({ length: TEST_PLAYERS }, (_, k) => k + 1).map(async (i) => {
      const id = fakeId(i);
      await repo.upsertPlayer({ tgUserId: id, displayName: `Tester ${i}`, username: null }, false, now);
      await repo.setRsvp(gameId, id, 'IN', now + i); // staggered rank_at → stable order
      await repo.addCheckin(gameId, id, 'admin', now); // present → counts, not a ghost
    }),
  );

  await repo.lockWinner(gameId, slot.id, kickoffAt - RSVP_CLOSE_BEFORE_KICKOFF_MS, now);

  if (withResult) {
    // Testers 1–4 = Alpha, 5–8 = Beta, then a varied score so winners differ across games.
    const teams = Array.from({ length: TEST_PLAYERS }, (_, k) => k + 1).map((i) => ({
      tgUserId: fakeId(i),
      side: (i <= TEST_PLAYERS / 2 ? 'A' : 'B') as ResultSide,
    }));
    await repo.replaceTeams(gameId, teams);
    const [goalsA, goalsB] = TEST_SCORES[variant % TEST_SCORES.length];
    await repo.saveResult(gameId, goalsA, goalsB, TEST_CREATOR, now);
  }

  await repo.setStatus(gameId, 'PLAYED', now); // jump straight to PLAYED so /stats counts it
  return gameId;
}

export async function seedTestGame(
  api: Sender,
  repo: Repo,
  chatId: string,
  _adminId: string,
  now: number,
  count = 1,
): Promise<{ games: number; players: number }> {
  // Wipe any previous test games in this channel first (keeps it tidy + stats sane).
  await repo.deleteGamesByCreator(chatId, TEST_CREATOR);

  const n = Math.max(1, Math.min(count, MAX_TEST_GAMES));

  if (n === 1) {
    // Single game: leave teams unformed + post the placeholder, so the manual flow can be played.
    const gameId = await seedOneGame(repo, chatId, now - HOUR, now, false);
    const game = await repo.getGame(gameId);
    if (game) await postTeamsPlaceholder(api, repo, game, now);
    return { games: 1, players: TEST_PLAYERS };
  }

  // Bulk: N complete games (teams + score), staggered kickoffs so they sort newest→oldest.
  await Promise.all(
    Array.from({ length: n }, (_, k) => seedOneGame(repo, chatId, now - HOUR * (k + 1), now, true, k)),
  );
  return { games: n, players: TEST_PLAYERS };
}
