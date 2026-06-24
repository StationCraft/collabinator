# Dev Fixtures (DEV only — not shipped to production)

## test-fixture.pdf

**Gitignored — never committed.** Drop your real test PDF here as
`test-fixture.pdf` on a fresh clone before recording or restoring a fixture.

The PDF's page count and dimensions must match the captured snapshot (`pageScales`,
`pageTransforms`, etc. are all keyed by the same page IDs).

## Workflow

### Record a snapshot
1. Load your real test PDF and build the full scenario manually (scale, classify,
   draw shapes, set heights, align elevation).
2. In the browser console: `copy(JSON.stringify(window.__snapshotFixture()))`
3. Paste the JSON string when restoring (see below), or store it locally.

### Restore after reload
```js
await window.__restoreFixture(JSON.parse('<paste snapshot JSON here>'))
```
Or fetch from a local file if you saved the JSON:
```js
const obj = await fetch('/devFixtures/snapshot.json').then(r => r.json())
await window.__restoreFixture(obj)
```
