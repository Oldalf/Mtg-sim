# The app's page

The page of `npm run app` (roadmap step 4): an Angular 22 project with Angular Material. Read `CLAUDE.md` here and in the project folder first.

- `npm run app:dev` in the project folder: the server plus `ng serve` (live reload, `/api` sent to the server by `proxy.conf.json`).
- `npx ng build` here: builds the page into `../../dist/web/`, which the server serves.
- `npx ng test --watch=false` here: the page's tests (Vitest). `src/testing/` holds the fake API and form helpers they share.

Node 26 (`.nvmrc`) is needed; Angular 22 does not run on older Node.
