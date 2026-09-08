# Daxxer Contra MCP v0.1 — Plan Review Amendment

Status: REQUIRED COMPANION TO `2026-09-08-daxxer-contra-mcp-v0.1.md`
Date: 2026-09-08

This amendment is the result of the implementation-plan self-review. It closes two ambiguities without expanding v0.1 scope. Where this file conflicts with the original plan, this file controls.

## Amendment 1 — explicit health test seam

Add `src/health.ts` to the planned file structure. It owns the fixed public health payload and has no request/environment dependencies.

Create `src/health.ts`:

```ts
export const HEALTH_PAYLOAD = Object.freeze({
  service: 'daxxer-operator-mcp',
  version: '0.1.0',
  status: 'ok',
  authority: 'READ_ONLY',
  toolCount: 3
} as const);

export function healthPayload() {
  return HEALTH_PAYLOAD;
}
```

Replace Task 5's health step with this exact `api/health.ts` implementation:

```ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { healthPayload } from '../src/health.js';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'content-type': 'application/json; charset=utf-8', allow: 'GET' });
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(healthPayload()));
}
```

Create `test/mcp/health.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { healthPayload } from '../../src/health.js';

test('health payload contains only approved non-sensitive fields', () => {
  const result = healthPayload();
  assert.deepEqual(Object.keys(result).sort(), [
    'authority',
    'service',
    'status',
    'toolCount',
    'version'
  ]);
  assert.deepEqual(result, {
    service: 'daxxer-operator-mcp',
    version: '0.1.0',
    status: 'ok',
    authority: 'READ_ONLY',
    toolCount: 3
  });
});
```

Task 5 commit must include `src/health.ts`, `api/health.ts`, and `test/mcp/health.test.ts`.

## Amendment 2 — strengthen protocol failure/authority proof

Extend Task 4's protocol/registry tests with both tests below.

### Read-only annotations are explicit

```ts
test('every discovered tool is explicitly read-only and non-destructive', async () => {
  const { client } = await connectTestClient();
  const result = await client.listTools();
  for (const tool of result.tools) {
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.destructiveHint, false);
    assert.equal(tool.annotations?.idempotentHint, true);
    assert.equal(tool.annotations?.openWorldHint, false);
  }
  await client.close();
});
```

### Malformed JSON-RPC request fails closed

```ts
test('malformed MCP request fails without exposing stack or internals', async () => {
  const response = await mcpHandler.fetch(new Request('http://test.local/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not-json'
  }));

  assert.ok(response.status >= 400);
  const body = await response.text();
  assert.doesNotMatch(body, /node_modules|stack|at\s+\w+\s*\(/i);
});
```

The malformed-request assertion is intentionally transport-level. Do not add custom fallback execution or catch-and-continue behavior to make it pass.

## Self-review result

- Spec coverage: PASS after amendments.
- Placeholder ambiguity: PASS. The only deployment placeholder remains `<production-host>`, which cannot truthfully be populated before deployment and must be replaced with verified evidence in the receipt.
- Type/interface consistency: PASS.
- Authority boundary: PASS; no additional capability introduced.
- Scope expansion: NONE.
