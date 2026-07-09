---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-21
  type: feat
  status: Proposed
  slug: confluence-adapter
  title: "[MS2-E3-S4] Confluence adapter — TargetSystem port implementation (REST v2/v1 isolation, 409/403/400-dup/429 handling)"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, MS2-E3, safe-publish, critical, security, infrastructure, adapter]
  version_impact: minor
  audience: internal
  security_impact: high
  risk_level: high
  dependencies:
    internal: [MS2-E2-S4 (GH-17 auth provider), MS2-E3-S3 (GH-20 markdown pipeline), MS2-E3-S5 (blocked), MS2-E3-S6 (blocked), MS2-E4-S1 (blocked), MS2-E4-S2 (blocked)]
    external: [Atlassian Confluence Cloud REST API (v2 pages/properties + v1 attachments/search/restrictions)]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Deliver the sole `TargetSystem` port implementation for Atlassian Confluence Cloud — isolating every REST v2/v1 distinction, the 409 optimistic-concurrency signal, the 403 permission-asymmetry case, the 400 duplicate-attachment idempotency signal, and 429 rate-limit backoff behind a clean domain-owned port so the domain/application tiers have zero Confluence imports — enabling mock-based testing and future wiki adapters — and adding two error-model changes — the story-mandated `RateLimited` arm (exhausted-429) and the PM-decided `RemoteUnreachable` arm (exhausted-5xx/network; OQ-1) — that the transient-failure paths require.

## 1. SUMMARY

This is the **fourth story of epic MS2-E3 (Safe publish core)** and the **transport half** of the safe-publish pipeline: where GH-20 delivered the *body* the pipeline writes, this story delivers the *channel* it writes through. It implements the `TargetSystem` port for Confluence Cloud:

1. **A domain-owned port interface** (`TargetSystem`) — the contract every adapter implements, with **no Confluence types** in its surface: `renderBody`, `getPage`, `createPage`, `updatePage` (returns `Conflict` on 409), `movePage`, `getProperty`, `putProperty`, `uploadAttachment`, `attachmentExists`, `listAttachments`, `searchPages`, `getRestrictions`. Every operation returns `Result<T, MarkSyncError>`.
2. **A Confluence HTTP client** (`ConfluenceClient`) — native `fetch`; `v1(path)`/`v2(path)` URL builders; `authHeader` injected from the GH-17 credentials; `Content-Type: application/json`, `User-Agent: marksync/<ver>`; **redacted** request/response logging; 429 exponential backoff (1s/2s/4s + jitter, `Retry-After` honored, max 3); 5xx retry (max 3). **No HTTP library.**
3. **Per-surface services** isolating the v2/v1 split — `PageService` (v2) with the critical 409-conflict parse; `PropertyService` (v2) for the `marksync.metadata` string property; `AttachmentService` (v1-only) treating the duplicate-filename 400 as an idempotency signal; `SearchService` + `RestrictionsService` (v1-only, minimal for MS-0002).
4. **403 warn+skip semantics** — a page that returns 403 → `Forbidden`, mapped to warn+skip, **never** delete+recreate (ADR-0006, R-FEA-10, INV-SAFE-1).
5. **A provenance formatter** (`version.message`) consumed by E3-S6/E4-S3 — Confluence-specific, so it lives in the adapter.
6. **Two domain error-model additions** — the story-mandated `RateLimited` arm (exhausted-429) and the PM-decided `RemoteUnreachable` arm (exhausted-5xx/network failure; OQ-1 resolution) are **added** to the `MarkSyncError` union (and to `assertNeverMarkSyncError`). These are the **only** error-model changes; `Conflict`, `Forbidden`, `TooLarge`, and `RemoteMissing` already exist and are reused.
7. **zod boundary validation** — every Confluence response is validated at the boundary; no unvalidated remote payload crosses into the adapter's typed return values.

This story is `blocked_by` GH-17 (auth provider — merged) and GH-20 (markdown pipeline — merged): it injects the GH-17 `authHeader` and delegates the port's `renderBody` to the GH-20 `renderStorage`. Downstream consumers: E3-S5 (drift fetches remote via the port), E3-S6 (apply via the port; consumes `Conflict`/`Forbidden`/`RateLimited` + the provenance formatter), E3-S7 (concurrency via 409), E4-S1/E4-S2 (attachments via the port).

## 2. CONTEXT

### 2.1 Current State Snapshot

- **GH-17 (auth provider) is merged** — this story's `blocked_by` dependency, satisfied. It landed `ConfluenceCredentials { baseUrl; authHeader; email; mode }` (`src/domain/credentials.ts`) — the opaque `"Basic …"` `authHeader` the adapter injects into every request, with a **masked** email (`j***@host`) and **no raw token field** (INV-SEC-1). The adapter receives `authHeader` and never sees the raw token. The provider's `validateCredentials` already proved the classic-API-token Basic-auth-over-direct-site-URL path (spike H1) and the `GET /wiki/api/v2/user/by-me` shape.
- **GH-20 (markdown pipeline) is merged** — this story's other `blocked_by` dependency, satisfied. It landed `renderStorage(hast, opts) → { body; hash; warnings }` (`src/infra/confluence/render/storage.ts`) — the HAST→Storage XHTML visitor the port's `renderBody` delegates to. The body renderer is target-specific (it emits Confluence Storage macros), which is why it lives in the adapter; the app layer (E3-S6) calls `target.renderBody(mdast)` and never imports the renderer directly (story file Background). The `UnsupportedConstruct` arm it produces is the render path's documented failure.
- **The `Result<T, E>` channel and the `MarkSyncError` union already carry almost everything this story needs.** `src/domain/result.ts` provides `Result<T, E>` + `Result.ok` / `Result.err`. `src/domain/errors.ts` already has `Conflict { pageId; baseVersion; remoteVersion }`, `Forbidden { pageId; operation }`, `TooLarge { pageId; what }`, and `RemoteMissing { pageId }` — the four arms the adapter's success/failure paths produce. **`RateLimited` does NOT yet exist** in the union or in `assertNeverMarkSyncError`; it is a **new deliverable** of this story (pm-notes cross-check; F-9, DEC-2).
- **The boundary is already enforced.** `.dependency-cruiser.cjs` declares `domain-may-not-import-infra` (from `src/domain/` → `src/infra/`) and `presentation-may-not-import-infra` (from `src/cli/` → `src/infra/`) at severity `error`. `bun run check` runs `check:boundaries` (dep-cruiser) as part of the gate. The AC's negative test (a scratch file under `src/domain/` importing from `src/infra/confluence/`) just **proves** the existing rule catches a breach — it does not add the rule (pm-notes cross-check).
- **ADR-0006 is the load-bearing state-model decision** — settled, `Accepted`. It establishes that the Confluence **page ID** is the remote identity, that the **v2 content property `marksync.metadata`** is the lock cross-check (C-2: content properties survive across page updates; spike H2 validated ~8.4 KB string values; v1 content properties are deprecated), and that **409 on stale `version.number`** is the decentralized optimistic-concurrency gate (C-5/C-6, spike H5). Its INV-SAFE-1 (zero silent overwrites) and the 403→warn+skip (never delete+recreate) obligation are adapter responsibilities discharged here.
- **ADR-0005 is the body-representation decision** — settled, `Accepted`. Storage Format (not ADF) is the write target; the v2 page API accepts `representation:"storage"` (spike H3). This story's `PageService` writes Storage bodies produced by GH-20's `renderStorage`; it performs no body conversion.
- **The spike (MS-0001) VALIDATED every operation this story implements** (H1–H6, blueprint §0). The facts that force the adapter's design:
  - **H1 (auth):** classic API-token Basic auth over the direct site URL works; `accountId`/`userKey` present. *(validated)*
  - **H2 (content properties):** v2 `/pages/{id}/properties` accepts **string** values; ~8.4 KB accepted; v1 is **deprecated** (removal date passed); v1+v2 share one namespace (a v1-created property 409-conflicts a v2 create). → **v2 is the only supported path.** *(validated)*
  - **H3 (storage write):** v2 page API accepts `representation:"storage"`; minimal body round-trips byte-identical; update bumps `version.number` 1→2. *(validated)*
  - **H4 (attachments):** v1 multipart upload with `X-Atlassian-Token: no-check` → 200; update **must** go via `/child/attachment/{attId}/data` (version 1→2); the create endpoint **rejects a duplicate filename with 400** `"Cannot add a new attachment with the same file name"` — this is the **skip-if-exists idempotency signal**, not an error. *(validated)*
  - **H5 (version conflict):** an update MUST send `version.number = current + 1`; a stale update → **`409`, `errors[0].code = "CONFLICT"`, `title = "Version must be incremented when updating a page. Current Version: [N]. Provided version: [M]"`** — a clean, machine-classifiable drift signal with the version numbers parseable from the title. *(validated)*
  - **H6 (Markdown coverage):** not adapter-transport work (it is the GH-20 converter), but it is why this story writes Storage bodies.
