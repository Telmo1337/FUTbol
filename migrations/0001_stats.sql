-- v2 "fun stats": adds the post-game check-in window + attendance records.
-- Applied with: wrangler d1 migrations apply futbol-db --local (and --remote for prod).
-- Keep in sync with src/db/schema.ts.

-- The check-in window lives between LOCKED and PLAYED (status = 'CHECKIN_OPEN').
ALTER TABLE games ADD COLUMN checkin_close_at INTEGER;   -- kickoff + window; when ghosts are assigned
ALTER TABLE games ADD COLUMN checkin_msg_id   INTEGER;   -- the "Cheguei ✅" board message

-- One row = "this player was present at this game".
-- source 'self'  = they tapped Cheguei.   source 'admin' = the admin cleared a false ghost.
-- A confirmed-squad player with NO row here (at a PLAYED game) is a 👻 ghost.
CREATE TABLE checkins (
  game_id       INTEGER NOT NULL,
  tg_user_id    INTEGER NOT NULL,
  checked_in_at INTEGER NOT NULL,
  source        TEXT    NOT NULL,
  PRIMARY KEY (game_id, tg_user_id)
);
CREATE INDEX idx_checkins_game ON checkins (game_id);
