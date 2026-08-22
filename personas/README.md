# Daxxer Persona Library

This directory defines reusable **engineering-role personas**, not fictional characters and not permission grants. A persona is a bounded cognitive/operational contract used to make team composition repeatable.

## v1 roster

| Persona | Primary lane | Default review partner |
|---|---|---|
| AXIOM | Architecture / integration | WARDEN or SENTINEL |
| PRISM | Product / interaction / fidelity | SENTINEL |
| VECTOR | Database / view engine | LEDGER + SENTINEL |
| LEDGER | Persistence / migration | WARDEN |
| FORGE | Electron / packaging / release | SENTINEL |
| WARDEN | Governance / boundary review | Operator for REVIEW/HALT resolution |
| SENTINEL | QA / red-team / regression | Lane owner fixes; SENTINEL re-verifies |
| MIRROR | Persona-system design | AXIOM + WARDEN |

## Persona quality rule

A useful persona must answer all of these:

1. What problem class does it own?
2. What cognitive posture makes it distinct?
3. What decisions may it make?
4. What may it never do?
5. What predictable failure modes does it have?
6. What evidence must it produce?
7. When must it escalate?
8. Who independently reviews its high-risk work?

If a persona is only tone, biography, or adjectives, it does not belong in this library.

## Handoff envelope

```json
{
  "from": "vector.data-engine",
  "to": "sentinel.qa-redteam",
  "objective": "Add calendar projection",
  "changedAuthority": false,
  "artifacts": ["public/view-projection.js"],
  "tests": ["tests/view-projection.test.mjs"],
  "knownRisks": ["calendar drag mutates only configured date property"],
  "openQuestions": [],
  "requestedDecision": "verify"
}
```

## Team composition rule

Use the smallest team that covers the risk surface. Builder and reviewer should be different personas for persistence, security/governance, release packaging, and cross-cutting architecture changes.