# v2 — Fun Stats (build plan)

Status: **in progress** on `develop`. v1 (the weekly loop) is shipped on `main`.

## Goal

Add fun attendance stats on top of the existing weekly loop, without touching the
loop itself. Scope is **attendance / reliability / ghost only** — win/loss + MVP is
deferred to v3.

## The one new idea: a check-in window

We slot a `CHECKIN_OPEN` state between `LOCKED` and `PLAYED`:

```
LOCKED ──kickoff────────▶ CHECKIN_OPEN   ← bot posts a "Cheguei ✅" board, pings the squad
CHECKIN_OPEN ──+5h──────▶ PLAYED          ← ghosts assigned, recap auto-posts
```

- Tapping **Cheguei** = present. A `checkins` row is written.
- A confirmed-squad player with **no** check-in by +5h = 👻 ghost.
- Subs (waitlist) can tap too and earn an appearance.
- The admin can **clear a false ghost** from the recap (tap-to-clear) — writes a
  `source='admin'` check-in. This fixes "played but forgot to tap".

## Stat definitions

- **👟 Appearances** = PLAYED games where you have a check-in (confirmed *or* sub).
- **🏅 Reliability** = check-ins ÷ games you were in the confirmed squad for.
  Ranked only at **≥3 confirmed games** (below = "a aquecer 🔥").
- **👻 Ghost** = confirmed squad but no check-in.
- **🔥 Streak** = consecutive most-recent PLAYED games you showed up to; missing one
  (ghost *or* honest "Não vou") resets to 0. `/eu` also shows your best streak.
- All-time, per group chat.

## Where it shows up

- `/stats` — group leaderboard (reliability, appearances, streak, ghost wall-of-shame).
- `/eu` — personal card.
- Auto post-game recap when the window closes.

## Data model (migration `0001_stats.sql`, no backfill — never went live)

- New `checkins` table: `(game_id, tg_user_id, checked_in_at, source)`, PK `(game_id, tg_user_id)`.
- `games` gains `checkin_close_at` (kickoff+5h) and `checkin_msg_id` (the board).
- New status `CHECKIN_OPEN` (an *active* state — the tick processes it).

## Files

`migrations/0001_stats.sql`, `src/db/schema.ts`, `src/types.ts`, `src/config.ts`,
`src/core/lifecycle.ts`, `src/core/stats.ts` (new, pure), `src/db/repo.ts`,
`src/services/games.ts`, `src/services/tick.ts`, `src/render/checkin-message.ts` (new),
`src/render/recap-message.ts` (new), `src/render/stats-message.ts` (new),
`src/render/keyboards.ts`, `src/bot/callbacks.ts`, `src/bot/commands.ts`,
`src/messages.ts`, `scripts/selftest.ts`, `README.md`.

## Verify

`npm run typecheck` + `npm run selftest` (extended to drive check-in → ghost →
admin-clear → `/stats` → `/eu`). Same green-gate as v1; CI re-runs it.

## Go-live (after v2 is green)

One guided pass: BotFather setup → register `/stats` `/eu` → Cloudflare deploy.
Then the first real game already collects attendance.