- **The port contract is already documented.** architecture-overview §"Internal interface contracts" fixes the operation set and return/error shapes (e.g. `updatePage(req) → Page | Conflict (409 → drift)`, `putProperty(pageId, key, value) → void | Conflict | TooLarge`, `renderBody → { body, hash, warnings } | UnsupportedConstruct`, `attachmentExists(pageId, hash) → boolean | Forbidden`, `uploadAttachment(pageId, artifact) → AttachmentRef | TooLarge | Forbidden`). This story realizes that contract for the Confluence adapter.

### 2.2 Pain Points / Gaps

- **No adapter exists.** The `TargetSystem` port has no implementation — `src/infra/confluence/` holds only the GH-20 `render/` subtree. MS-0002 cannot push a single page until the client + services land; E3-S5 (drift), E3-S6 (sync engine), E4-S1/E4-S2 (attachments) are all blocked on it.
- **No port interface exists.** The `TargetSystem` port (the contract every adapter implements) is not yet defined in code. The domain/application tiers have no typed seam to call — so there is no way to mock the target in unit tests, and no place a future non-Confluence adapter would plug in (NFR-MAINT-3).
- **The 409 drift signal is unhandled.** The optimistic-concurrency 409 (the hard gate behind ADR-0006 C-5/C-6 and NFR-REL-1/REL-5/REL-10) has no parser. Without parsing `errors[0].code` + the version-laden title into a typed `Conflict`, the sync engine (E3-S6/E3-S7) cannot reclassify drift or retry correctly — the brand-defining zero-silent-overwrite promise depends on this parse.
- **The 403 permission case is unhandled.** A locked/inaccessible page (R-FEA-10) has no `Forbidden` producer, and the warn+skip (never delete+recreate) obligation (ADR-0006, INV-SAFE-1) has no enforcer. A naive adapter could treat 403 as "missing" and silently recreate the page.
- **No rate-limit / retry policy.** 429 (with `Retry-After`) and transient 5xx have no backoff. Without it, a single rate-limited run fails noisily under Confluence's limits, and a typed `RateLimited` failure on exhaustion does not exist in the union.
- **No duplicate-attachment idempotency.** Re-running a sync would re-upload identical bytes and hit the 400 "same file name" error on every run unless the adapter treats that 400 as the skip-if-exists signal (spike H4). Idempotent rerun (NFR-PERF-4) depends on this mapping.
- **No boundary validation of remote payloads.** Confluence responses are unvalidated today; without zod schemas at the boundary, a remote shape drift could silently produce malformed adapter values.
- **No provenance formatter.** The `version.message` formatter (ADR-0006/ADR-0010 provenance; NFR-REL-9) has no Confluence-specific implementation; E3-S6 has nothing to call to format the per-version provenance string.

## 3. PROBLEM STATEMENT

Because no `TargetSystem` port interface and no Confluence adapter exist, MarkSync cannot push, fetch, or reconcile a single page against Confluence Cloud — the domain and application tiers have no typed seam to call (so they cannot be unit-tested with a mock target, and a future non-Confluence adapter has nowhere to plug in), and the spike-validated behaviors that the entire safety promise rests on — the 409 optimistic-concurrency gate (ADR-0006 C-5/C-6; NFR-REL-1/REL-5/REL-10), the 403-permission warn+skip (never delete+recreate; INV-SAFE-1), the duplicate-attachment 400 idempotency signal (NFR-PERF-4), and the 429/5xx retry policy — have no parser, no producer, and no enforcer — so the sync engine (E3-S6), drift detection (E3-S5), concurrency control (E3-S7), and attachment upload (E4-S1/E4-S2) downstream have no transport layer to build on — so this story must deliver the `TargetSystem` port and its Confluence Cloud implementation once, isolating every v2/v1 distinction behind the port (NFR-MAINT-1), before any of those consumers can ship.

## 4. GOALS

- **G-1**: Deliver the domain-owned `TargetSystem` port interface — the adapter-agnostic contract (no Confluence types) every operation flows through, with `renderBody` delegating to the GH-20 `renderStorage` (F-1).
- **G-2**: Deliver the `ConfluenceClient` HTTP transport — native `fetch`, `v1`/`v2` URL builders, `authHeader` injection, redacted logging, 429 + 5xx retry; no HTTP library (F-2).
- **G-3**: Deliver the `PageService` (v2) — create/read/update/move, with the critical 409-conflict parse producing a typed `Conflict` (F-3).
- **G-4**: Deliver the `PropertyService` (v2) — read/write the `marksync.metadata` string content property (ADR-0006 cross-check) (F-4).
- **G-5**: Deliver the `AttachmentService` (v1-only) — multipart upload, the 400-duplicate idempotency signal, and `/data` update (F-5).
- **G-6**: Deliver the minimal v1-only `SearchService` + `RestrictionsService` for MS-0002 (F-6).
- **G-7**: Deliver the 403 → `Forbidden` warn+skip semantics — never delete+recreate (F-7).
- **G-8**: Deliver the `version.message` provenance formatter (F-8).
- **G-9**: Deliver the `RateLimited` + `RemoteUnreachable` error arms — two additions to the `MarkSyncError` union + `assertNeverMarkSyncError` (RateLimited is story-mandated for exhausted-429; RemoteUnreachable is PM-decided for exhausted-5xx/network, OQ-1), and zod boundary validation across all responses (F-9).

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| boundary isolation (NFR-MAINT-1) | **0** files under `src/domain/` or `src/cli/` import anything from `src/infra/confluence/`; a scratch-file negative test proves dep-cruiser (`check:boundaries`) fails on a breach; the port is the **only** seam |
| 409 parse correctness | a mocked 409 with `errors[0].code:"CONFLICT"` → `updatePage` returns `err(Conflict{ baseVersion; remoteVersion })` with **correctly parsed** version numbers (from the title) — **100%** of 409 fixtures |
| 403 warn+skip | a mocked 403 on `getPage` → `Forbidden`; the path performs **0** delete/recreate operations — the caller skips (INV-SAFE-1) |
| attachment 400-dup idempotency | uploading a duplicate filename → the adapter returns an "already exists" result (**not** an error); update-via-`/data` bumps the version on changed bytes |
| property round-trip (H2) | `putProperty` stores a string value; `getProperty` reads it back **byte-equal**; an **~8 KB** value round-trips |
| 429 backoff | a mocked 429 with `Retry-After: 1` → the client waits then retries (**max 3**); exhausted → `RateLimited` |
| no token leak (INV-SEC-1 / NFR-SEC-1) | **0** captured redacted log/request/response artifacts contain the token (grep of captured mock logs) |
| no outbound telemetry (NFR-SEC-3) | the adapter issues `fetch` **only** to the configured `baseUrl`; a test asserts **no** request targets any other host |
| 5xx retry | a mocked transient 5xx is retried (**max 3**); exhausted → a typed failure (OQ-1) |
| response validation | **100%** of Confluence responses are validated by a zod schema before crossing into a typed adapter return value |
| error-model safety | adding `RateLimited` keeps `assertNeverMarkSyncError` exhaustive — `bun run check` typecheck stays green (the never-check is the safety net) |
| quality gate | `bun run check` exits **0** |

### 4.2 Non-Goals

