-- Applied with: wrangler d1 migrations apply futbol-db --local (and --remote for prod).
-- Keep in sync with src/db/schema.ts.

CREATE TABLE players (
  tg_user_id   INTEGER PRIMARY KEY,
  display_name TEXT    NOT NULL,
  username     TEXT,
  is_admin     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);

CREATE TABLE games (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id                INTEGER NOT NULL,
  created_by             INTEGER NOT NULL,
  status                 TEXT    NOT NULL,
  location_note          TEXT    NOT NULL,
  min_players            INTEGER NOT NULL,
  cap_players            INTEGER NOT NULL,
  vote_deadline          INTEGER NOT NULL,
  rsvp_close_at          INTEGER,
  winning_slot_id        INTEGER,
  vote_msg_id            INTEGER,
  rsvp_msg_id            INTEGER,
  flag_game_on_sent      INTEGER NOT NULL DEFAULT 0,
  flag_short_warn_sent   INTEGER NOT NULL DEFAULT 0,
  flag_nonresp_ping_sent INTEGER NOT NULL DEFAULT 0,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);
CREATE INDEX idx_games_status ON games (status);
CREATE INDEX idx_games_chat   ON games (chat_id, status);

CREATE TABLE candidate_slots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id    INTEGER NOT NULL,
  kickoff_at INTEGER NOT NULL,
  label      TEXT    NOT NULL,
  sort_order INTEGER NOT NULL
);
CREATE INDEX idx_slots_game ON candidate_slots (game_id);

CREATE TABLE votes (
  game_id    INTEGER NOT NULL,
  slot_id    INTEGER NOT NULL,
  tg_user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, slot_id, tg_user_id)
);
CREATE INDEX idx_votes_game ON votes (game_id);

CREATE TABLE rsvps (
  game_id              INTEGER NOT NULL,
  tg_user_id           INTEGER NOT NULL,
  status               TEXT    NOT NULL,
  rank_at              INTEGER NOT NULL,
  promoted_notified_at INTEGER,
  updated_at           INTEGER NOT NULL,
  PRIMARY KEY (game_id, tg_user_id)
);
CREATE INDEX idx_rsvps_game ON rsvps (game_id, status, rank_at);
