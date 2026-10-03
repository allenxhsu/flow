# Flow

Work and life as a game of getting faster and better: skills that level up,
targets that stay just ahead of you, points for treats, rework that costs, and
a 90s-style replay of your day. A toolkit app (id `flow`) on the Portal.

Start with [SPEC.md](SPEC.md). The rules are [src/model.js](src/model.js).

## Run it

```bash
./serve.sh            # http://localhost:8201 (no build step)
npm test              # node --test: the model's tests and the page's pure helpers
node e2e/app-e2e.mjs  # Playwright (global install) against ./serve.sh, at 390px
node e2e/bookshelf-e2e.mjs  # the bookshelf in Play and the Bag's item panel, at 390px and 1280px
node e2e/app-e2e.mjs --sync http://127.0.0.1:8092/w/flow <token>   # + two-device sync
```

The page is `index.html` + `src/app.js` (views in `src/views/`), the records
and sync in `src/sync.js`, the rules in `src/model.js`. `ui-kit/` and
`sync-kit/` are vendored copies (`copy-into.mjs`, `--check` to verify). On the
Portal the app syncs with the signed-in session; anywhere else paste a sync
server URL and token in Settings.