- **NG-1**: Plan/apply orchestration — the push flow that sequences creates/updates/moves is E3-S6 (sync engine). This story exposes the port operations; it does not call them in a plan.
- **NG-2**: Drift classification logic — the adapter **fetches** remote state via the port; the classifier (E3-S5) **compares** local/base/remote. The 409 → `Conflict` mapping happens here; the drift reclassification happens downstream.
- **NG-3**: `labels.ts` add/delete — explicitly deferred to post-MS-0002 (NFR-MAINT-2, narrow adapter surface; no MS-0002 flow uses labels). Documented deferral, not a contradiction with the feature spec (DEC-8).
- **NG-4**: Reverse conversion (Storage/ADF → Markdown) — `MS-0005+`. The port's `reverseConvert` op is out of scope here.
- **NG-5**: Data Center — `MS-0009`. Cloud only for MS-0002 (NFR-COMP-3).
- **NG-6**: OAuth / scoped-token gateway path — post-MS-0002. Classic API-token Basic auth over the direct site URL is the only path (spike H1).
- **NG-7**: Reconsidering the v2/v1 split or the Storage target — ADR-0005/ADR-0006 are settled and being **implemented**, not reopened.
- **NG-8**: Live (real-tenant) E2E — wired by E5-S1. This story's tests are unit + integration against a local mock (`Bun.serve`) per the story test matrix.
- **NG-9**: New error arms beyond `RateLimited` + `RemoteUnreachable` — every other failure path maps to an **existing** arm (`Conflict`, `Forbidden`, `TooLarge`, `RemoteMissing`). These two are the **only** additions (DEC-2).

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | `TargetSystem` port interface (domain-owned) | The contract every adapter implements — the only seam the domain/application tiers call. No Confluence types cross it; `renderBody` delegates to the GH-20 `renderStorage`. Without it, the domain has no typed target to call and no mock seam for unit tests (NFR-MAINT-1/MAINT-3). |
| F-2 | `ConfluenceClient` HTTP transport | Native-`fetch` transport isolating all v1/v2 URL construction, `authHeader` injection, redacted logging, and the retry policy. The single place retry/redaction/auth live — the rest of the adapter never touches `fetch`. |
| F-3 | `PageService` (v2) with 409-conflict parse | Page create/read/update/move via v2. Houses the brand-defining 409 parse: `errors[0].code==="CONFLICT"` + version-laden title → typed `Conflict`. The hard gate behind ADR-0006 C-5/C-6 and NFR-REL-1. |
| F-4 | `PropertyService` (v2) | Read/write the `marksync.metadata` string content property — the lock cross-check (ADR-0006). v2 only (v1 deprecated; spike H2). |
| F-5 | `AttachmentService` (v1-only) | Multipart upload, the 400-duplicate-filename **idempotency signal** (not an error; spike H4), and `/data` update. Powers idempotent rerun (NFR-PERF-4). |
| F-6 | `SearchService` + `RestrictionsService` (v1-only, minimal) | CQL search (page discovery for `doctor`/discovery) and restrictions read (supports the 403/permission-awareness story, R-FEA-10). Kept minimal for MS-0002 (NFR-MAINT-2). |
| F-7 | 403 → `Forbidden` warn+skip | A page returning 403 (locked/inaccessible) → `Forbidden`, mapped to warn+skip — **never** delete+recreate (ADR-0006, R-FEA-10, INV-SAFE-1). |
| F-8 | `version.message` provenance formatter | The Confluence-specific `version.message` formatter (ADR-0006/ADR-0010 provenance; NFR-REL-9). Consumed by E3-S6/E4-S3; lives in the adapter because it is Confluence-specific. |
| F-9 | `RateLimited` + `RemoteUnreachable` error arms + zod boundary validation | Two error-model changes: `RateLimited` (story-mandated, exhausted-429) and `RemoteUnreachable` (PM-decided OQ-1, exhausted-5xx/network), both added to `MarkSyncError` + `assertNeverMarkSyncError`. Plus zod validation of every Confluence response at the boundary (no unvalidated remote payload crosses into a typed return). |

### 5.1 Capability Details

- **F-1 (Port interface).** A domain-owned interface declaring the operation set from architecture-overview §"Internal interface contracts": `renderBody`, `getPage`, `createPage`, `updatePage` (returns `Conflict` on 409), `movePage`, `getProperty`, `putProperty`, `uploadAttachment`, `attachmentExists`, `listAttachments`, `searchPages`, `getRestrictions`. **Every** operation returns `Result<T, MarkSyncError>`. The interface defines its **own** request/response value types (e.g. page, create/update/move requests, attachment reference, artifact) — **no** Confluence-specific type (no v2 response shape, no Storage envelope) appears in the port surface; those stay adapter-internal. `renderBody` is implemented by delegating to the GH-20 `renderStorage` (the body renderer is target-specific, already delivered) so the app layer calls `target.renderBody(…)` and never imports the renderer. The port lives in the domain tier so the domain defines the contract and infrastructure implements it (dependency-direction matrix: infrastructure implements domain-owned ports).

- **F-2 (ConfluenceClient).** A transport using **native `fetch`** (no HTTP library — typescript.md; spike AGENTS.md "no HTTP library"). It exposes `v1(path)` and `v2(path)` URL builders (`${baseUrl}/wiki/rest/api${path}` and `${baseUrl}/wiki/api/v2${path}`) — the **only** place the v1/v2 distinction is encoded (NFR-MAINT-1). It injects the `authHeader` from the GH-17 `ConfluenceCredentials` (never the raw token — INV-SEC-1), sets `Content-Type: application/json` and `User-Agent: marksync/<ver>`, and routes all request/response logging through the **existing redaction layer** so no token/secret reaches any output path (NFR-SEC-1). Retry policy is centralized here: **429** → exponential backoff (1s/2s/4s + jitter), honoring `Retry-After`, max 3 retries, then `RateLimited`; **5xx** → retry max 3; **401/403 are never retried** (spike rule — 403 is a permission signal, not transient). The adapter issues `fetch` **only** to the configured `baseUrl` (NFR-SEC-3 — no outbound telemetry to any other host).

- **F-3 (PageService — v2).** Page create (`POST`, body `representation:"storage"`), read (`GET …?body-format=storage`), update (`PUT` with `version:{ number: N+1; message }`), and move (parent change) via v2 — the spike-H3-validated surface. The **critical path** is the H5 409 parse: on a `409` response, extract `errors[0].code`; when it is `"CONFLICT"`, parse the version numbers from the title (`Current Version: [N]. Provided version: [M]`) and return `err({ kind:"Conflict"; pageId; baseVersion; remoteVersion })` using the **pre-existing** `Conflict` arm. This typed `Conflict` is what E3-S6/E3-S7 reclassify as drift and retry against. A well-formed update (sent `N+1`) returns the updated `Page`.

- **F-4 (PropertyService — v2).** Read (`GET …/properties`, `GET …/property/{key}`) and write (`POST`) the `marksync.metadata` content property as a **string** value (spike H2 proved v2 accepts string values; ~8.4 KB accepted; v1 deprecated). This property mirrors the lock's key fields as the ADR-0006 cross-check. A 409 on key-conflict (v1+v2 share one namespace) is handled. The wire value is a string; serialization of the lock fields into that string is the consumer's (E3-S6) concern — this service stores and returns the string byte-for-byte.

- **F-5 (AttachmentService — v1-only).** Multipart upload to `POST …/content/{id}/child/attachment` with `X-Atlassian-Token: no-check` and `minorEdit:true` (spike H4 — attachments are **v1-only**, not in v2). Files are **hash-named** (`marksync-mermaid-<hash>.svg`, `marksync-asset-<hash>.<ext>`) so dedup keys on the filename. The create endpoint's **400 `"Cannot add a new attachment with the same file name"`** is the **skip-if-exists idempotency signal** — the adapter maps it to an "already exists" result, **not** an error (DEC-3), so idempotent rerun performs 0 writes (NFR-PERF-4). Update goes via `/child/attachment/{attId}/data` (version bump) when bytes changed. `attachmentExists(pageId, hash)` resolves existence by the hash-derived filename; `listAttachments(pageId)` enumerates them.

- **F-6 (Search + Restrictions — v1-only).** `searchPages(cql)` runs a CQL search for page discovery (used by `doctor`/discovery). `getRestrictions(pageId)` reads page restrictions, supporting the 403/permission-awareness story (R-FEA-10). Both are kept **minimal** for MS-0002 (NFR-MAINT-2) — only what MS-0002 flows consume.

- **F-7 (403 → Forbidden warn+skip).** A page that returns 403 (locked/inaccessible) → `err({ kind:"Forbidden"; pageId; operation })` using the **pre-existing** `Forbidden` arm. The recovery semantics are **warn+skip** — the caller (E3-S6) skips the page and never deletes/recreates it (ADR-0006, R-FEA-10, INV-SAFE-1, CEO-resolved R2). Distinguishing deleted vs inaccessible assumes the operator has space-owner read access (blueprint §0, architecture UNCERT-4); a 403 is therefore treated as inaccessible, not missing.

- **F-8 (Provenance formatter).** The `version.message` formatter produces the per-version provenance string (clear MarkSync/Git prefix, head commit id, compact included-commit summary, deterministic trimming to the verified Confluence length limit from spike E1-S2 / ADR-0010). It is **Confluence-specific**, so it lives in the adapter; E3-S6/E4-S3 consume it. It produces the string; the `PageService` (F-3) sets it on `version.message` during update.

