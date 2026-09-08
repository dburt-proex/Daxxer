# Daxxer Contra MCP v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a standalone, remotely reachable, read-only MCP service that Contra Co-Agent can register as `Daxxer Operator MCP`, discover exactly three tools from, and successfully invoke at least one tool through.

**Architecture:** Implement a standalone Node.js/TypeScript service using the official MCP TypeScript SDK v2. `createMcpHandler()` provides a stateless Streamable HTTP MCP entry that serves current 2026-07-28 clients and legacy stateless clients from the same factory. Vercel exposes the service through isolated functions, with `/mcp` rewritten to the MCP function and `/health` to a non-sensitive health function. No private-system connector, persistence, write authority, or secret is included in v0.1.

**Tech Stack:** Node.js 22+, TypeScript, `@modelcontextprotocol/server` v2, `@modelcontextprotocol/client` v2 for protocol tests, `@modelcontextprotocol/node` v2 for Node/Vercel adaptation, Zod >=4.2, Node built-in test runner via `tsx`, Vercel Functions.

**Spec:** `docs/superpowers/specs/2026-09-08-daxxer-contra-mcp-v0.1-design.md`

## Global Constraints

- Standalone implementation repository: `dburt-proex/daxxer-contra-mcp`.
- Public MCP transport: Streamable HTTP over HTTPS at `/mcp`.
- Public health endpoint: `/health`, returning only non-sensitive readiness metadata.
- Exactly three discoverable tools: `operator_context`, `get_aicr_offer`, `score_opportunity`.
- All v0.1 tools are read-only, idempotent, deterministic where applicable, and perform no external calls.
- No Contra, GitHub, Notion, Airtable, Daxxer, Operator Intelligence, GHT, CASA, payment, filesystem, shell, or arbitrary-network writes.
- No token, API key, OAuth credential, session cookie, client secret, private repository data, or client data may be required, embedded, logged, or returned.
- If Contra requires authenticated MCP and transport cannot be proven without adding credentials/auth infrastructure, HALT and return to owner review.
- If deployment requires spend or a paid-plan change, HALT and return to owner review.
- Completion requires automated tests, live HTTPS verification, tool discovery, one successful Contra-originated tool call, and a versioned evidence receipt.

---

## Planned File Structure

```text
daxxer-contra-mcp/
├── api/
│   ├── health.ts                 # Vercel health function
│   └── mcp.ts                    # Vercel Node adapter for MCP fetch handler
├── src/
│   ├── domain/
│   │   ├── aicr-offer.ts         # static bounded AICR offer definition
│   │   ├── operator-context.ts   # static connector authority/context definition
│   │   └── score-opportunity.ts  # deterministic scoring model
│   ├── mcp/
│   │   ├── build-server.ts       # registers exactly the three approved tools
│   │   └── handler.ts            # createMcpHandler factory
│   └── types.ts                  # shared result/input types
├── scripts/
│   └── verify-live.ts            # independent live MCP discovery/call verifier
├── test/
│   ├── domain/
│   │   └── score-opportunity.test.ts
│   └── mcp/
│       ├── protocol.test.ts
│       └── registry.test.ts
├── docs/
│   └── evidence/
│       └── receipt-v0.1.md       # populated only after verified deployment/Contra proof
├── .gitignore
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```

---

### Task 1: Create the isolated repository and test harness

**Files:**
- Create repository: `dburt-proex/daxxer-contra-mcp`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Consumes: approved v0.1 design spec.
- Produces: installable TypeScript project with test/typecheck scripts and no runtime credentials.

- [ ] **Step 1: Verify repository does not already exist**

Run:

```bash
gh repo view dburt-proex/daxxer-contra-mcp
```

Expected: non-zero/not-found. If the repository exists, inspect it before writing and HALT if it contains unrelated work.

- [ ] **Step 2: Create the standalone repository**

Run:

```bash
gh repo create dburt-proex/daxxer-contra-mcp --public --description "Read-only governed MCP gateway for Contra Co-Agent integration" --clone
cd daxxer-contra-mcp
```

