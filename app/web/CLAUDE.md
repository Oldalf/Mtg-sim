# CLAUDE.md (the page)

The page of the app (roadmap step 4): an Angular 22 project with Angular Material, built into `../../dist/web/` and served by the Node server in `../server/`. Read the project's `CLAUDE.md` (coding standards, rule 0 names) and `PLAN.md` (the tasks and their rules) first; they hold here too.

## Where things are

- `../api-types.ts`: every request and answer of the server. Use these types for every call; a shape that is missing is added there first, in its own small change.
- The engine's plain type files (`../../engine/game-log-types.ts`, `../../engine/run-types.ts`) may be imported. Nothing else from `engine/`: it uses Node (`fs`, `path`) and does not build here.
- `proxy.conf.json`: `ng serve` sends `/api` to the server on port 4173 (`npm run app:dev` in the project folder starts both).
- Theme: `src/styles.scss` (dark, dense, one accent colour: orange). Fonts ship with the page (`angular.json` "styles"), so it works without the network.

## Commands (in this folder)

- `npx ng build`: must pass before a task is done. `npx ng test --watch=false`: the page's tests (Vitest).
- `npm run format` in the project folder formats this folder too (Prettier, same settings).

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
