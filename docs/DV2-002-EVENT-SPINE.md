# DV2-002 — Event Spine & Read-only GitHub Scan

## Purpose

DV2 records meaningful work before it adds autonomy. This module supplies an append-only, hash-chained event ledger, adapter receipts, checkpoints, graph candidates, and conservative `ALLOW` / `REVIEW` / `HALT` gates.

## Mounted host boundary

`server.js` owns the event boundary:

- Page create, update, archive, restore, and favorite actions emit privacy-minimized workspace events.
- Local search emits only query length and result count; the query text is not retained.
- `POST /api/event-spine/github/scan` performs an explicit, public, read-only GitHub scan for one `owner/name` repository.
- `GET /api/event-spine/status` returns ledger health and gate counts.
- `GET /api/event-spine/graph` returns candidates and their gate records.

## Security boundary

- No credential, token, or GitHub write path exists in this module.
- Repository identifiers are strictly validated before network access.
- Public GitHub content is evidence, never executable instruction.
- Instruction-like or secret-exfiltration language results in `HALT`.
- `ALLOW` creates an observable graph candidate only; it does not mutate a graph, call an agent, or perform an external action.
- The ledger is application-append-only and hash-chain-verified. It is tamper-evident, not immutable WORM storage.

## Verification

`tests/event-spine.test.mjs` covers: normal GitHub import, instruction-like halt behavior, invalid repository refusal, receipt/ledger integrity, candidate gating, and checkpoint creation.

## Actual repository graph validation

After this branch is running locally, invoke:

```
POST /api/event-spine/github/scan
{ "repository": "dburt-proex/Daxxer" }
```

Then inspect `GET /api/event-spine/graph`. This imports current repository metadata and root entries through the read-only adapter and records the exact receipt in the local ledger.