- **F-9 (RateLimited + RemoteUnreachable arms; zod boundary validation).** Three coupled deliverables:
  - The **`RateLimited`** arm is **added** to `MarkSyncError` + `assertNeverMarkSyncError` — produced on exhausted-429 backoff. Shape: `{ kind: "RateLimited"; retryAfterMs?: number }` (OQ-2 resolution).
  - The **`RemoteUnreachable`** arm is **added** to `MarkSyncError` + `assertNeverMarkSyncError` — produced on exhausted-5xx backoff or network failure. Shape: `{ kind: "RemoteUnreachable"; status?: number; cause: string }` (OQ-1 resolution). The recovery action differs from `RateLimited` (server-down/alert-operator vs. wait-and-retry), warranting a distinct kind per the codebase's "add a kind only when the recovery action differs" principle.
  - Because `assertNeverMarkSyncError` switches over every kind, adding both arms keeps the exhaustiveness proof intact — a missed `case` fails typecheck (the never-check is the safety net, RSK-6).
  - **zod boundary validation**: every Confluence response is validated by a zod schema at the boundary **before** it crosses into a typed adapter return value (typescript.md zod-first for code-owned schemas). No unvalidated remote payload reaches a port return. A schema-validation failure is a typed failure (its arm is a plan-time detail — see OQ-1 for the related exhausted/transport failure question).

## 6. USER & SYSTEM FLOWS