Expected: repository created and local clone on `main`. If GitHub authentication or repository creation is unavailable, HALT instead of substituting the Daxxer repository.

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "daxxer-contra-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "node --import tsx --test test/**/*.test.ts",
    "typecheck": "tsc --noEmit",
    "check": "npm run typecheck && npm test",
    "verify:live": "tsx scripts/verify-live.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/node": "^2.0.0",
    "@modelcontextprotocol/server": "^2.0.0",
    "zod": "^4.2.0"
  },
  "devDependencies": {
    "@modelcontextprotocol/client": "^2.0.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.20.0",
    "typescript": "^5.9.0"
  }
}
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "types": ["node"],
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["api/**/*.ts", "src/**/*.ts", "scripts/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 5: Create `.gitignore` and minimal README**

`.gitignore`:

```gitignore
node_modules/
.vercel/
.env
.env.*
coverage/
.DS_Store
```

README must state: v0.1 is public/read-only; it exposes exactly three tools; it contains no secrets or downstream private connectors; write-capable features are out of scope.

- [ ] **Step 6: Install dependencies and verify empty harness**

Run:

```bash
npm install
npm run typecheck
npm test
```

Expected: typecheck succeeds; test runner succeeds with zero tests or reports no matching tests without masking failures. If the glob causes a no-test failure, create the first failing test in Task 2 before asserting green.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore README.md
git commit -m "chore: scaffold read-only Contra MCP service"
git push origin main
```

---

### Task 2: Implement deterministic opportunity scoring test-first

**Files:**
- Create: `src/types.ts`
- Create: `src/domain/score-opportunity.ts`
- Test: `test/domain/score-opportunity.test.ts`

**Interfaces:**
- Produces: `scoreOpportunity(input: OpportunityInput): OpportunityScoreResult`.
- `OpportunityInput` fields: `organizationSize`, `agenticAiInProduction`, `agentsCanTakeExternalActions`, `namedGovernanceOwner`, `auditEvidenceAvailable`, `remediationUrgency`.
- Output contains `score`, `classification`, `reasonCodes`, `confidence`, `recommendedNextAction`, `governanceRecommendation`, `authorityBoundary`.

- [ ] **Step 1: Write the failing scoring tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreOpportunity } from '../../src/domain/score-opportunity.js';

const highFit = {
  organizationSize: 'midmarket',
  agenticAiInProduction: true,
  agentsCanTakeExternalActions: true,
  namedGovernanceOwner: false,
  auditEvidenceAvailable: false,
  remediationUrgency: 'high'
} as const;

test('high-risk agentic opportunity scores 100 and is HIGH_FIT', () => {
  const result = scoreOpportunity(highFit);
  assert.equal(result.score, 100);
  assert.equal(result.classification, 'HIGH_FIT');
  assert.equal(result.governanceRecommendation, 'ALLOW');
  assert.equal(result.authorityBoundary, 'NO_EXTERNAL_ACTION');
});

test('identical input produces identical output', () => {
  assert.deepEqual(scoreOpportunity(highFit), scoreOpportunity(highFit));
});

test('low-signal opportunity halts', () => {
  const result = scoreOpportunity({
    organizationSize: 'small',
    agenticAiInProduction: false,
    agentsCanTakeExternalActions: false,
    namedGovernanceOwner: true,
    auditEvidenceAvailable: true,
    remediationUrgency: 'low'
  });
  assert.equal(result.score, 0);
  assert.equal(result.classification, 'LOW_FIT');
  assert.equal(result.governanceRecommendation, 'HALT');
  assert.equal(result.recommendedNextAction, 'DO_NOT_ADVANCE');
});

test('medium fit requires review', () => {
  const result = scoreOpportunity({
    organizationSize: 'enterprise',
    agenticAiInProduction: true,
    agentsCanTakeExternalActions: false,
    namedGovernanceOwner: true,
    auditEvidenceAvailable: false,
    remediationUrgency: 'low'
  });
  assert.equal(result.score, 55);
  assert.equal(result.classification, 'MEDIUM_FIT');
  assert.equal(result.governanceRecommendation, 'REVIEW');
});
```

- [ ] **Step 2: Run the tests to prove red**

Run:

```bash
npm test -- test/domain/score-opportunity.test.ts
```

Expected: FAIL because `score-opportunity.ts` does not exist.

- [ ] **Step 3: Define shared types and minimal scoring implementation**

`src/types.ts`:

```ts
export type OpportunityInput = {
  organizationSize: 'small' | 'midmarket' | 'enterprise';
  agenticAiInProduction: boolean;
  agentsCanTakeExternalActions: boolean;
  namedGovernanceOwner: boolean;
  auditEvidenceAvailable: boolean;
  remediationUrgency: 'low' | 'medium' | 'high';
};

export type OpportunityScoreResult = {
  score: number;
  classification: 'HIGH_FIT' | 'MEDIUM_FIT' | 'LOW_FIT';
  reasonCodes: string[];
  confidence: 0.9;
  recommendedNextAction: 'PREPARE_INTERNAL_QUALIFICATION' | 'OWNER_REVIEW' | 'DO_NOT_ADVANCE';
  governanceRecommendation: 'ALLOW' | 'REVIEW' | 'HALT';
  authorityBoundary: 'NO_EXTERNAL_ACTION';
};
```

`src/domain/score-opportunity.ts`:

```ts
import type { OpportunityInput, OpportunityScoreResult } from '../types.js';

export function scoreOpportunity(input: OpportunityInput): OpportunityScoreResult {
  let score = 0;
  const reasonCodes: string[] = [];

  if (input.agenticAiInProduction) {
    score += 25;
    reasonCodes.push('AGENTIC_AI_LIVE');
  }
  if (input.agentsCanTakeExternalActions) {
    score += 20;
    reasonCodes.push('EXTERNAL_ACTION_SURFACE');
  }
  if (!input.namedGovernanceOwner) {
    score += 15;
    reasonCodes.push('NO_NAMED_GOVERNANCE_OWNER');
  }
  if (!input.auditEvidenceAvailable) {
    score += 15;
    reasonCodes.push('AUDIT_EVIDENCE_GAP');
  }
  if (input.organizationSize === 'midmarket' || input.organizationSize === 'enterprise') {
    score += 15;
    reasonCodes.push('MIDMARKET_OR_ENTERPRISE');
  }
  if (input.remediationUrgency === 'high') {
    score += 10;
    reasonCodes.push('HIGH_REMEDIATION_URGENCY');
  } else if (input.remediationUrgency === 'medium') {
    score += 5;
    reasonCodes.push('MEDIUM_REMEDIATION_URGENCY');
  }

  if (score >= 70) {
    return {
      score,
      classification: 'HIGH_FIT',
      reasonCodes,
      confidence: 0.9,
      recommendedNextAction: 'PREPARE_INTERNAL_QUALIFICATION',
      governanceRecommendation: 'ALLOW',
      authorityBoundary: 'NO_EXTERNAL_ACTION'
    };
  }
  if (score >= 45) {
    return {
      score,
      classification: 'MEDIUM_FIT',
      reasonCodes,
      confidence: 0.9,
      recommendedNextAction: 'OWNER_REVIEW',
      governanceRecommendation: 'REVIEW',
      authorityBoundary: 'NO_EXTERNAL_ACTION'
    };
  }
  return {
    score,
    classification: 'LOW_FIT',
    reasonCodes,
    confidence: 0.9,
    recommendedNextAction: 'DO_NOT_ADVANCE',
    governanceRecommendation: 'HALT',
    authorityBoundary: 'NO_EXTERNAL_ACTION'
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

```bash
npm test -- test/domain/score-opportunity.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/domain/score-opportunity.ts test/domain/score-opportunity.test.ts
git commit -m "feat: add deterministic AICR opportunity scoring"
git push origin main
```

---

### Task 3: Implement bounded static operator and AICR context

**Files:**
- Create: `src/domain/operator-context.ts`
- Create: `src/domain/aicr-offer.ts`
- Test: `test/domain/static-context.test.ts`

**Interfaces:**
- Produces: `getOperatorContext()` and `getAicrOffer()`.
- Both functions return static, JSON-serializable, non-sensitive objects.

- [ ] **Step 1: Write failing tests**

Tests must assert:

```ts
assert.equal(getOperatorContext().authorityMode, 'READ_ONLY');
assert.deepEqual(getOperatorContext().supportedTools, [
  'operator_context',
  'get_aicr_offer',
  'score_opportunity'
]);
assert.equal(getOperatorContext().externalActionAuthority, 'NONE');
assert.equal(getAicrOffer().offerName, 'Agentic AI Control Readiness Assessment');
assert.equal(getAicrOffer().commercialStatus, 'COMMERCIAL_PILOT_CANDIDATE');
assert.equal(getAicrOffer().nextValidAction, 'QUALIFY_OPPORTUNITY');
```

- [ ] **Step 2: Run tests to prove red**

Expected: missing-module failure.

- [ ] **Step 3: Implement `getOperatorContext()`**

Return exactly:

```ts
{
  serviceName: 'Daxxer Operator MCP',
  serviceVersion: '0.1.0',
  authorityMode: 'READ_ONLY',
  governanceState: 'V0_1_TRANSPORT_PROOF',
  supportedTools: ['operator_context', 'get_aicr_offer', 'score_opportunity'],
  externalActionAuthority: 'NONE',
  prohibitedActions: [
    'SEND_MESSAGE',
    'SEND_PROPOSAL',
    'CREATE_OR_MODIFY_INVOICE',
    'PAYMENT_OPERATION',
    'CLIENT_OR_PROJECT_MUTATION',
    'GITHUB_WRITE_OR_MERGE',
    'PERMISSION_CHANGE',
    'SHELL_EXECUTION',
    'FILESYSTEM_ACCESS',
    'SECRET_RETRIEVAL',
    'ARBITRARY_NETWORK_ACCESS'
  ],
  evidencePosture: 'VERIFY_BEFORE_CLAIM'
}
```

- [ ] **Step 4: Implement `getAicrOffer()`**

Return a bounded offer object containing:

```ts
{
  offerName: 'Agentic AI Control Readiness Assessment',
  problemAddressed: 'Identify whether agentic AI workflows have clear inventory, authority boundaries, governance controls, demonstrable evidence, and prioritized remediation.',
  idealBuyer: [
    'CIO',
    'CISO',
    'AI governance lead',
    'enterprise architecture lead',
    'platform or automation owner'
  ],
  idealOrganizationSignals: [
    'agentic AI or autonomous workflow adoption',
    'tools capable of external actions',
    'unclear ownership or approval boundaries',
    'audit or evidence gaps',
    'need to demonstrate control to leadership or customers'
  ],
  coreDeliverables: [
    'agent and workflow inventory',
    'capability and access review',
    'governance and control-gap assessment',
    'demonstrable-control evidence review',
    'prioritized remediation roadmap'
  ],
  engagementBoundary: 'ASSESSMENT_AND_RECOMMENDATION_ONLY',
  commercialStatus: 'COMMERCIAL_PILOT_CANDIDATE',
  nextValidAction: 'QUALIFY_OPPORTUNITY'
}
```

- [ ] **Step 5: Run tests/typecheck and commit**

```bash
npm test -- test/domain/static-context.test.ts
npm run typecheck
git add src/domain/operator-context.ts src/domain/aicr-offer.ts test/domain/static-context.test.ts
git commit -m "feat: add bounded operator and AICR context"
git push origin main
```

---

### Task 4: Register exactly three read-only MCP tools and prove protocol behavior

**Files:**
- Create: `src/mcp/build-server.ts`
- Create: `src/mcp/handler.ts`
- Test: `test/mcp/registry.test.ts`
- Test: `test/mcp/protocol.test.ts`

**Interfaces:**
- Produces: `buildServer(): McpServer`.
- Produces: `mcpHandler = createMcpHandler(() => buildServer())`.
- Tool annotations MUST include `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`.

- [ ] **Step 1: Write failing registry/protocol tests**

Use the official v2 client and in-process HTTP handler:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { mcpHandler } from '../../src/mcp/handler.js';

async function connectTestClient() {
  const client = new Client(
    { name: 'daxxer-contra-mcp-test', version: '0.1.0' },
    { versionNegotiation: { mode: 'auto' } }
  );
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url, init) => mcpHandler.fetch(new Request(url, init))
  });
  await client.connect(transport);
  return { client, transport };
}

test('tool registry exposes exactly the approved three tools', async () => {
  const { client } = await connectTestClient();
  const result = await client.listTools();
  assert.deepEqual(result.tools.map((tool) => tool.name).sort(), [
    'get_aicr_offer',
    'operator_context',
    'score_opportunity'
  ]);
  await client.close();
});

test('operator_context succeeds through MCP', async () => {
  const { client } = await connectTestClient();
  const result = await client.callTool({ name: 'operator_context', arguments: {} });
  assert.equal(result.isError, undefined);
  assert.equal((result.structuredContent as { authorityMode: string }).authorityMode, 'READ_ONLY');
  await client.close();
});

test('invalid score_opportunity arguments fail before business execution', async () => {
  const { client } = await connectTestClient();
  await assert.rejects(() => client.callTool({
    name: 'score_opportunity',
    arguments: { organizationSize: 'planetary' }
  }));
  await client.close();
});

test('unknown tool fails safely', async () => {
  const { client } = await connectTestClient();
  await assert.rejects(() => client.callTool({ name: 'proposal.send', arguments: {} }));
  await client.close();
});
```

- [ ] **Step 2: Run tests to prove red**

Expected: missing MCP implementation.

- [ ] **Step 3: Implement `buildServer()` with Zod >=4.2 schemas**

Use:

```ts
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { getOperatorContext } from '../domain/operator-context.js';
import { getAicrOffer } from '../domain/aicr-offer.js';
import { scoreOpportunity } from '../domain/score-opportunity.js';

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

export function buildServer(): McpServer {
  const server = new McpServer({
    name: 'daxxer-operator-mcp',
    version: '0.1.0'
  });

  server.registerTool(
    'operator_context',
    {
      description: 'Return the connector purpose, authority boundary, prohibited actions, and evidence posture.',
      inputSchema: z.object({}),
      annotations: READ_ONLY
    },
    async () => {
      const value = getOperatorContext();
      return {
        content: [{ type: 'text', text: JSON.stringify(value) }],
        structuredContent: value
      };
    }
  );

  server.registerTool(
    'get_aicr_offer',
    {
      description: 'Return the bounded Agentic AI Control Readiness Assessment offer definition.',
      inputSchema: z.object({}),
      annotations: READ_ONLY
    },
    async () => {
      const value = getAicrOffer();
      return {
        content: [{ type: 'text', text: JSON.stringify(value) }],
        structuredContent: value
      };
    }
  );

  server.registerTool(
    'score_opportunity',
    {
      description: 'Deterministically score an explicitly supplied opportunity for AICR fit. This never authorizes external outreach or mutation.',
      inputSchema: z.object({
        organizationSize: z.enum(['small', 'midmarket', 'enterprise']),
        agenticAiInProduction: z.boolean(),
        agentsCanTakeExternalActions: z.boolean(),
        namedGovernanceOwner: z.boolean(),
        auditEvidenceAvailable: z.boolean(),
        remediationUrgency: z.enum(['low', 'medium', 'high'])
      }),
      annotations: READ_ONLY
    },
    async (input) => {
      const value = scoreOpportunity(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(value) }],
        structuredContent: value
      };
    }
  );

  return server;
}
```

- [ ] **Step 4: Implement the stateless Streamable HTTP handler**

`src/mcp/handler.ts`:

```ts
import { createMcpHandler } from '@modelcontextprotocol/server';
import { buildServer } from './build-server.js';

export const mcpHandler = createMcpHandler(() => buildServer());
```

The default legacy mode remains `stateless`; do not add session persistence.

- [ ] **Step 5: Run protocol tests/typecheck**

```bash
npm test -- test/mcp/*.test.ts
npm run typecheck
```

Expected: exact-three registry passes; valid calls pass; invalid/unknown calls fail closed.

- [ ] **Step 6: Commit**

```bash
git add src/mcp test/mcp
git commit -m "feat: expose three read-only MCP tools"
git push origin main
```

---

### Task 5: Add Vercel transport boundary and health endpoint

**Files:**
- Create: `api/mcp.ts`
- Create: `api/health.ts`
- Create: `vercel.json`
- Test: `test/mcp/health.test.ts`

**Interfaces:**
- `/mcp` rewrites to `/api/mcp`.
- `/health` rewrites to `/api/health`.
- MCP Node handler consumes `mcpHandler` and exposes no additional tools.

- [ ] **Step 1: Write failing health test**

Extract a pure `healthPayload()` helper if needed so the test can assert exactly:

```json
{
  "service": "daxxer-operator-mcp",
  "version": "0.1.0",
  "status": "ok",
  "authority": "READ_ONLY",
  "toolCount": 3
}
```

No deployment ID, environment variable, hostname, token, request header, or private metadata may be returned.

- [ ] **Step 2: Implement `api/mcp.ts`**

```ts
import { toNodeHandler } from '@modelcontextprotocol/node';
import { mcpHandler } from '../src/mcp/handler.js';

export default toNodeHandler(mcpHandler, {
  onerror(error) {
    console.error('[mcp] request failed', error instanceof Error ? error.message : 'unknown error');
  }
});
```

Logging is message-only; do not log request bodies, headers, arguments, cookies, or stack traces.

- [ ] **Step 3: Implement `api/health.ts`**

Return the fixed payload above for GET. Return `405` for other methods.

- [ ] **Step 4: Create `vercel.json`**

```json
{
  "rewrites": [
    { "source": "/mcp", "destination": "/api/mcp" },
    { "source": "/health", "destination": "/api/health" }
  ]
}
```

- [ ] **Step 5: Run full local verification**

```bash
npm run check
```

Expected: all tests and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add api vercel.json test/mcp/health.test.ts
git commit -m "feat: add isolated Vercel MCP transport"
git push origin main
```

---

### Task 6: Add independent live verifier and deploy

**Files:**
- Create: `scripts/verify-live.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes one explicit `MCP_URL` environment variable.
- Performs only MCP discovery and a read-only `operator_context` call.
- Exits non-zero on mismatch.

- [ ] **Step 1: Implement `scripts/verify-live.ts`**

```ts
import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const url = process.env.MCP_URL;
if (!url) throw new Error('MCP_URL is required');

const client = new Client(
  { name: 'daxxer-live-verifier', version: '0.1.0' },
  { versionNegotiation: { mode: 'auto' } }
);

await client.connect(new StreamableHTTPClientTransport(new URL(url)));
const tools = await client.listTools();
assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
  'get_aicr_offer',
  'operator_context',
  'score_opportunity'
]);
const result = await client.callTool({ name: 'operator_context', arguments: {} });
assert.equal((result.structuredContent as { authorityMode: string }).authorityMode, 'READ_ONLY');
await client.close();
console.log(JSON.stringify({ ok: true, tools: tools.tools.map((tool) => tool.name).sort() }));
```

- [ ] **Step 2: Run full pre-deploy check**

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 3: Deploy to an isolated Vercel project**

Preferred CLI path when authenticated:

```bash
vercel --yes
vercel --prod --yes
```

The project name must be `daxxer-contra-mcp` or an unambiguous equivalent. Do not add environment secrets. If deployment requires paid features or spend, HALT.

- [ ] **Step 4: Verify live health over HTTPS**

```bash
curl -fsS https://<production-host>/health
```

Expected exact public fields: `service`, `version`, `status`, `authority`, `toolCount` only.

- [ ] **Step 5: Verify live MCP independently**

```bash
MCP_URL=https://<production-host>/mcp npm run verify:live
```

Expected: exit 0 and JSON showing exactly three approved tools.

- [ ] **Step 6: Commit verifier/docs**

```bash
git add scripts/verify-live.ts README.md
git commit -m "test: add live MCP verification"
git push origin main
```

---

### Task 7: Contra acceptance proof and evidence receipt

**Files:**
- Create: `docs/evidence/receipt-v0.1.md`

**Interfaces:**
- Consumes: exact repository commit SHA, production URL, automated test output, live verifier output, Contra connector proof.
- Produces: immutable-style evidence summary distinguishing verified proof from residual risk.

- [ ] **Step 1: Register connector in Contra**

Enter:

```text
Name: Daxxer Operator MCP
Remote MCP server URL: https://<production-host>/mcp
```

Do not place any secret, token, query parameter, or credential in the URL.

- [ ] **Step 2: Prove Contra tool discovery**

Acceptance: Contra saves the connector and Co-Agent exposes/discovers exactly:

```text
operator_context
get_aicr_offer
score_opportunity
```

If Contra requires OAuth/authentication before it will discover tools, HALT and return to owner review. Do not add auth in v0.1.

- [ ] **Step 3: Execute one Contra-originated read-only call**

Ask Contra Co-Agent to call `operator_context`.

Acceptance: returned structured data reports `authorityMode: READ_ONLY` and `externalActionAuthority: NONE`.

- [ ] **Step 4: Capture evidence receipt**

Create `docs/evidence/receipt-v0.1.md` with this exact structure:

```markdown
# Daxxer Contra MCP v0.1 Evidence Receipt

## Decision
ALLOW / REVIEW / HALT

## Repository proof
- repository:
- commit SHA:
- branch:

## Automated verification
- `npm run check`:
- test count:
- failures:

## Deployment proof
- Vercel project:
- production host:
- `/health` result:

## Live MCP proof
- endpoint:
- negotiated protocol era/version:
- discovered tools:
- `operator_context` call result:

## Contra proof
- connector saved: yes/no
- tools discovered: yes/no
- Contra-originated tool call: pass/fail
- proof source:

## Authority proof
- write-capable tools present: no
- external connectors present: no
- secrets required: no

## Residual risks
- public unauthenticated endpoint can be called by anyone who knows the URL
- v0.1 contains only non-sensitive static/read-only data by design
- rate limiting/authentication deferred pending proven Contra transport behavior

## Deferred capabilities
- private-system reads
- proposal preparation
- proposal/message sending
- invoices/payments
- evidence-ledger writes
- CASA/GHT runtime enforcement
- knowledge-graph mutation
```

Do not mark the receipt ALLOW unless all acceptance criteria are evidenced.

- [ ] **Step 5: Commit receipt after proof only**

```bash
git add docs/evidence/receipt-v0.1.md
git commit -m "docs: record Contra MCP v0.1 evidence receipt"
git push origin main
```

---

## Final Verification Gate

Run:

```bash
npm run check
MCP_URL=https://<production-host>/mcp npm run verify:live
git status --short
git rev-parse HEAD
```

Then independently verify in Contra:

1. connector saved,
2. exact tool inventory is three,
3. one Contra-originated call succeeds,
4. no write-capable tool exists.

**Completion decision:**

- `ALLOW` only if all automated, deployment, live MCP, and Contra proofs pass.
- `REVIEW` if code/deployment proofs pass but Contra discovery/call remains unverified.
- `HALT` if auth, secrets, paid-plan changes, scope expansion, write authority, or protocol incompatibility are required.

## Plan Self-Review

- Spec coverage: all design sections map to repository isolation, domain logic, MCP registry, transport, errors/validation, deployment, Contra proof, evidence, and stop conditions.
- Placeholder scan: deployment host is intentionally represented as `<production-host>` because it is generated only by the deployment action; it is not an implementation ambiguity and must be replaced by verified evidence before receipt creation.
- Type consistency: `OpportunityInput`, `OpportunityScoreResult`, `buildServer`, `mcpHandler`, and the three tool names are consistent across tasks.
- Scope: no private connector, write action, persistent ledger, OAuth provider, UI, or multi-tenant capability is introduced.