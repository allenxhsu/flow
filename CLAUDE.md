# Working on Flow

`SPEC.md` is the product: every rule in it was decided with the player. Read it
before changing anything.

## Tests come before code

Every change — a feature, a fix, a refactor that moves behaviour — starts with
tests, in this order:

1. **Write the failing tests first**, from `SPEC.md` and the public contract,
   not from the implementation. Commit them (or show them failing) before the
   code that makes them pass.
2. **Then write the code** until they pass. Never loosen an assertion to make
   the code pass; if a test and the code disagree, decide which one the spec
   supports and say so in the commit message.
3. If the spec does not decide the behaviour, stop and ask — do not let the
   code decide it silently.

## Two kinds of test, two owners

- `test/acceptance/` — **spec-derived, black-box.** Written from `SPEC.md`
  and the public API only, by someone who has not read the implementation.
  Implementation work does not edit these; if one is wrong, that is a spec
  question for the player.
- `test/contract.test.mjs` — **the seams between parts.** The exports of
  `src/model.js` that the app, the replay and the CLI depend on, and the
  shapes they return. Changing a contract means changing this test first, in
  the same commit that updates every consumer.
- Everything else under `test/` is the implementation's own unit tests.

## Running them

```bash
npm test                                   # everything
FLOW_SYNC_SERVER=../sync-kit/server npm test   # include the sync tests
```

The sync tests skip without a built sync-kit server beside the repo.
