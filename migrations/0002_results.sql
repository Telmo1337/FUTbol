-- v3 "equipas + resultados": admin splits the confirmed squad into two teams and,
-- after the game, records the score. From that we derive V/E/D + win metrics.
-- Applied with: wrangler d1 migrations apply futbol-db --local (and --remote for prod).
-- Keep in sync with src/db/schema.ts.

-- The public "⚔️ Equipas" board (a normal message the bot edits) and when the admin
-- published the teams. Editing happens in a private ephemeral panel; this message is
-- the public face that flips from "a montar…" to the revealed teams.
ALTER TABLE games ADD COLUMN teams_msg_id    TEXT;     -- the public teams board (Discord id)
ALTER TABLE games ADD COLUMN teams_locked_at INTEGER;  -- when the admin published the teams

-- One row = "this player played on this side". side 'A' = Alpha, 'B' = Beta.
-- Anyone in the confirmed squad NOT here simply didn't play (left out by the admin).
-- Written incrementally as the admin assigns; a game only counts for win stats once it
-- ALSO has a results row (the score).
CREATE TABLE result_teams (
  game_id    INTEGER NOT NULL,
  tg_user_id TEXT    NOT NULL,
  side       TEXT    NOT NULL,
  PRIMARY KEY (game_id, tg_user_id)
);
CREATE INDEX idx_result_teams_game ON result_teams (game_id);

-- One row per game with a recorded score. goals_a = Alpha, goals_b = Beta.
CREATE TABLE results (
  game_id     INTEGER PRIMARY KEY,
  goals_a     INTEGER NOT NULL,
  goals_b     INTEGER NOT NULL,
  recorded_by TEXT    NOT NULL,   -- admin Discord id
  recorded_at INTEGER NOT NULL
);
