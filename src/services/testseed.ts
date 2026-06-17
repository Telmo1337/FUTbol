// /testjogo seed: builds a fully-confirmed LOCKED game with fake players in a test channel,
// then posts the team-formation board — so the equipas→resultado flow can be exercised solo,
// without 14 real people. Gated to TEST_CHANNEL_ID; stats are per-channel, so this never
// touches the real group's numbers. Re-running first wipes the previous test game.
import type { Sender } from '../discord/rest';
import type { Repo } from '../db/repo';
import { postTeamsPlaceholder } from './teams';
import { RSVP_CLOSE_BEFORE_KICKOFF_MS } from '../config';

const TEST_CREATOR = 'TESTBOT'; // marker so cleanup can find/remove test games
const TEST_PLAYERS = 8; // a clean 4v4 to split
const HOUR = 3_600_000;

export async function seedTestGame(
  api: Sender,
  repo: Repo,
  chatId: string,
  _adminId: string,
  now: number,
): Promise<number> {
  // Wipe any previous test games in this channel first (keeps it tidy + stats sane).
  await repo.deleteGamesByCreator(chatId, TEST_CREATOR);

  const kickoffAt = now - HOUR; // "just played" → lands in the current month for /stats
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
      const id = `90000000000000000${i}`; // fake snowflake-ish ids (digits only)
      await repo.upsertPlayer({ tgUserId: id, displayName: `Tester ${i}`, username: null }, false, now);
      await repo.setRsvp(gameId, id, 'IN', now + i); // staggered rank_at → stable order
      await repo.addCheckin(gameId, id, 'admin', now); // present → counts, not a ghost
    }),
  );

  await repo.lockWinner(gameId, slot.id, kickoffAt - RSVP_CLOSE_BEFORE_KICKOFF_MS, now);
  await repo.setStatus(gameId, 'PLAYED', now); // jump straight to PLAYED so /stats counts it
  const game = await repo.getGame(gameId);
  if (game) await postTeamsPlaceholder(api, repo, game, now);
  return TEST_PLAYERS;
}
