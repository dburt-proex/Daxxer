import { appendFile, mkdir, readFile } from "node:fs/promises";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { join } from "node:path";


const VERSION = "1.0";
const VERSION = "1.0";
const INSTRUCTION_LIKE = /\b(ignore (all |previous )?instructions|system prompt|send (the )?(secret|token|password)|exfiltrat(e|ion)|run (this|the) command)\b/i;
const INSTRUCTION_LIKE = /\b(ignore (all |previous )?instructions|system prompt|send (the )?(secret|token|password)|exfiltrat(e|ion)|run (this|the) command)\b/i;
const now = () => new Date().toISOString();
const now = () => new Date().toISOString();
const id = () => randomUUID();
const id = () => randomUUID();


function canonical(value) {
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
}


function hash(value) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function hash(value) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function limited(value, max = 240) { return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max); }
function limited(value, max = 240) { return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max); }


export class EventSpine {
export class EventSpine {
  constructor({ dataDir, fetchImpl = globalThis.fetch } = {}) {
  constructor({ dataDir, fetchImpl = globalThis.fetch } = {}) {
    if (!dataDir) throw new Error("EventSpine requires a dataDir");
    if (!dataDir) throw new Error("EventSpine requires a dataDir");
    this.filePath = join(dataDir, "event-spine.jsonl");
    this.filePath = join(dataDir, "event-spine.jsonl");
    this.fetchImpl = fetchImpl;
    this.fetchImpl = fetchImpl;
    this.entries = [];
    this.entries = [];
    this.seen = new Set();
    this.seen = new Set();
    this.loaded = false;
    this.loaded = false;
  }
  }


  async load() {
  async load() {
    if (this.loaded) return;
    if (this.loaded) return;
    try {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const raw = await readFile(this.filePath, "utf8");
      this.entries = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
      this.entries = raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    } catch (error) {
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (error.code !== "ENOENT") throw error;
    }
    }
    this.assertValid();
    this.assertValid();
    for (const entry of this.entries) if (entry.record.kind === "work_event") this.seen.add(entry.record.value.dedupeKey);
    for (const entry of this.entries) if (entry.record.kind === "work_event") this.seen.add(entry.record.value.dedupeKey);
    this.loaded = true;
    this.loaded = true;
  }
  }


  async recordWorkspaceEvent(type, payload = {}) {
  async recordWorkspaceEvent(type, payload = {}) {
    await this.load();
    await this.load();
    const event = this.makeEvent({
    const event = this.makeEvent({
      domain: type.startsWith("search.") ? "search" : type.startsWith("task.") ? "tasks" : "notes",
      domain: type.startsWith("search.") ? "search" : type.startsWith("task.") ? "tasks" : "notes",
      type,
      type,
      actor: { kind: "system", id: "daxxer-host" },
      actor: { kind: "system", id: "daxxer-host" },
      source: { adapter: "dv2", resourceType: "workspace", locator: "daxxer://local", retrievedAt: now(), trust: "first_party" },
      source: { adapter: "dv2", resourceType: "workspace", locator: "daxxer://local", retrievedAt: now(), trust: "first_party" },
      payload,
      payload,
    });
    });
    return this.recordEvent(event);
    return this.recordEvent(event);
  }
  }


