# Daxxer Contra MCP v0.1 — Design Specification

Date: 2026-09-08
Status: APPROVED DESIGN / IMPLEMENTATION GATED
Owner: Drew Burt
Target implementation repository: `dburt-proex/daxxer-contra-mcp` (standalone repository)
Design provenance repository: `dburt-proex/Daxxer`

## 1. Objective

Create the smallest remotely reachable MCP service that Contra Co-Agent can register as a custom connector and successfully call, while preserving a strict read-only authority boundary.

The v0.1 proof is transport-first: prove Contra can discover and invoke a Daxxer-controlled MCP tool before integrating private systems, write capabilities, or downstream connectors.

## 2. Bounded scope

v0.1 consists of one standalone Node.js service implementing Streamable HTTP MCP over HTTPS, deployed as an independently killable service.

The server exposes exactly three read-only tools:

1. `operator_context`
2. `get_aicr_offer`
3. `score_opportunity`

The service MUST NOT perform writes to Contra, GitHub, Notion, Airtable, Daxxer, Operator Intelligence, GHT, CASA, or any other external system.

## 3. Architecture decision

### Selected approach: standalone MCP gateway

`Contra Co-Agent -> HTTPS -> daxer-contra-mcp /mcp -> bounded read-only tools`

The service is intentionally separated from Daxxer's existing local-first Node/Electron runtime. Daxxer remains local-first and is not made internet-facing for this proof.

### Rejected alternatives

#### Add `/mcp` to Daxxer directly

Rejected because it would couple a public remote protocol boundary to a local-first workspace runtime that already exposes local JSON APIs and event-spine operations.

#### Embed MCP transport in Operator Intelligence

Rejected because Operator Intelligence should remain a commercial/intelligence provider behind a gateway rather than becoming responsible for remote protocol infrastructure.

## 4. Components

### 4.1 MCP transport

- Runtime: Node.js
- MCP implementation: official Model Context Protocol TypeScript SDK
- Transport: Streamable HTTP
- Public endpoint: `/mcp`
- Hosting target: Vercel
- HTTPS: required
- Public health endpoint: `/health` permitted only for non-sensitive readiness metadata

### 4.2 `operator_context`

Purpose: tell Contra Co-Agent what the connector is, what authority it has, and what it cannot do.

Returns structured fields including:

- service name/version
- authority mode: `READ_ONLY`
- governance state
- supported tools
- explicit prohibited actions
- evidence/proof posture

No external calls.

### 4.3 `get_aicr_offer`

Purpose: return a bounded commercial definition of the Agentic AI Control Readiness offer so Contra Co-Agent can understand and reason about the service.

Returns structured fields including:

- offer name
- problem addressed
- buyer/ICP characteristics
- core deliverables
- engagement boundaries
- commercial status
- next valid action

No private client data and no external calls.

### 4.4 `score_opportunity`

Purpose: deterministically score a prospect/opportunity for AICR fit.

Inputs MUST be explicit prospect/opportunity characteristics supplied in the MCP call. v0.1 does not fetch prospect data from third parties.

Returns:

- numeric fit score
- classification
- deterministic reason codes
- confidence
- recommended next action
- governance recommendation (`ALLOW`, `REVIEW`, or `HALT`)

The scoring function MUST be deterministic for identical inputs.

## 5. Data flow

1. Contra Co-Agent connects to the configured remote MCP URL.
2. The server negotiates the Streamable HTTP MCP transport.
3. Contra requests available tools.
4. The service exposes only the three v0.1 tools.
5. Contra invokes a tool with bounded input.
6. Input is schema-validated.
7. The tool computes or retrieves only static/local non-sensitive v0.1 information.
8. The service returns structured MCP content.
9. The service records only minimal technical telemetry required to establish transport proof; no user secrets or private Contra content are persisted in v0.1.

## 6. Authority and governance

### ALLOW

- MCP initialization and capability negotiation
- tool discovery
- `operator_context`
- `get_aicr_offer`
- `score_opportunity`
- non-sensitive health checks
- local deterministic computation

### REVIEW

Reserved for future versions; not implemented in v0.1:

- proposal preparation using private client context
- downstream evidence/ledger writes
- authenticated private-system reads

### HALT

The v0.1 service MUST refuse or structurally exclude:

