# CLAUDE.md

## What this is

A goldfish simulator for Commander decks, written in TypeScript and run on Node.js. It plays thousands of seeded games of a deck against opponents who do nothing and reports on which turn it wins, so decklists can be compared fairly. Pod mode lets the decks play each other.

- `engine/`: the shared engine (cards, game, mana, turn loop, runner, analyzer).
- `decks/<name>/`: one folder per deck (its AI, card rules, config, lists, logs, tests).
- `sim.ts`: the command line.
- `README.md` has the commands. `PLAN.md` has the engine notes. Each deck has its own `PLAN.md`. `ROADMAP.md` has the next steps.

## Commands

- `npm run sim -- <deck> ...`: run a deck (see README.md).
- `npm run check`: type-check.
- `npm run format`: format all code with Prettier. Run it before finishing a change.
- `npm run format:check`: check formatting without changing files.
- `npm run sim -- <deck> --test`: a deck's tests (must print ALL OK).
- `npm run sim -- <deck> --regress check`: after a refactor, results must be IDENTICAL.

## Coding standards

Readability and ease of use come first. Keep it simple (KISS).

- Write code a newcomer can read top to bottom. Pick clear names over short or clever ones.
- Prefer small, plain functions with one job. Avoid abstractions, options and generics that nothing needs yet.
- Rule of three: duplicating something once or twice is fine. When it appears a third time, pull it out into a shared helper.
- Comment the why, not the what. Keep comments short.
- Do not hand-format. Prettier owns formatting (80 columns, single quotes, trailing commas everywhere, quotes on properties only when needed). Do not spend effort on style, just run `npm run format`.
- Card facts that hold in any deck go in `engine/`. Deck-specific behaviour stays in that deck's folder.
- Shared engine changes must leave other decks' results IDENTICAL (`--regress check`).