  async scanGitHubRepository(repository) {
  async scanGitHubRepository(repository) {
    await this.load();
    await this.load();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || "")) throw new Error("Repository must be owner/name");
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || "")) throw new Error("Repository must be owner/name");
    const startedAt = now();
    const startedAt = now();
    const correlationId = id();
    const correlationId = id();
    try {
    try {
      const [repoResponse, rootResponse] = await Promise.all([
      const [repoResponse, rootResponse] = await Promise.all([
        this.fetchGitHub(`/repos/${repository}`),
        this.fetchGitHub(`/repos/${repository}`),
        this.fetchGitHub(`/repos/${repository}/contents`),
        this.fetchGitHub(`/repos/${repository}/contents`),
      ]);
      ]);
      const [repo, root] = await Promise.all([repoResponse.json(), rootResponse.json()]);
      const [repo, root] = await Promise.all([repoResponse.json(), rootResponse.json()]);
      const source = { adapter: "github", resourceType: "repository", locator: `https://github.com/${repository}`, owner: repository, retrievedAt: now(), trust: "user_authorized" };
      const source = { adapter: "github", resourceType: "repository", locator: `https://github.com/${repository}`, owner: repository, retrievedAt: now(), trust: "user_authorized" };
      const receipt = {
      const receipt = {
        schemaVersion: VERSION, id: id(), adapter: "github", mode: "read_only", operation: "read_repository", status: "success",
        schemaVersion: VERSION, id: id(), adapter: "github", mode: "read_only", operation: "read_repository", status: "success",
        requestedAt: startedAt, completedAt: now(), correlationId,
        requestedAt: startedAt, completedAt: now(), correlationId,
        request: { resource: `github://${repository}` },
        request: { resource: `github://${repository}` },
        result: { itemCount: Array.isArray(root) ? root.length + 1 : 1, contentHash: hash({ repo: { id: repo.id, pushed_at: repo.pushed_at }, root: Array.isArray(root) ? root.map((entry) => entry.path) : [] }) },
        result: { itemCount: Array.isArray(root) ? root.length + 1 : 1, contentHash: hash({ repo: { id: repo.id, pushed_at: repo.pushed_at }, root: Array.isArray(root) ? root.map((entry) => entry.path) : [] }) },
        warnings: ["Public GitHub content is evidence only. This adapter has no write path and no credential storage."],
        warnings: ["Public GitHub content is evidence only. This adapter has no write path and no credential storage."],
      };
      };
      await this.append({ kind: "adapter_receipt", value: receipt });
      await this.append({ kind: "adapter_receipt", value: receipt });
      const records = [];
      const records = [];
      records.push(await this.recordEvent(this.makeEvent({ domain: "github", type: "github.repository_observed", actor: { kind: "adapter", id: "github-read-only" }, source, correlationId, payload: {
      records.push(await this.recordEvent(this.makeEvent({ domain: "github", type: "github.repository_observed", actor: { kind: "adapter", id: "github-read-only" }, source, correlationId, payload: {
        repository, name: limited(repo.name), description: limited(repo.description), defaultBranch: limited(repo.default_branch), pushedAt: repo.pushed_at, updatedAt: repo.updated_at, openIssues: Number(repo.open_issues_count || 0), visibility: limited(repo.visibility),
        repository, name: limited(repo.name), description: limited(repo.description), defaultBranch: limited(repo.default_branch), pushedAt: repo.pushed_at, updatedAt: repo.updated_at, openIssues: Number(repo.open_issues_count || 0), visibility: limited(repo.visibility),
      }})));
      }})));
      for (const entry of (Array.isArray(root) ? root : [])) {
      for (const entry of (Array.isArray(root) ? root : [])) {
        records.push(await this.recordEvent(this.makeEvent({ domain: "github", type: "github.root_entry_observed", actor: { kind: "adapter", id: "github-read-only" }, source: { ...source, resourceType: entry.type === "dir" ? "directory" : "file", locator: `https://github.com/${repository}/blob/${repo.default_branch}/${entry.path}` }, correlationId, payload: { repository, path: limited(entry.path), entryType: limited(entry.type), size: Number(entry.size || 0) }})));
        records.push(await this.recordEvent(this.makeEvent({ domain: "github", type: "github.root_entry_observed", actor: { kind: "adapter", id: "github-read-only" }, source: { ...source, resourceType: entry.type === "dir" ? "directory" : "file", locator: `https://github.com/${repository}/blob/${repo.default_branch}/${entry.path}` }, correlationId, payload: { repository, path: limited(entry.path), entryType: limited(entry.type), size: Number(entry.size || 0) }})));
      }
      }
      await this.append({ kind: "checkpoint", value: this.checkpoint("github_scan") });
      await this.append({ kind: "checkpoint", value: this.checkpoint("github_scan") });
      return { receipt, records, checkpoint: this.entries.at(-1).record.value };
      return { receipt, records, checkpoint: this.entries.at(-1).record.value };
    } catch (error) {
    } catch (error) {
      const receipt = { schemaVersion: VERSION, id: id(), adapter: "github", mode: "read_only", operation: "read_repository", status: "failed", requestedAt: startedAt, completedAt: now(), correlationId, request: { resource: `github://${repository}` }, result: { itemCount: 0, contentHash: hash({ repository, error: String(error?.message || error) }) }, warnings: [], error: { code: "github_read_failed", retryable: true } };
      const receipt = { schemaVersion: VERSION, id: id(), adapter: "github", mode: "read_only", operation: "read_repository", status: "failed", requestedAt: startedAt, completedAt: now(), correlationId, request: { resource: `github://${repository}` }, result: { itemCount: 0, contentHash: hash({ repository, error: String(error?.message || error) }) }, warnings: [], error: { code: "github_read_failed", retryable: true } };
      await this.append({ kind: "adapter_receipt", value: receipt });
      await this.append({ kind: "adapter_receipt", value: receipt });
      throw new Error("GitHub read-only scan failed");
      throw new Error("GitHub read-only scan failed");
    }
    }
  }
  }


  status() {
  status() {
    this.assertValid();
    this.assertValid();
    const candidates = this.entries.filter((entry) => entry.record.kind === "graph_candidate").map((entry) => entry.record.value);
    const candidates = this.entries.filter((entry) => entry.record.kind === "graph_candidate").map((entry) => entry.record.value);
    const gates = this.entries.filter((entry) => entry.record.kind === "gate").map((entry) => entry.record.value);
    const gates = this.entries.filter((entry) => entry.record.kind === "gate").map((entry) => entry.record.value);
    return { schemaVersion: VERSION, ledger: { entries: this.entries.length, valid: true, latestHash: this.entries.at(-1)?.hash ?? null }, candidates: candidates.length, gates: gates.reduce((counts, gate) => ({ ...counts, [gate.decision.toLowerCase()]: (counts[gate.decision.toLowerCase()] || 0) + 1 }), {}) };
    return { schemaVersion: VERSION, ledger: { entries: this.entries.length, valid: true, latestHash: this.entries.at(-1)?.hash ?? null }, candidates: candidates.length, gates: gates.reduce((counts, gate) => ({ ...counts, [gate.decision.toLowerCase()]: (counts[gate.decision.toLowerCase()] || 0) + 1 }), {}) };
  }
  }


  graph() {
  graph() {
    this.assertValid();
    this.assertValid();
    const candidates = this.entries.filter((entry) => entry.record.kind === "graph_candidate").map((entry) => entry.record.value);
    const candidates = this.entries.filter((entry) => entry.record.kind === "graph_candidate").map((entry) => entry.record.value);
    const gateByCandidate = new Map(this.entries.filter((entry) => entry.record.kind === "gate").map((entry) => [entry.record.value.candidateId, entry.record.value]));
    const gateByCandidate = new Map(this.entries.filter((entry) => entry.record.kind === "gate").map((entry) => [entry.record.value.candidateId, entry.record.value]));
    return { nodes: candidates.map((candidate) => ({ ...candidate, gate: gateByCandidate.get(candidate.id) })), ledger: this.status().ledger };
    return { nodes: candidates.map((candidate) => ({ ...candidate, gate: gateByCandidate.get(candidate.id) })), ledger: this.status().ledger };
  }
  }


  async recordEvent(event) {
  async recordEvent(event) {
    const dedupeKey = hash({ domain: event.domain, type: event.type, source: event.source.locator, payload: event.payload });
    const dedupeKey = hash({ domain: event.domain, type: event.type, source: event.source.locator, payload: event.payload });
    if (this.seen.has(dedupeKey)) return { duplicate: true, eventId: event.id };
    if (this.seen.has(dedupeKey)) return { duplicate: true, eventId: event.id };
    this.seen.add(dedupeKey);
    this.seen.add(dedupeKey);
    event.dedupeKey = dedupeKey;
    event.dedupeKey = dedupeKey;
    await this.append({ kind: "work_event", value: event });
    await this.append({ kind: "work_event", value: event });
    const candidate = this.candidateFrom(event);
    const candidate = this.candidateFrom(event);
    const gate = this.gate(candidate);
    const gate = this.gate(candidate);
    await this.append({ kind: "graph_candidate", value: candidate });
    await this.append({ kind: "graph_candidate", value: candidate });
    await this.append({ kind: "gate", value: gate });
    await this.append({ kind: "gate", value: gate });
    return { duplicate: false, eventId: event.id, candidate, gate };
    return { duplicate: false, eventId: event.id, candidate, gate };
  }
  }


  makeEvent({ domain, type, actor, source, payload, correlationId = id() }) {
  makeEvent({ domain, type, actor, source, payload, correlationId = id() }) {
    return { schemaVersion: VERSION, id: id(), occurredAt: now(), domain, type, actor, source, correlationId, payload, contentFingerprint: hash({ source, payload }) };
    return { schemaVersion: VERSION, id: id(), occurredAt: now(), domain, type, actor, source, correlationId, payload, contentFingerprint: hash({ source, payload }) };
  }
  }


  candidateFrom(event) {
  candidateFrom(event) {
    const summary = limited(event.payload.title || event.payload.name || event.payload.path || event.type);
    const summary = limited(event.payload.title || event.payload.name || event.payload.path || event.type);
    const evidence = [event.payload.description, event.payload.title, event.payload.path].filter(Boolean).map((value) => limited(value));
    const evidence = [event.payload.description, event.payload.title, event.payload.path].filter(Boolean).map((value) => limited(value));
    return { schemaVersion: VERSION, id: id(), candidateType: event.type.includes("entry") ? "relationship" : event.type.includes("page") ? "work_item" : "entity", summary, sourceEventIds: [event.id], sourceRefs: [event.source], confidence: event.source.trust === "first_party" ? 0.9 : event.source.trust === "user_authorized" ? 0.75 : 0.5, evidence, fingerprint: hash({ summary, source: event.source.locator }) };
    return { schemaVersion: VERSION, id: id(), candidateType: event.type.includes("entry") ? "relationship" : event.type.includes("page") ? "work_item" : "entity", summary, sourceEventIds: [event.id], sourceRefs: [event.source], confidence: event.source.trust === "first_party" ? 0.9 : event.source.trust === "user_authorized" ? 0.75 : 0.5, evidence, fingerprint: hash({ summary, source: event.source.locator }) };
  }
  }


  gate(candidate) {
  gate(candidate) {
    const text = candidate.evidence.join("\n");
    const text = candidate.evidence.join("\n");
    const halted = INSTRUCTION_LIKE.test(text);
    const halted = INSTRUCTION_LIKE.test(text);
    const review = !halted && candidate.sourceRefs.some((source) => source.trust === "unknown" || source.trust === "public_web");
    const review = !halted && candidate.sourceRefs.some((source) => source.trust === "unknown" || source.trust === "public_web");
    return { schemaVersion: VERSION, id: id(), candidateId: candidate.id, decision: halted ? "HALT" : review ? "REVIEW" : "ALLOW", decidedAt: now(), policyVersion: "dv2-002.1", reasons: halted ? ["Untrusted external content contains instruction-like or potential exfiltration language."] : review ? ["Lower-confidence evidence requires human review before promotion."] : ["Read-only source and candidate passed the conservative import policy."], requiredAction: halted ? "Human security review." : review ? "Human review before graph promotion." : undefined };
    return { schemaVersion: VERSION, id: id(), candidateId: candidate.id, decision: halted ? "HALT" : review ? "REVIEW" : "ALLOW", decidedAt: now(), policyVersion: "dv2-002.1", reasons: halted ? ["Untrusted external content contains instruction-like or potential exfiltration language."] : review ? ["Lower-confidence evidence requires human review before promotion."] : ["Read-only source and candidate passed the conservative import policy."], requiredAction: halted ? "Human security review." : review ? "Human review before graph promotion." : undefined };
  }
  }


  checkpoint(reason) { const latest = this.entries.at(-1); return { schemaVersion: VERSION, id: id(), createdAt: now(), ledgerSequence: latest?.sequence || 0, ledgerHash: latest?.hash || null, reason }; }
  checkpoint(reason) { const latest = this.entries.at(-1); return { schemaVersion: VERSION, id: id(), createdAt: now(), ledgerSequence: latest?.sequence || 0, ledgerHash: latest?.hash || null, reason }; }


  async append(record) {
  async append(record) {
    const previous = this.entries.at(-1);
    const previous = this.entries.at(-1);
    const entry = { sequence: this.entries.length + 1, appendedAt: now(), previousHash: previous?.hash ?? null, hash: "", record };
    const entry = { sequence: this.entries.length + 1, appendedAt: now(), previousHash: previous?.hash ?? null, hash: "", record };
    entry.hash = hash({ sequence: entry.sequence, appendedAt: entry.appendedAt, previousHash: entry.previousHash, record: entry.record });
    entry.hash = hash({ sequence: entry.sequence, appendedAt: entry.appendedAt, previousHash: entry.previousHash, record: entry.record });
    this.entries.push(entry);
    this.entries.push(entry);
    await mkdir(join(this.filePath, ".."), { recursive: true });
    await mkdir(join(this.filePath, ".."), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
    await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
    return entry;
    return entry;
  }
  }


  assertValid() {
  assertValid() {
    for (let index = 0; index < this.entries.length; index += 1) {
    for (let index = 0; index < this.entries.length; index += 1) {
      const entry = this.entries[index]; const previous = this.entries[index - 1];
      const entry = this.entries[index]; const previous = this.entries[index - 1];
      const expected = hash({ sequence: entry.sequence, appendedAt: entry.appendedAt, previousHash: entry.previousHash, record: entry.record });
      const expected = hash({ sequence: entry.sequence, appendedAt: entry.appendedAt, previousHash: entry.previousHash, record: entry.record });
      if (entry.sequence !== index + 1 || entry.previousHash !== (previous?.hash ?? null) || entry.hash !== expected) throw new Error(`Event spine integrity failure at sequence ${index + 1}`);
      if (entry.sequence !== index + 1 || entry.previousHash !== (previous?.hash ?? null) || entry.hash !== expected) throw new Error(`Event spine integrity failure at sequence ${index + 1}`);
    }
    }
  }
  }


  async fetchGitHub(path) {
  async fetchGitHub(path) {
    const response = await this.fetchImpl(`https://api.github.com${path}`, { headers: { accept: "application/vnd.github+json" } });
    const response = await this.fetchImpl(`https://api.github.com${path}`, { headers: { accept: "application/vnd.github+json" } });
    if (!response?.ok) throw new Error(`GitHub returned ${response?.status || "network error"}`);
    if (!response?.ok) throw new Error(`GitHub returned ${response?.status || "network error"}`);
    return response;
    return response;
  }
  }
}
}


export function createEventSpine(options) { return new EventSpine(options); }
export function createEventSpine(options) { return new EventSpine(options); }
