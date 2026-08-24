# DV2.0 · DaxxerV2.0 convergence prototype

DV2.0 preserves the Graph Engineering OS as the P1 governed knowledge kernel and adds Daxxer-style human work surfaces around it.

## v0.1 convergence slice

- Graph remains the canonical governed knowledge surface.
- Canvas uses click-drag panning with hidden scrollbars and fit-to-view.
- Left navigation and inspector are collapsible; Focus mode maximizes graph space.
- Notes provide block-based capture (text, heading, to-do, bullet, code).
- Notes can be linked to graph nodes and promoted into REVIEW/DRAFT graph candidates with note provenance.
- Skills are reusable command contracts. The UI stages commands; it does not pretend to execute them.
- Agent Team Packs use role-contract-first composition. Team Packs do not grant runtime authority.
- Runtime boundary shown in-product: Primary Orchestrator → Team Pack → MCP Gateway → CASA → Runwall → Executor → Receipt.
- Activity captures DV2-local work events. Browser/search/external-app passive collection remains REVIEW until adapters, permissions, provenance, retention, and receipts are defined.
- Light/dark translucent crimson + steel visual system is preserved.

## Storage

Prototype state is localStorage under `daxxer-v2.0`. It migrates Graph Engineering OS v0.3/v0.2/v0.1 state forward without deleting the legacy keys.

This is not yet the production storage authority. The next integration should replace prototype persistence with the existing governed DaxxerOS Local bridge / durable event model rather than create a second authority.

## Decision

- Prototype convergence: ALLOW
- Merge to `main`: REVIEW
- Autonomous external capture: REVIEW
- Agent execution: REVIEW until routed through declared tool permissions and CASA/Runwall enforcement