- sending messages
- sending or accepting proposals
- creating or modifying invoices
- payment operations
- client/project mutation
- GitHub writes or merges
- permission changes
- arbitrary shell execution
- arbitrary filesystem access
- secret retrieval or disclosure
- unbounded network access
- dynamically supplied downstream URLs

## 7. Authentication and exposure model

v0.1 uses no application secret only if the service contains exclusively non-sensitive, read-only information and deterministic scoring logic.

No token, API key, OAuth credential, session cookie, personal client data, or private repository content may be embedded in source, URL parameters, responses, logs, or deployment configuration.

If Contra requires an authenticated MCP flow that cannot be satisfied without adding credentials or an authorization subsystem, implementation MUST HALT and return to owner review rather than weakening the boundary.

## 8. Error handling

The service MUST:

- reject malformed MCP requests with protocol-appropriate errors
- reject invalid tool arguments before execution
- reject unknown tools
- return stable structured errors without stack traces or secrets
- avoid leaking deployment internals
- fail closed when transport/session state is invalid

A tool failure must not broaden authority or trigger a fallback external action.

## 9. Testing strategy

### Unit tests

- schemas accept valid inputs and reject invalid inputs
- deterministic scoring produces identical outputs for identical inputs
- threshold/classification boundaries are tested
- tool registry contains exactly the approved v0.1 tools
- prohibited capabilities are absent

### MCP protocol tests

- initialize succeeds
- tool listing returns exactly the expected tools
- each tool can be invoked successfully with valid input
- unknown tool invocation fails safely
- invalid arguments fail safely

### Deployment verification

- production HTTPS endpoint resolves
- `/health` returns only permitted metadata
- `/mcp` negotiates MCP correctly
- live tool discovery matches the tested registry

### Contra acceptance proof

The final v0.1 acceptance test is performed from Contra Co-Agent:

1. Save the deployed URL as `Daxxer Operator MCP`.
2. Contra accepts the connector.
3. Co-Agent discovers the v0.1 tools.
4. Invoke `operator_context` or `get_aicr_offer`.
5. Receive a valid structured response.

## 10. Acceptance criteria

v0.1 is complete only when all are true:

- A standalone remote MCP service exists.
- It is reachable over HTTPS.
- It exposes a working Streamable HTTP `/mcp` endpoint.
- Exactly three approved read-only tools are discoverable.
- Automated tests pass for schemas, scoring, tool registry, protocol initialization, tool calls, and failure paths.
- No write authority exists.
- No secrets or private client data are required or exposed.
- Contra accepts the remote MCP URL.
- Contra Co-Agent successfully discovers the tools.
- At least one Contra-originated tool call succeeds and returns the expected structured output.
- A versioned evidence receipt records the deployment, test result, live endpoint, tool inventory, Contra call proof, and residual risks.

## 11. Evidence requirement

The completion receipt MUST distinguish:

- repository/commit state
- automated test evidence
- deployment evidence
- live MCP transport evidence
- Contra-side discovery/call evidence
- residual risks and deferred capabilities

Planned work must never be recorded as shipped proof.

## 12. Stop/failure conditions

HALT implementation and return to owner review if any of the following becomes necessary:

- exposing a secret in source or connector URL
- making Daxxer's local runtime internet-facing
- granting write authority to prove transport
- adding arbitrary remote-network access
- bypassing Contra or MCP authentication controls
- expanding beyond the three approved tools to make the integration work
- materially restructuring an existing core repository
- deployment creates unexpected spend or requires a paid-plan change
- the available environment cannot independently verify the live MCP endpoint

## 13. Non-goals

Explicitly deferred from v0.1:

- authenticated private-system access
- Contra account mutation
- proposal sending
- invoice/payment actions
- Notion/Airtable/GitHub connectors
- CASA/GHT execution enforcement
- persistent operational ledger writes
- knowledge-graph mutation
- multi-tenant support
- dashboard/UI
- OAuth provider implementation unless required by Contra and separately approved

## 14. Repository and deployment boundaries

Implementation target: new standalone repository `dburt-proex/daxxer-contra-mcp`.

The Daxxer repository stores this design as architecture provenance only. Implementation code MUST NOT be added to Daxxer's existing desktop/local server as part of v0.1.

Deployment target: a dedicated Vercel project connected only to the standalone MCP implementation repository or an equivalent isolated deployment source.

## 15. Next gate

After this written specification is reviewed and approved by the owner, produce a test-first implementation plan. Implementation, repository creation, deployment, and Contra connector activation remain gated until that plan is established.