```
Flow 1 — Successful page update (the happy path):
  app (E3-S6) calls target.updatePage({ pageId, body, baseVersion, message })
    → PageService issues PUT /wiki/api/v2/pages/{id}  (version.number = baseVersion+1)
    → ConfluenceClient: v2(path), inject authHeader, fetch
    → 200 (zod-validated) → ok(Page)

Flow 2 — Optimistic-concurrency conflict (ADR-0006 C-5/C-6; the drift gate):
  a stale update (baseVersion behind the real version) → Confluence 409
    → PageService parses errors[0].code === "CONFLICT" + the version-laden title
    → err(Conflict{ pageId; baseVersion; remoteVersion })
    → E3-S6/E3-S7 reclassify as drift / refresh+retry. (Never: silent overwrite.)

Flow 3 — Rate limit (429 → backoff → success, or → RateLimited):
  Confluence 429 with Retry-After
    → ConfluenceClient backs off (1s/2s/4s + jitter), honoring Retry-After, max 3
    → on eventual 200 → ok(...)
    → on exhaustion → err(RateLimited)  (F-9 — the new arm)

Flow 4 — Permission asymmetry (403 → warn+skip, never delete+recreate):
  getPage / updatePage on a locked/inaccessible page → 403
    → err(Forbidden{ pageId; operation })
    → E3-S6 warns + skips the page. (Never: treat 403 as "missing" and recreate — INV-SAFE-1.)

Flow 5 — Idempotent attachment (400-dup = skip signal; spike H4):
  re-upload identical bytes (same hash-derived filename) → 400 "same file name"
    → AttachmentService maps it to an "already exists" result (NOT an error)
    → idempotent rerun performs 0 writes (NFR-PERF-4).
  changed bytes → POST /child/attachment/{attId}/data → version bump.

Flow 6 — Content property cross-check (ADR-0006):
  after a successful body update, E3-S6 calls target.putProperty(pageId, "marksync.metadata", <string>)
    → PropertyService (v2) stores the string value; getProperty reads it back byte-equal.

Flow 7 — Boundary enforcement (NFR-MAINT-1):
  any module under src/domain/ or src/cli/ attempts to import from src/infra/confluence/
    → dep-cruiser (check:boundaries) fails the build at severity error.
  The port (F-1) is the only permitted seam; the scratch-file negative test proves the rule fires.
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- The `TargetSystem` port interface (domain-owned; no Confluence types) and its request/response value types (F-1).
- `ConfluenceClient` HTTP transport — native `fetch`, v1/v2 URL builders, `authHeader` injection, redacted logging, 429 + 5xx retry (F-2).
- `PageService` (v2) — create/read/update/move + the 409-conflict parse (F-3).
- `PropertyService` (v2) — `marksync.metadata` string read/write (F-4).
- `AttachmentService` (v1-only) — multipart upload, 400-dup idempotency, `/data` update, `attachmentExists`, `listAttachments` (F-5).
- `SearchService` + `RestrictionsService` (v1-only, minimal) (F-6).
- 403 → `Forbidden` warn+skip semantics (F-7).
- `version.message` provenance formatter (F-8).
- The `RateLimited` arm addition to `MarkSyncError` + `assertNeverMarkSyncError` (F-9).
- zod schemas validating every Confluence response at the boundary (F-9).
- The boundary negative test proving the port is the only seam (AC-F1-1).

### 7.2 Out of Scope

- [OUT] Plan/apply orchestration — E3-S6 (NG-1).
- [OUT] Drift classification logic — E3-S5; the adapter fetches remote, the classifier compares (NG-2).
- [OUT] `labels.ts` add/delete — deferred to post-MS-0002 (NG-3, DEC-8).
- [OUT] Reverse conversion (Storage/ADF → Markdown) — MS-0005+ (NG-4).
- [OUT] Data Center — MS-0009 (NG-5).
- [OUT] OAuth / scoped-token gateway path — post-MS-0002 (NG-6).
- [OUT] Reconsidering the v2/v1 split or the Storage target — ADR-0005/ADR-0006 settled (NG-7).
- [OUT] Live (real-tenant) E2E — wired by E5-S1 (NG-8); this story tests against a local mock.
- [OUT] New error arms beyond `RateLimited` + `RemoteUnreachable` — every other failure maps to an existing arm (NG-9, DEC-2).

### 7.3 Deferred / Maybe-Later

- **`labels.ts` add/delete** — explicitly deferred (NFR-MAINT-2, DEC-8); no MS-0002 flow uses labels.
- **OAuth / scoped-token gateway path** — deferred; classic API-token Basic over the direct site URL is the MS-0002 path (spike H1).
- **Reverse conversion** — `MS-0005+`; the port's `reverseConvert` op is reserved but unimplemented.
- **Exhausted-5xx typed failure arm** — the 429 path is fully specified (`RateLimited`); the exhausted-5xx mapping is an open question (OQ-1) and may, if it needs a distinct recovery action, add an arm in a follow-up.
- **Richer search/restrictions surface** — only the minimal MS-0002 operations land here; expansion follows `doctor`/MS-0003 needs.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

The adapter is a **client** of the Atlassian Confluence Cloud REST API — it consumes (does not define) these endpoints. All requests carry the injected `authHeader`, `Content-Type: application/json` (except multipart), and `User-Agent: marksync/<ver>`; all responses are zod-validated at the boundary.

| Surface | Endpoint (spike-validated) | Notes |
|---|---|---|
| Page create | `POST /wiki/api/v2/pages` (body `representation:"storage"`) | v2 (H3) |
| Page read | `GET /wiki/api/v2/pages/{id}?body-format=storage` | v2 (H3) |
| Page update | `PUT /wiki/api/v2/pages/{id}` (`version.number = N+1`) | v2; **409 CONFLICT** parsed here (H5) |
| Page move | v2 parent change | v2 |
| Content property list/get | `GET /wiki/api/v2/pages/{id}/properties`, `GET /wiki/api/v2/pages/{id}/property/{key}` | v2 only — v1 deprecated (H2) |
| Content property create | `POST /wiki/api/v2/pages/{id}/properties` | v2; `marksync.metadata` as string value (H2) |
| Attachment upload | `POST /wiki/rest/api/content/{id}/child/attachment` (multipart, `X-Atlassian-Token: no-check`, `minorEdit:true`) | **v1-only**; 400-dup = idempotency signal (H4) |
| Attachment update | `POST /wiki/rest/api/content/{id}/child/attachment/{attId}/data` | v1-only; version bump (H4) |
| Attachment list | `GET /wiki/rest/api/content/{id}/child/attachment` | v1-only |
| Search | CQL search (v1) | v1-only; `searchPages(cql)` |
| Restrictions | `GET …/content/{id}/restriction` (v1) | v1-only; `getRestrictions(pageId)` |
| Auth validation (reused) | `GET /wiki/api/v2/user/by-me` | already used by GH-17 `validateCredentials` (H1) |

### 8.2 Events / Messages

No events. The conceptual signals (`Conflict`, `Forbidden`, `RateLimited`, "attachment already exists") are realized as `Result<T, MarkSyncError>` values consumed by E3-S6 (plan/apply) and E3-S7 (concurrency). No event bus in MS-0002.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `TargetSystem` port interface (NEW, domain) | The adapter-agnostic contract every adapter implements — operation set from architecture-overview §"Internal interface contracts". No Confluence types in its surface. |
| DM-2 | Port value types (NEW, domain) | The port's own request/response value types: page, create/update/move requests, attachment reference, artifact. Adapter-agnostic; defined in the port module. |
| DM-3 | `RateLimited` + `RemoteUnreachable` error arms (NEW; the only error-model changes) | Added to `MarkSyncError` (`src/domain/errors.ts`) and `assertNeverMarkSyncError`. `RateLimited` produced on exhausted-429 backoff (shape: `{ retryAfterMs?: number }`, OQ-2); `RemoteUnreachable` produced on exhausted-5xx/network failure (shape: `{ status?: number; cause: string }`, OQ-1). Every other adapter failure reuses an **existing** arm (`Conflict`/`Forbidden`/`TooLarge`/`RemoteMissing`). |
| DM-4 | Confluence 409 conflict envelope (adapter-internal) | `{ errors: [{ code: "CONFLICT"; title }] }` with version-laden title — validated by zod at the boundary, parsed into the typed `Conflict`, **never** crosses the port. |
| DM-5 | `marksync.metadata` content property value | A string value stored via v2 content properties; ~8 KB accepted (spike H2). The ADR-0006 lock cross-check; round-trips byte-for-byte. |

### 8.4 External Integrations

- **Atlassian Confluence Cloud REST API** — the sole external integration. v2 for pages + content properties; v1-only for attachments/search/restrictions. Classic API-token Basic auth over the direct site URL (spike H1; scoped-token/gateway deferred — NG-6). Every operation this story implements was spike-validated (H1–H5). The adapter must issue `fetch` **only** to the configured `baseUrl` (NFR-SEC-3 — no outbound telemetry to any other host).
- **No new runtime dependencies** — native `fetch`, `URL`, `FormData`/`Blob`, `crypto` are runtime built-ins; **no HTTP library** (typescript.md; spike AGENTS.md). `zod` is installed in Phase 0 of this story (it was not yet a project dependency — GH-15 used `ajv`; typescript.md schedules zod for the first consuming story, which is this one).
- **Reused seams**: the GH-17 `ConfluenceCredentials` (`authHeader` injected, never the raw token); the GH-16 redaction layer (request/response logging routed through it); the GH-20 `renderStorage` (the `renderBody` port op delegates to it).

### 8.5 Backward Compatibility

N/A for released artifacts (MS-0002 is pre-release). This story adds net-new modules and **two** additive, type-checked error-union changes (`RateLimited`, `RemoteUnreachable`): because `assertNeverMarkSyncError` switches over every kind, the additions are verified at typecheck time — the never-check fails to compile if a new `case` is missing, so every exhaustive handler site is surfaced for update. No existing public API signature changes; the four reused arms (`Conflict`/`Forbidden`/`TooLarge`/`RemoteMissing`) are unchanged. The PM-doc risks (tagging the adapter component delivered in `feature-confluence-adapter.md`/architecture-overview/UL; recording the `RateLimited` + `RemoteUnreachable` arms in `errors.ts` provenance; moving the adapter from "planned" to "delivered") are handled in phase 7 (`@doc-syncer`), not here.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | boundary isolation (NFR-MAINT-1) | **0** files under `src/domain/` or `src/cli/` import anything from `src/infra/confluence/`; dep-cruiser (`check:boundaries`) fails on a breach (negative test); the port is the only seam |
| NFR-2 | 409 parse correctness | a mocked 409 with `errors[0].code:"CONFLICT"` → `err(Conflict{ baseVersion; remoteVersion })` with correctly parsed version numbers — **100%** of 409 fixtures |
| NFR-3 | 403 warn+skip (NFR-REL-1 / INV-SAFE-1) | a mocked 403 → `Forbidden`; the path performs **0** delete/recreate operations |
| NFR-4 | attachment 400-dup idempotency (NFR-PERF-4) | duplicate filename → "already exists" result (**not** an error); idempotent rerun performs 0 writes; `/data` update bumps version on changed bytes |
| NFR-5 | property round-trip (H2) | `putProperty` string → `getProperty` byte-equal; ~8 KB value round-trips |
| NFR-6 | 429 backoff | mocked 429 + `Retry-After` → wait then retry (**max 3**); exhausted → `RateLimited` |
| NFR-7 | no token leak (NFR-SEC-1 / INV-SEC-1) | **0** captured redacted log/request/response artifacts contain the token |
| NFR-8 | no outbound telemetry (NFR-SEC-3) | the adapter issues `fetch` **only** to the configured `baseUrl`; a test asserts no request targets any other host |
| NFR-9 | 5xx retry | a mocked transient 5xx is retried (**max 3**); exhausted → a typed failure (OQ-1) |
| NFR-10 | response validation | **100%** of Confluence responses are zod-validated before crossing into a typed adapter return value |
| NFR-11 | HTTP via native fetch only | **no** HTTP library; native `fetch`/`URL`/`FormData`/`Blob` only (typescript.md) |
| NFR-12 | retry-policy correctness | **401/403 are never retried** (spike rule); 429 honors `Retry-After`; backoff = 1s/2s/4s + jitter |
| NFR-13 | error-model safety | adding `RateLimited` keeps `assertNeverMarkSyncError` exhaustive; `bun run check` typecheck stays green |
| NFR-14 | quality gate | `bun run check` exits **0** |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No product telemetry. Per NFR-SEC-3, the adapter issues **no** outbound analytics — only request/response traffic to the configured `baseUrl`. Request/response logging is **redacted** through the existing GH-16 redaction layer (NFR-SEC-1/INV-SEC-1): no `Authorization`/`authHeader`/token/email reaches any output path; logs carry structural identifiers (operation, status, endpoint family, durations) and redacted bodies. Adapter failures (`Conflict`/`Forbidden`/`RateLimited`/"attachment already exists") surface at the E3-S6 boundary through the established `CommandResult` contract as stable `error.code` values mapped to exit classes. The `RateLimited` and `Forbidden` kinds are new producer sites and must be mapped consistently with the existing exit-code scheme (a doc-sync/plan detail, not a spec decision).

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Brand-defining: the 409 is misparsed (wrong version numbers, or missed entirely) → the drift gate fails → a stale write silently overwrites a remote edit (NFR-REL-1/REL-5/REL-10; ADR-0006 C-5/C-6) | H | M | F-3 parses `errors[0].code==="CONFLICT"` + the version-laden title; zod validates the 409 envelope at the boundary; AC-F3-1 asserts correct version-number extraction across 409 fixtures; 401/403 are never retried so a permission gap cannot mask a conflict. | L |
| RSK-2 | A 403 is misclassified as "missing" and the page is silently recreated (INV-SAFE-1; R-FEA-10) | H | M | F-7 maps 403 → `Forbidden` warn+skip, **never** delete+recreate; AC-F7-1 asserts 0 delete/recreate operations on a 403; assumes operator has space-owner read access (CEO-resolved R2). | L |
| RSK-3 | The auth header / token leaks into a log, plan, or diagnostic (NFR-SEC-1/INV-SEC-1) | H | M | All request/response logging routes through the existing redaction layer; AC-F2-2 greps captured mock logs for the token (0 expected); `ConfluenceCredentials` carries the opaque `authHeader` and masked email only — the adapter never sees the raw token. | L |
| RSK-4 | Outbound telemetry regression — a request targets a host other than the configured `baseUrl` (NFR-SEC-3; privacy) | M | L | F-2 centralizes `fetch` in `ConfluenceClient` with `v1`/`v2` URL builders rooted at `baseUrl`; AC-F2-3 asserts no request targets any other host. | L |
| RSK-5 | A boundary violation sneaks in (domain or cli imports the Confluence adapter) (NFR-MAINT-1) | M | L | dep-cruiser (`check:boundaries`) enforces `domain→infra` and `cli→infra` at severity `error`; AC-F1-1 includes a scratch-file negative test proving the rule fires. | L |
| RSK-6 | Adding the `RateLimited` arm silently breaks exhaustiveness (an exhaustive handler site is missed) | M | L | `assertNeverMarkSyncError` switches over every kind — a missed `case` makes the `default` arm's `error` non-`never` and the file fails typecheck; AC-Q-1 (`bun run check`) is the gate. | L |
| RSK-7 | Confluence API drift/deprecation invalidates a spike-validated endpoint shape (CEO-resolved R1) | M | M | zod validates every response at the boundary (a shape drift surfaces as a typed failure, not a silent misparse); nightly live-smoke (E5-S1) + weekly deprecation-feed catch drift early; ADR-0005 revisit trigger remains armed. Not blocking MS-0002. | M |
| RSK-8 | Exhausted-5xx backoff has no defined error arm → undefined caller behavior (429→`RateLimited` is specified; 5xx-exhausted is not) | M | M | F-2 retries 5xx max 3; the mapping on exhaustion is captured as OQ-1 (may need a distinct arm — consult `@decision-advisor`). Until resolved, the plan must not ship an undefined 5xx-exhausted path. | M |

## 12. ASSUMPTIONS

- ADR-0006 (state model) and ADR-0005 (Storage target) are settled (`Accepted`) and being **implemented**, not reconsidered (NG-7). ADR-0006's 409 gate, content-property cross-check, and 403→warn+skip obligation are adapter responsibilities discharged here.
- The spike (MS-0001) H1–H5 findings are authoritative for the endpoint shapes, the 409 body, the 400-dup behavior, the ~8 KB property size, and the auth path. They are cited, not re-derived.
- The GH-17 `ConfluenceCredentials { baseUrl; authHeader; email; mode }` is the injected auth seam; the adapter receives `authHeader` and never the raw token (INV-SEC-1).
- The GH-20 `renderStorage(hast, opts) → { body; hash; warnings }` is the body renderer the port's `renderBody` delegates to; this story performs no body conversion.
- The existing redaction layer (GH-16 output service) is available to route request/response logging through; the AC (no token in logs) is testable regardless of the exact wiring.
- `zod` is installed in Phase 0 of this story (GH-15 used `ajv`; typescript.md schedules zod for the first consuming story = this one).
- dependency-cruiser already enforces the boundary; the negative test proves, not adds, the rule.
- The operator has space-owner read access, so a 403 is treated as inaccessible (not missing) — CEO-resolved R2 (architecture UNCERT-4).
- Downstream consumers (E3-S5, E3-S6, E3-S7, E4-S1, E4-S2, E5-S1) are blocked on this story and will adopt the port + the `Conflict`/`Forbidden`/`RateLimited`/"already-exists" signals + the provenance formatter as specified here.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | MS2-E2-S4 (GH-17 auth provider) | `ConfluenceCredentials` — the `authHeader` the client injects. Merged. |
| Depends on | MS2-E3-S3 (GH-20 markdown pipeline) | `renderStorage` — the `renderBody` port op delegates to it. Merged. |
| Depends on | ADR-0006 | Load-bearing: 409 optimistic-concurrency gate; content-property cross-check; 403→warn+skip; INV-SAFE-1. |
| Depends on | ADR-0005 | Storage (not ADF) write target; v2 page API accepts `representation:"storage"`. |
| Depends on | Spike H1–H5 | Endpoint shapes, 409 body, 400-dup signal, ~8 KB property size, auth path. |
| Depends on | `Result<T,E>` / `MarkSyncError` (GH-14/GH-15) | The error channel + the reused arms (`Conflict`/`Forbidden`/`TooLarge`/`RemoteMissing`). `RateLimited` is **added** here. |
| Depends on | typescript.md / testing-strategy.md | Tier rules, no-HTTP-library rule, zod-first, snapshot/error-handling conventions. |
| Reuses | GH-16 redaction layer | Request/response logging routed through it (NFR-SEC-1). |
| Installs | `zod` | Boundary response validation (installed Phase 0; GH-15 used ajv, typescript.md schedules zod for first consuming story = this one). |
| Blocks | MS2-E3-S5 (drift) | Fetches remote via the port; consumes the typed `Conflict`. |
| Blocks | MS2-E3-S6 (sync engine) | Applies via the port; consumes `Conflict`/`Forbidden`/`RateLimited`/"already-exists" + the provenance formatter. |
| Blocks | MS2-E3-S7 (concurrency) | Concurrency via the 409 → `Conflict` path. |
| Blocks | MS2-E4-S1 / MS2-E4-S2 (mermaid/attachments) | Upload + dedup via the port's attachment operations. |
| Blocks | MS2-E5-S1 (live smoke) | Wires the adapter against a real tenant. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | On **exhausted-5xx** backoff (after max 3 retries), which `MarkSyncError` arm does the adapter return? | The story specifies 429-exhausted → `RateLimited` (F-9), but the 5xx-exhausted mapping was unspecified. The union had no generic transport/remote-unreachable arm (the `Auth` arm's `AuthUnreachable` is auth-specific). | **RESOLVED (PM-decided 2026-07-09):** Add a new `RemoteUnreachable { kind: "RemoteUnreachable"; status?: number; cause: string }` arm alongside `RateLimited`. Rationale: a 5xx-exhausted/network failure has a **different recovery action** than `RateLimited` (server-down/alert-operator vs. wait-and-retry), and the codebase's own principle ("add a kind only when the recovery action differs") + the `AuthUnreachable` precedent settle it. Both arms are additive and exhaustiveness-checked via `assertNeverMarkSyncError`. `status` carries the HTTP status (for 5xx); `cause` carries a non-secret network/transport description. This is the **second** (and last) error-model change in this story. If the DoR reviewer or user prefers a formal TDR, one can be written post-delivery. |
| OQ-2 | What is the exact field shape of the new `RateLimited` arm? | The story mandates the arm exists (F-9/DEC-2) but did not specify its fields. | **RESOLVED (PM-decided 2026-07-09):** `{ kind: "RateLimited"; retryAfterMs?: number }` — minimal shape carrying the last observed `Retry-After` (if present), for the caller's retry decision. No secret material. |

> No other question requires escalation: ADR-0005/ADR-0006 are settled, the spike gives the exact endpoint/409/400-dup facts, the boundary rule already exists, and the CEO-resolved risks (R1 API drift → nightly smoke; R2 permission asymmetry → warn+skip + read-access assumption) are recorded. OQ-1 and OQ-2 are resolved (PM-decided) — two additive error arms (`RateLimited`, `RemoteUnreachable`) extend `MarkSyncError`; both are exhaustiveness-checked via `assertNeverMarkSyncError`.

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | **The `TargetSystem` port lives in the domain tier (`src/domain/target/`); no Confluence type appears in its surface; the Confluence adapter (`src/infra/confluence/`) implements it.** | Matches architecture-overview §"Module-residence rules" + the dependency-direction matrix (domain defines ports; infrastructure implements them) and the story file Goal ("behind a clean boundary the domain never sees"). The port defines its own adapter-agnostic request/response value types; Confluence-specific shapes (v2 response envelopes, the 409 body) stay adapter-internal and zod-validated at the boundary. This is the seam a future non-Confluence adapter plugs into (NFR-MAINT-3). | 2026-07-09 |
| DEC-2 | **Add `RateLimited` (exhausted-429) and `RemoteUnreachable` (exhausted-5xx/network) as two new `MarkSyncError` arms (+ `assertNeverMarkSyncError` cases); reuse `Conflict`/`Forbidden`/`TooLarge`/`RemoteMissing` for every other adapter failure.** | Story-mandated `RateLimited` (exhausted-429 needs a typed failure). `RemoteUnreachable` added (PM-decided OQ-1) because exhausted-5xx/network failure has a **different recovery action** (server-down/alert-operator vs. wait-and-retry) — the codebase's own principle ("add a kind only when the recovery action differs") and the `AuthUnreachable` precedent settle it. `assertNeverMarkSyncError` is the safety net — a missed `case` fails typecheck (RSK-6 residual low). Every other adapter failure already has a kind with the matching recovery action, so no further arms are warranted. Field shapes: `RateLimited { retryAfterMs?: number }` (OQ-2); `RemoteUnreachable { status?: number; cause: string }` (OQ-1). | 2026-07-09 |
| DEC-3 | **The attachment 400 `"Cannot add a new attachment with the same file name"` is the skip-if-exists / idempotency signal — mapped to an "already exists" result, NOT an error.** (Spike H4.) | Spike H4 proved the create endpoint rejects a duplicate filename with this exact 400. Treating it as the idempotency signal makes rerun perform 0 writes (NFR-PERF-4); treating it as an error would make every rerun fail. Update-via-`/data` handles genuinely-changed bytes. | 2026-07-09 |
| DEC-4 | **403 → `Forbidden` warn+skip — NEVER delete+recreate.** (ADR-0006, R-FEA-10, INV-SAFE-1; CEO-resolved R2.) | A 403 means locked/inaccessible, not missing. Deleting+recreating would violate the zero-silent-overwrite promise and could clobber a page the operator cannot see. Warn+skip preserves safety; `doctor` (E5-S2) later surfaces visibility gaps. Assumes operator has space-owner read access (architecture UNCERT-4). | 2026-07-09 |
| DEC-5 | **The port's `renderBody` op delegates to the GH-20 `renderStorage`; this story performs no body conversion.** | The body renderer is target-specific (it emits Confluence Storage macros) and was already delivered in GH-20. Delegating keeps the app layer calling `target.renderBody(…)` with no direct renderer import (story file Background), satisfying the `blocked_by` E3-S3 dependency. | 2026-07-09 |
| DEC-6 | **All HTTP via native `fetch`; `URL`/`FormData`/`Blob`/`crypto` built-ins; NO HTTP library.** | typescript.md dependency rules + the spike AGENTS.md ("`fetch`, `URL`, `FormData`, `Blob`, `crypto` are built into the runtime; no HTTP library"). Native fetch is sufficient and avoids a runtime dep. | 2026-07-09 |
| DEC-7 | **zod validates every Confluence response at the boundary; no unvalidated remote payload crosses into a typed return value.** | typescript.md zod-first for code-owned schemas. A response schema drift surfaces as a typed failure rather than a silent misparse (defense for RSK-7). | 2026-07-09 |
| DEC-8 | **`labels.ts` add/delete is deferred to post-MS-0002 (NFR-MAINT-2).** | The story file explicitly defers labels — no MS-0002 flow uses them. This is a documented deferral reconciling the feature spec (which lists labels as a capability) with the MS-0002 narrow-surface decision (pm-notes cross-check). | 2026-07-09 |
| DEC-9 | **CLI/exit-code mappings for the new `RateLimited` + `RemoteUnreachable` arms must NOT interpolate `cause` or `retryAfterMs` into user-facing messages — these fields carry transport detail that could leak through; messages use the `kind` + a fixed human string only.** | NFR-SEC-1 / INV-SEC-1 / RSK-3. The `RemoteUnreachable.cause` and `RateLimited.retryAfterMs` fields are operational detail; the established redaction discipline forbids interpolating raw error payloads into messages. This is the rule the plan + test-plan cite as "the no-secret-in-message rule" (previously mislabeled DEC-5 in those artifacts; DEC-5 is the renderBody delegation). | 2026-07-10 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| `TargetSystem` port interface (`src/domain/target/`) | New — adapter-agnostic contract; no Confluence types |
| Port value types (page, create/update/move requests, attachment ref, artifact) | New — domain-owned, adapter-agnostic |
| `MarkSyncError` union + `assertNeverMarkSyncError` (`src/domain/errors.ts`) | Updated — `RateLimited` + `RemoteUnreachable` arms added (the only error-model changes) |
| `ConfluenceClient` (`src/infra/confluence/client.ts`) | New — HTTP transport, v1/v2 URL builders, retry, redaction |
| `PageService` (`src/infra/confluence/pages.ts`) | New — v2 CRUD + move + 409 parse |
| `PropertyService` (`src/infra/confluence/properties.ts`) | New — v2 content properties |
| `AttachmentService` (`src/infra/confluence/attachments.ts`) | New — v1 multipart, 400-dup idempotency, `/data` update |
| `SearchService` / `RestrictionsService` (`src/infra/confluence/`) | New — v1-only, minimal |
| Provenance formatter (`src/infra/confluence/provenance.ts`) | New — `version.message` formatter |
| Boundary zod schemas | New — validate every Confluence response |
| `ConfluenceCredentials` (GH-17), `renderStorage` (GH-20), redaction layer (GH-16) | **Unchanged** — reused |

## 17. ACCEPTANCE CRITERIA

> Each AC maps 1:1 to the story file's acceptance criteria, which constitute the Definition of Done.

| ID | Criterion | Linked | Story AC |
|----|-----------|--------|----------|
| AC-F1-1 | **Given** the change is complete, **when** a scratch file under `src/domain/` (or `src/cli/`) imports anything from `src/infra/confluence/`, **then** dep-cruiser (`check:boundaries`) **fails**; and **given** the production source, **then** **0** files under `src/domain/` or `src/cli/` import from `src/infra/confluence/` — the port is the only seam. | F-1, NFR-1 | AC1 (NFR-MAINT-1) |
| AC-F3-1 | **Given** a mocked 409 response with `errors[0].code:"CONFLICT"` and a version-laden title, **when** `updatePage` is called, **then** it returns `err({ kind:"Conflict"; pageId; baseVersion; remoteVersion })` with the version numbers **correctly parsed** from the title. | F-3, NFR-2 | AC2 (H5) |
| AC-F7-1 | **Given** a mocked 403 on `getPage`, **when** the adapter handles it, **then** it returns `Forbidden`; and the path performs **0** delete/recreate operations (warn+skip — INV-SAFE-1). | F-7, NFR-3 | AC3 (403 warn+skip) |
| AC-F5-1 | **Given** an upload of a duplicate filename, **when** the create endpoint returns 400 `"Cannot add a new attachment with the same file name"`, **then** the adapter returns an "already exists" result (**not** an error); and **given** changed bytes, **then** update-via-`/data` bumps the attachment version. | F-5, NFR-4 | AC4 (H4) |
| AC-F4-1 | **Given** a string value, **when** `putProperty` stores it and `getProperty` reads it back, **then** the values are **byte-equal**; and an **~8 KB** value round-trips successfully. | F-4, NFR-5 | AC5 (H2) |
| AC-F2-1 | **Given** a mocked 429 with `Retry-After: 1`, **when** the client handles it, **then** it waits then retries (**max 3**); and on exhaustion it returns `err({ kind:"RateLimited" })` (the new arm). | F-2, F-9, NFR-6 | AC6 (429 backoff) |
| AC-F2-2 | **Given** captured redacted request/response logs from the mock test run, **when** they are grepped for the token, **then** **0** artifacts contain the token (NFR-SEC-1/INV-SEC-1). | F-2, NFR-7 | AC7 (INV-SEC-1) |
| AC-F2-3 | **Given** the adapter under test, **when** it issues `fetch` calls, **then** **every** request targets the configured `baseUrl` — **0** requests target any other host (NFR-SEC-3, local-first privacy). | F-2, NFR-8 | AC8 (NFR-SEC-3) |
| AC-Q-1 | **Given** the change is complete, **when** `bun run check` (lint + format:check + typecheck + test + check:boundaries) runs, **then** it exits **0** — including the typecheck that proves the `RateLimited` arm keeps `assertNeverMarkSyncError` exhaustive. | F-9, NFR-1, NFR-10, NFR-13, NFR-14 | AC9 (`bun run check` green) |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Single PR to `main`** on branch `feat/GH-21/confluence-adapter`. Depends on GH-17 (auth) + GH-20 (markdown pipeline), both merged. Reuses `Result`/`MarkSyncError` with **two** additive arms (`RateLimited`, `RemoteUnreachable`). Blocks E3-S5, E3-S6, E3-S7, E4-S1, E4-S2, E5-S1.
- **Merge strategy:** Conventional Commits (TDR-0008); scope `feat(adapter)` or `feat(confluence)` is appropriate; the two error-arm additions may warrant a separate `feat(domain)` commit to isolate the error-model change for review.
- **Ordering within the story (suggested):** (1) add the `RateLimited` arm + `assertNeverMarkSyncError` case (typecheck green first — the safety net); (2) land the `TargetSystem` port interface + its adapter-agnostic value types + the boundary negative test; (3) land `ConfluenceClient` (URL builders, auth injection, redaction, 429/5xx retry) with mock-`fetch` unit tests; (4) land `PageService` (v2) + the 409 parse; (5) land `PropertyService` (v2) + `AttachmentService` (v1, 400-dup mapping); (6) land `Search`/`Restrictions` (v1, minimal) + the provenance formatter; (7) land the integration tests against a `Bun.serve` mock covering the 200/409/403/400/429 paths. Each step is independently testable.
- **After merge:** E3-S6 wires apply via the port; E3-S5 fetches remote via the port; E3-S7 drives concurrency through `Conflict`; E4-S1/E4-S2 upload/dedup via the port; E5-S1 wires the live-tenant smoke.
- **Phase 7 doc-sync (`@doc-syncer`):** tag the adapter component delivered in `feature-confluence-adapter.md` §4.2 + `architecture-overview.md` (Confluence client/attachment/property/provenance components; `related_changes` += GH-21); record the `RateLimited` arm provenance in `src/domain/errors.ts`; bind the `TargetSystem` port + adapter VOs in `ubiquitous-language.md` (`related_changes` += GH-21); reconcile any contract drift (e.g. `getPage(id, repr)` arity) between architecture-overview §"Internal interface contracts" and the implemented port; populate ADR-0006 "Lessons Learned (Retrospective)".

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — MS-0002 is greenfield. No existing adapter, port, or remote state to migrate. The first push (E3-S6) is the first time the adapter carries a request; the `marksync.metadata` property is written on demand. No lock/property migration is performed by this story (the lock landed in GH-19; the property is a cross-check, not a migration target).

## 20. PRIVACY / COMPLIANCE REVIEW

- **NFR-SEC-3 (no outbound telemetry)** is a load-bearing privacy NFR: the adapter issues `fetch` **only** to the configured `baseUrl` — no analytics, no remote rendering, no third-party calls (AC-F2-3). This realizes the local-first / no-hosted-backend principle (NFR-PRIV-1).
- **NFR-SEC-1 / INV-SEC-1 (no secrets in any output)**: the `authHeader` is injected into requests but never serialized to any output path; request/response logging is redacted (AC-F2-2). The adapter receives the opaque `authHeader` and masked email only — never the raw token (GH-17 `ConfluenceCredentials`).
- The adapter processes document content (page bodies, attachment bytes, the `marksync.metadata` string) destined for the operator's own Confluence tenant — no PII leaves the configured target.

## 21. SECURITY REVIEW HIGHLIGHTS

- **No token leak is the primary security property** (NFR-SEC-1/INV-SEC-1). The `authHeader` is injected by the client and never logged unredacted; all request/response logging routes through the existing redaction layer; the adapter never sees the raw token (it consumes `ConfluenceCredentials.authHeader`). AC-F2-2 greps captured mock logs for the token (0 expected) — RSK-3.
- **No outbound telemetry** (NFR-SEC-3) — the client's `v1`/`v2` URL builders are rooted at the configured `baseUrl`; AC-F2-3 asserts no request targets another host — RSK-4.
- **403 → warn+skip, never delete+recreate** (INV-SAFE-1; DEC-4) — a permission gap cannot cause a silent overwrite or an unauthorized recreation; AC-F7-1 — RSK-2.
- **The 409 drift gate is the zero-silent-overwrite control** (NFR-REL-1; ADR-0006 C-5/C-6) — a misparse would be brand-defining; zod validates the 409 envelope, AC-F3-1 asserts correct version extraction — RSK-1.
- **Boundary validation** (DEC-7) — every remote payload is zod-validated before use, so a malicious/malformed Confluence response cannot inject an untyped shape into the adapter's returns (defense for RSK-7).
- **No new dependency surface** — native `fetch`/`URL`/`FormData`/`Blob`/`crypto`; `zod` installed in Phase 0 (GH-15 used ajv; this is the first zod-consuming story). No HTTP/crypto library.

## 22. MAINTENANCE & OPERATIONS IMPACT

- The `ConfluenceClient` is the **single** place the v1/v2 split, retry policy, and auth injection live — extending the adapter (a new endpoint) is a localized change, not a domain change. The port is the stable seam.
- The 409 parse is the highest-leverage maintenance point: if Confluence changes the conflict body/title shape, this is the one place to update (zod catches the drift as a typed failure — RSK-7). The nightly live-smoke (E5-S1) is the early-warning surface.
- The `RateLimited` arm is a new producer site; any handler that switches over `MarkSyncError` exhaustively is surfaced by `assertNeverMarkSyncError` at typecheck time (RSK-6), so adding the arm cannot silently leave a handler unextended.
- Retry/backoff constants (1s/2s/4s + jitter, max 3; `Retry-After` honored; 401/403 never retried) are centralized in the client and are the operational knobs for Confluence rate-limit behavior.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| `TargetSystem` port | The domain-owned, adapter-agnostic interface every target adapter implements; the only seam the domain/application tiers call (NFR-MAINT-1/MAINT-3). |
| Confluence adapter | The sole `TargetSystem` port implementor for Confluence Cloud (`src/infra/confluence/`); isolates all v2/v1 distinctions. |
| v2 / v1 split | Confluence Cloud's split REST surface: v2 for pages + content properties; v1-only for attachments/search/restrictions/labels. |
| 409 CONFLICT | The optimistic-concurrency signal: a stale `version.number` update is rejected with `errors[0].code:"CONFLICT"` + a version-laden title (spike H5). The drift gate (ADR-0006 C-5/C-6). |
| 400 duplicate attachment | The create endpoint's `"Cannot add a new attachment with the same file name"` 400 — the skip-if-exists idempotency signal (spike H4), not an error. |
| `RateLimited` arm | A new `MarkSyncError` kind produced on exhausted-429 backoff (F-9, DEC-2); one of two error-model changes in this story (alongside `RemoteUnreachable`). |
| `RemoteUnreachable` arm | A new `MarkSyncError` kind produced on exhausted-5xx/network failure (F-9, DEC-2, OQ-1); the other error-model change in this story. |
| `marksync.metadata` | The v2 content property mirroring the lock's key fields as the ADR-0006 cross-check; stored as a string (~8 KB, spike H2). |
| warn+skip | The 403 recovery semantics: skip the page, never delete/recreate (INV-SAFE-1; DEC-4). |
| Boundary negative test | A scratch file under `src/domain/`/`src/cli/` importing from `src/infra/confluence/` that proves dep-cruiser fails on a breach (AC-F1-1). |

## 24. APPENDICES

- **Spike findings (H1–H6)**: `doc/inception/tmp/confluence-api-validation-spike/findings/atlassian-api-spike-findings.md` — the validated endpoint shapes, the exact 409 body (`errors[0].code:"CONFLICT"`, version-laden title), the 400-dup behavior, the ~8.4 KB property size, the auth path, and the v1/v2 split facts. Cited, not re-derived.
- **Port contract**: architecture-overview §"Internal interface contracts" (lines ~215-235) — the operation set and return/error shapes (`getPage`/`updatePage`/`putProperty`/`renderBody`/`attachmentExists`/`uploadAttachment`).
- **Module residence**: architecture-overview §"Module-residence rules" + dependency-direction matrix — port in domain; adapter in infrastructure implementing the port; domain/cli may not import the adapter.
- **Reused contracts**: `src/domain/result.ts` (`Result<T,E>`); `src/domain/errors.ts` (`Conflict`/`Forbidden`/`TooLarge`/`RemoteMissing` arms + `assertNeverMarkSyncError`); `src/domain/credentials.ts` (`ConfluenceCredentials`, GH-17); `src/infra/confluence/render/storage.ts` (`renderStorage`, GH-20); `.dependency-cruiser.cjs` (boundary rules).
- **Load-bearing decisions**: ADR-0005 (Storage target); ADR-0006 (state model — 409 gate, content-property cross-check, 403→warn+skip, INV-SAFE-1); ADR-0010 (provenance `version.message`).

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-09 | spec-writer (ADOS) | Initial specification. |

---

## AUTHORING GUIDELINES

Authored by `@spec-writer` per the standard phase-2 specification flow. Sources: the story file MS2-E3-S4 (authoritative scope — full deliverables, ACs, DoD, out-of-scope, CEO-resolved risks), the feature spec `feature-confluence-adapter.md`, `architecture-overview.md` (§"Internal interface contracts" port signatures + §"Confluence adapter components" + §"Module-residence rules" + dependency-direction matrix), ADR-0005 (Storage target) + ADR-0006 (state model — 409 gate, content-property cross-check, 403→warn+skip, INV-SAFE-1), the spike findings (H1–H6 validated facts), `nonfunctional.md` (NFR-MAINT-1, NFR-SEC-1, NFR-SEC-3, NFR-REL-1, NFR-PERF-4), and the existing code seams verified present: `src/domain/errors.ts` (reused arms + `assertNeverMarkSyncError`; `RateLimited` confirmed **absent** → new deliverable), `src/domain/credentials.ts` (`ConfluenceCredentials`, GH-17), `src/domain/result.ts` (`Result<T,E>`), `src/infra/confluence/render/storage.ts` (`renderStorage`, GH-20), `.dependency-cruiser.cjs` (boundary rules already enforced). The GH-20 spec was the structural/quality reference; the template (`doc/templates/change-spec-template.md`) defines structure. The `RateLimited` arm is flagged as a domain-union deliverable per the pm-notes cross-check; two genuine gaps (exhausted-5xx mapping → OQ-1; `RateLimited` field shape → OQ-2) are surfaced rather than decided.

## VALIDATION CHECKLIST

- [x] `change.ref` matches `GH-21`
- [x] `owners` has at least one entry
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, NFR-, RSK-, DEC-, DM-, OQ-, NG-, G-)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details beyond module residence (no step-by-step code)
- [x] No content duplicated from linked docs (cited, not copied)
- [x] Front matter validates per the template
