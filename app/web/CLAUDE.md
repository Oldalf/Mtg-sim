# CLAUDE.md (the page)

The page of the app (roadmap step 4): an Angular 22 project with Angular Material, built into `../../dist/web/` and served by the Node server in `../server/`. Read the project's `CLAUDE.md` (coding standards, rule 0 names) and `PLAN.md` (the tasks and their rules) first; they hold here too.

## Where things are

- `../api-types.ts`: every request and answer of the server. Use these types for every call; a shape that is missing is added there first, in its own small change.
- `../../shared/` (the plain types of game logs and runs, the log's board, the rules for reading log lines) may be imported. Nothing from `engine/`: it uses Node (`fs`, `path`) and does not build here.
- `proxy.conf.json`: `ng serve` sends `/api` to the server on port 4173 (`npm run app:dev` in the project folder starts both).
- Theme: `src/styles.scss` (dark, dense, one accent colour: orange). Fonts ship with the page (`angular.json` "styles"), so it works without the network.

## Commands (in this folder)

- `npx ng build`: must pass before a task is done. `npx ng test --watch=false`: the page's tests (Vitest).
- `npm run format` in the project folder formats this folder too (Prettier, same settings).

## Tests

- `src/testing/`: `FakeApi` (stands in for `ApiService`: two made-up decks, keeps each run request as JSON would carry it) and the form actions (`typeInto`, `chooseOption`, `submitForm`). The form tests (`simulate.spec.ts`, `pod.spec.ts`) use them through the DOM, as a user would.
- Logic the pages need is kept in plain functions next to the page (`report-tables.ts`, `pod-tables.ts`, `game-steps.ts`), each with a spec.

## Learned while building it (step 4)

- `ng` needs Node 26 on the PATH; an older default Node fails. With fnm: `%APPDATA%\fnm\node-versions\v26.13.1\installation`.
- Signal Forms: put `[formRoot]="theForm"` on the `<form>` and give the action as `form(model, rules, { submission: { action } })`. `formRoot` adds `novalidate`; without it the browser's own number check silently blocks the submit. Number fields of settings get `step="any"` (0.25 is a valid setting).
- Signal Forms marks the items of an array in the model with a symbol key. JSON leaves it out, so the server never sees it, but a test comparing objects directly does.
- At the theme's density (-2) a `fill` form field hides its label: use `appearance="outline"` per field (setting it app-wide pulls the form field into the first bundle). A native `<select matNativeControl>` needs `floatLabel="always"`.
- The first bundle is a little over 500 kB (Angular code the lazy pages share); the warning budget in `angular.json` is 600 kB.
- Phone width: no page may scroll sideways; a wide table scrolls inside its own box. Below 480 px the toolbar drops the app name so the four places fit.

## Learned while building the table view (step 5)

- A page that must fill the window (the game viewer) sets `readonly fillsWindow = true`; the shell (`app.ts`) then drops the 1400 px cap and makes the page exactly the window's height. Do not reach into the shell with `::ng-deep`.
- A seat sizes its cards with container query units (`cqw`, `cqh`) from CSS variables the component sets (`--permanent-rows`, `--permanents-per-row`, from `permanentGrid`). Pure CSS can't count the cards, so the count comes from TypeScript and the sizing stays in CSS.
- The arrow keys step through the game, so other shortcuts there use letters (`l` for the log, `h` / `H` for highlights).
- A component's style has a 4 kB budget (`angular.json`); `player-seat.scss` is close to it.
- A one-player game has no active seat (`isActive` is false there, on purpose), so its seat opens on a phone through `isOnlySeat`. Without it the board of a goldfish game or a real log folds away.
- A caption's card row can be wider than the phone: it stacks under the text and scrolls inside its own box (`overflow-x: auto`). Check phone width with a 390 px iframe and `scrollWidth === clientWidth`, not just the window, since a browser window cannot be shrunk from the page.
- The arrow keys: Up and Down step lines, Left and Right step turns (not lines).

## Angular skills

The official Angular agent skills are in `.claude/skills/` (`angular-developer`, `angular-new-app`; reinstall or update with `npx skills update` here). Follow `angular-developer` for anything Angular: it points to a reference file per topic (signals, httpResource, Signal Forms, routing, testing). Angular's CLI MCP server is set up in `.mcp.json`.

## Angular practice (from `ng new --ai-config`, summarized)

- Standalone components only; do not write `standalone: true` (default). `OnPush` is the default in v22: do not set it.
- State in signals: `signal`, `computed` for derived state, `linkedSignal` for state that follows other signals; `update`/`set`, never `mutate`.
- Components small, one job. `input()`, `output()`, `model()` instead of decorators. Inline templates for small components; external files by relative path.
- Host bindings in the `host` object, not `@HostBinding` / `@HostListener`.
- Templates: built-in control flow (`@if`, `@for`, `@switch`), `class` / `style` bindings (no `ngClass` / `ngStyle`), no `CommonModule` (import only the pipes and directives used), simple logic only.
- Forms: Signal Forms (`@angular/forms/signals`), stable in v22.
- Services: one job each, `@Service` (v22) or `providedIn: 'root'` for singletons, `inject()` instead of constructor injection.
- Data from the server: `httpResource` / `HttpClient`; the async pipe for observables.
- Lazy-load the routes of the pages.
- `NgOptimizedImage` for static images (not for base64 images).
- TypeScript: strict, no `any` (`unknown` when unsure), let inference work when the type is obvious.
- Accessibility: pass the AXE checks and WCAG AA (focus, colour contrast, ARIA).
