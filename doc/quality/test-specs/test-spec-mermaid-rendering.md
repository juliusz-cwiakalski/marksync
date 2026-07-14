---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: TEST-SPEC-MERMAID-RENDERING
status: Current
created: 2026-07-13
last_updated: 2026-07-14
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
links:
  related_changes: ["GH-69", "GH-76"]
  feature_spec: doc/spec/features/feature-mermaid-rendering.md
  decisions: [ADR-0002]
---

# Test Specification: Mermaid Diagram Rendering

## Overview

The Mermaid rendering feature converts `language-mermaid` code fences into SVG
image attachments on the published Confluence page. MS-0002 implements the
opt-in `render` policy via the public Kroki API (ADR-0002 rung 6, GH-69); the
`code` policy remains the default (GH-25). The Kroki adapter forwards Mermaid
config (`deterministicIds`, `htmlLabels`) as diagram-options query parameters
and normalizes the SVG via §3.3 rules before hashing, so the same source +
config produces a stable hash across syncs even if Kroki emits non-deterministic
IDs (GH-76). The feature is exercised at the **Unit**, **Integration**, and
**Golden** tiers — all offline, with a mocked renderer returning fixed SVG bytes
so the content hash is deterministic in CI.

The properties proven through the tests:

- **Render activation** — a fence under `policy: render` becomes
  `<ac:image><ri:attachment ri:filename="marksync-mermaid-<fullhash>.svg"/>`.
- **Attachment reuse (NFR-PERF-4)** — an unchanged diagram performs **0**
  `uploadAttachment` calls on the second run (`attachmentExists` short-circuits).
- **Determinism** — the Kroki adapter normalizes SVG (§3.3 rules) before hashing,
  so non-deterministic raw bytes (random IDs, marker names, comments) produce the
  same full-sha256 hash → same filename across syncs (GH-76).
- **No silent failure (ADR-0002 C-2)** — a Kroki HTTP/timeout/network failure
  descends per-fence to the code block with a warning.
- **Privacy (NFR-PRIV-2)** — a one-time warning is emitted per run under `render`;
  `code`/`skip` emit none.
- **Boundary isolation** — dep-cruiser fires on a `src/domain/mermaid/` →
  `src/infra/` breach (domain depends only on the `Renderer` port).

## Test Scope

**Components under test:**

- `src/domain/mermaid/port.ts` — the `Renderer` port interface.
- `src/domain/mermaid/normalize.ts` — pure SVG normalizer (§3.3 rules for digest
  stability, GH-76).
- `src/domain/mermaid/transform.ts` — the HAST transform (fence discovery, render,
  `<img>` replacement, in-doc dedup, fallback on error).
- `src/infra/mermaid/kroki.ts` — `KrokiClient` HTTP adapter (POST, config
  passthrough as diagram options, SVG normalization before hash, timeout, error
  mapping).
- `src/app/push-flow.ts` — the `computePlan` wiring (transform placement,
  `PlanEntry.assets` / `ContentHash.attachmentHashes`, privacy warning) and the
  `applyPlan` lock-binding update (per-page attachment-hash replacement on
  Update/Create, GH-76).

**Reused, not re-tested (delivered by GH-26 / GH-21):**

- `src/infra/confluence/attachments.ts` — `attachmentFilename()` produces
  `marksync-mermaid-<fullhash>.svg` for `kind === "mermaid"`; `uploadAssets` /
  `attachmentExists` handle mermaid artifacts via the same path as local assets.
- `src/infra/confluence/render/storage.ts` — `imageMacro` emits
  `<ac:image><ri:attachment>` for the synthetic `<img>` node.

**Exclusions:**

- Real Kroki network responses — raw SVG bytes are non-deterministic across
  environments; CI mocks the renderer and tests normalization against synthetic
  non-deterministic SVG inputs instead. Real Kroki is reached only by the manual
  smoke check and the E5-S1 live-sandbox gate.
- mmdc CLI / self-hosted Kroki / SVG sanitization — deferred (ADR-0002 NG-1/NG-2,
  MS-0003+).
- In-process official-library renderer (Part B) — deferred to MS-0003+ (GH-11 H4
  FAIL); the Mermaid-DOM test tier is not applicable to the Kroki path.
- Live-sandbox E2E — an E5-S1 scenario, separate gate.

## Test Levels

### Unit Tests

**Purpose:** Validate the Kroki adapter transport (success, HTTP 4xx/5xx,
timeout, DNS failure, request body/headers, config passthrough as query params,
SVG normalization before hashing, determinism across repeated renders) and the
domain transform (policy gating render/code/skip, `<img>` replacement,
determinism across repeats, in-doc dedup, empty-source and always-error
fallback, recursive HAST walk). The pure `normalizeSvg` function is tested in
isolation (each §3.3 rule: comment stripping, attribute sorting, ID rewriting,
whitespace canonicalization, metadata stripping).

**Tools:** `bun:test`. `KrokiClient` accepts an injected `fetch` seam (default
`globalThis.fetch`); unit tests stub `fetch` for fault injection. The transform
is tested against real HAST trees with a stubbed `Renderer` (adapter boundary —
allowed to stub; the HAST walk and hashing are exercised for real).

**Locations:**

- `tests/unit/infra/mermaid/kroki.test.ts` — adapter transport, config passthrough
  (query params, `securityLevel` omission), SVG normalization before hashing,
  determinism across repeated renders, full-sha256 hash.
- `tests/unit/domain/mermaid/normalize.test.ts` — pure normalizer (each §3.3 rule
  in isolation, semantic SVG structure unchanged).
- `tests/unit/domain/mermaid/transform.test.ts` — transform behavior + policy
  gating + dedup + fallback.
- `tests/unit/app/push-flow.test.ts` — lock pruning (replace vs merge semantics
  in `finalizeSuccessfulUpdate`).

### Integration Tests

**Purpose:** Exercise the full `computePlan` path with a mock Kroki renderer +
mock `TargetSystem` (using the **real** `renderStorage`), proving the transform
placement, attachment upload/reuse, privacy warning, per-document isolation, and
no-secrets-in-output behavior end-to-end.

**Tools:** `bun:test`; a mock `TargetSystem` recording `attachmentExists` /
`uploadAttachment` calls (programmable `exists=true/false`); a stubbed `Renderer`
returning fixed SVG bytes.

**Key scenarios:** render activation + upload; idempotent reuse (0 uploads on
rerun, NFR-PERF-4); lock pruning (bloated lock → pruned to current run's entries
on Update; `NO_CHANGE` preserves existing entries); no-op sync classification
(unchanged content → `NO_CHANGE`, not `LOCAL_AHEAD`, because stable attachment
hashes prevent false-positive classification); per-document isolation (one doc
fails, run continues); privacy warning (render emits it once, code/skip emit
none); no secrets in output (token in source never reaches body/plan/report).

**Locations:**

- `tests/integration/app/mermaid/mermaid-render.test.ts` — render activation,
  attachment reuse, per-document isolation, privacy warning.
- `tests/integration/confluence/push-flow.test.ts` — lock pruning (bloated lock
  → pruned on Update; `NO_CHANGE` preserves), no-op sync (0 `uploadAttachment`
  on second run, `NO_CHANGE` classification), per-document isolation on render
  failure.

### Golden Fixture Tests

**Purpose:** Byte-lock the Storage XHTML **structure** for a mermaid fence under
`render` policy, using a mocked renderer so the hash is stable. Also validates
that the normalized SVG has 0 structural differences from the raw SVG
(normalization strips only non-deterministic metadata/IDs; all visual elements —
paths, text, shapes — are preserved).

**Note:** Kroki SVG bytes are not golden-stable across environments; the golden
captures the `<ac:image><ri:attachment ri:filename="marksync-mermaid-<hash>.svg"/>`
structure with a fixed-byte renderer, not the SVG itself.

**Location:** `tests/golden/markdown/mermaid-render-golden.test.ts`; fixture
`tests/golden/fixtures/markdown/mermaid-render-policy.storage.xhtml`.

### End-to-End Tests

Not run during MS-0002 unit/integration loops. A live-sandbox mermaid render +
upload scenario is an E5-S1 gate.

## Test Data

- **Mermaid sources:** simple valid diagrams (e.g. `graph TD; A-->B`) and an
  empty/whitespace fence (fallback edge case).
- **Fixed SVG bytes:** the mocked renderer returns identical bytes for a given
  source, making the sha256 hash and filename deterministic in CI.
- **Token-in-source fixture:** a fence whose source contains a fake token
  (`AKIAIOSFODNN7EXAMPLE`) to assert no secret leakage into body/plan/report
  (INV-SEC-1).
- **Fault fixtures:** HTTP status codes (503, 404) and `AbortError` (timeout) for
  fallback paths.

## Test Scenarios

### Scenario 1: Render activation — fence to `<ri:attachment>`

- **Given:** a doc with a mermaid fence and `render.mermaid.policy: render`; a
  mock renderer returning fixed SVG bytes.
- **When:** `computePlan` + `applyPlan` run.
- **Then:** the Storage body contains
  `<ac:image><ri:attachment ri:filename="marksync-mermaid-<fullsha256>.svg"/>`;
  `uploadAttachment` is called once with `Artifact { mime: "image/svg+xml", hash,
  kind: "mermaid" }`; the attachment exists after apply. (TC-MERM-001)

### Scenario 2: Golden XHTML structure (mocked renderer)

- **Given:** a mocked renderer returning fixed bytes and a committed golden
  fixture.
- **When:** the transform runs under `policy: render` and the HAST renders to
  Storage.
- **Then:** the body byte-matches the golden fixture; a snapshot regression layer
  guards the structure. (TC-MERM-002)

### Scenario 3: Attachment reuse — unchanged → 0 uploads

- **Given:** a first run has uploaded the attachment.
- **When:** a second run pushes the **unchanged** doc.
- **Then:** `attachmentExists` returns true → `uploadAttachment` called **0**
  times (NFR-PERF-4). Under the `render` policy, normalized SVG hashing (GH-76)
  ensures the hash is stable across syncs so the reuse path activates.
  (TC-MERM-003)

### Scenario 4: Policy activation — render vs code vs skip

- **Given:** a HAST tree with a mermaid fence and a stubbed renderer.
- **When:** the transform runs under each policy.
- **Then:** `render` replaces the `pre` with an `img` node and yields one
  `Artifact`; `code`/`skip` leave the `pre` unchanged and yield zero artifacts.
  (TC-MERM-004)

### Scenario 5: Network fallback — HTTP error / timeout → code block + warning

- **Given:** a mocked `fetch` returning HTTP 503/404, or an `AbortError`
  (timeout), or a DNS failure.
- **When:** the adapter / transform processes the fence.
- **Then:** returns `err({ kind: "RemoteUnreachable", ... })`; the fence is kept
  (renders as a code macro); a per-fence warning is surfaced; `uploadAttachment`
  is called **0** times; no silent drop (ADR-0002 C-2). (TC-MERM-005, TC-MERM-010,
  TC-MERM-012)

### Scenario 6: Per-document isolation — one doc fails, run continues

- **Given:** two docs; the renderer fails for doc B and succeeds for doc A.
- **When:** a single run processes both.
- **Then:** doc A renders as `<ac:image>`; doc B falls back to a code block with
  a warning; the run completes (does not abort). (TC-MERM-006)

### Scenario 7: Determinism — same source → same full-sha256 → same filename

- **Given:** a stubbed renderer returning fixed bytes.
- **When:** the transform runs three times on the same source.
- **Then:** all three hashes are identical 64-char hex sha256; all three filenames
  are `marksync-mermaid-<fullhash>.svg` (full hash, not truncated). (TC-MERM-007)

### Scenario 8: Privacy warning — one-time under `render`

- **Given:** a doc under each policy.
- **When:** `computePlan` runs.
- **Then:** `render` emits the Kroki privacy warning exactly once per run;
  `code`/`skip` emit no privacy warning (NFR-PRIV-2). (TC-MERM-008)

### Scenario 9: In-doc dedup — same fence twice → one Artifact

- **Given:** a HAST tree with two identical mermaid fences.
- **When:** the transform runs under `render`.
- **Then:** exactly one `Artifact` is produced; both `pre` elements become `img`
  nodes with the same `src`; the renderer is called once per unique source.
  (TC-MERM-009)

### Scenario 10: No secrets in output (INV-SEC-1)

- **Given:** a mermaid fence whose source contains a fake token.
- **When:** `computePlan` + `applyPlan` run under `render`.
- **Then:** the token appears **0** times in the body, plan JSON, and apply
  report; the filename is the content hash, not the source text. (TC-MERM-011)

### Scenario 11: Determinism via SVG normalization — non-deterministic raw bytes → same hash

- **Given:** two SVG byte arrays from Kroki for the same Mermaid source that
  differ only in non-deterministic elements (random element IDs, marker names,
  comments, whitespace).
- **When:** both are normalized and hashed by the `KrokiClient`.
- **Then:** the normalized forms are byte-identical and the hashes match — the
  same source + config produces a stable `Artifact.hash` across syncs.
  (TC-MERM-DETM-001, TC-MERM-NORM-001)

### Scenario 12: Config passthrough to Kroki — diagram-options query params

- **Given:** a `MermaidRenderConfig` with `deterministicIds: true`,
  `htmlLabels: false`, `securityLevel: strict`.
- **When:** the `KrokiClient` calls Kroki.
- **Then:** the request URL contains `deterministic-ids=true` and
  `html-labels=false`; it does **not** contain `securityLevel`/`security-level`
  (blocked by Kroki, enforced as `strict` by default). (TC-MERM-DETM-003,
  TC-MERM-DETM-004)

### Scenario 13: Lock pruning — bloated lock pruned on Update

- **Given:** a page binding with stale `attachmentHashes` (e.g., 55 entries from
  pre-fix syncs) and a current run producing 11 Mermaid artifacts.
- **When:** the sync completes with an Update outcome.
- **Then:** the updated `attachmentHashes` contains exactly the current run's 11
  entries (replacement, not merge); stale entries are pruned. A `NO_CHANGE`
  outcome preserves the existing entries unchanged. (TC-LOCK-001, TC-LOCK-002,
  TC-LOCK-003)

### Scenario 14: No-op sync — unchanged content → `NO_CHANGE`

- **Given:** a second sync where all content (body + Mermaid sources + assets) is
  unchanged from the base.
- **When:** `classify()` runs and `applyPlan` processes the entry.
- **Then:** the result is `NO_CHANGE` (not `LOCAL_AHEAD`) because normalized
  attachment hashes are stable; `uploadAttachment` is called **0** times.
  (TC-E2E-002, TC-E2E-003)

## Performance & Load Tests

Not part of MS-0002. NFR-PERF-* targets are deferred to MS-0003+.

## Security Tests

- **No secrets in output (INV-SEC-1 / NFR-SEC-1):** the mermaid filename is the
  SVG content hash, never the source text; a token planted in diagram source does
  not reach any output path (Scenario 10).
- **Privacy (NFR-PRIV-2):** remote rendering is opt-in; the `code` default sends
  no diagram content anywhere; the `render` policy surfaces a one-time warning
  (Scenario 8).
- **SVG sanitization:** deferred to MS-0003+ (Kroki is treated as a trusted
  renderer for MS-0002, bounded by the opt-in default + warning).

## Negative Testing

- HTTP 4xx/5xx from Kroki → `RemoteUnreachable` (unit + integration).
- `AbortError` (30 s timeout) → `RemoteUnreachable`.
- Generic `fetch` throw (DNS/network) → `RemoteUnreachable`.
- Empty/whitespace mermaid source → renderer error → code block + warning.
- A renderer that always errors → every fence falls back to code; run continues.

## Automation Strategy

- **CI:** `bun run check` (lint + format:check + typecheck + test +
  check:boundaries) is the gate. It exits 0.
- **Boundary gate:** `bun run check:boundaries` (`depcruise src`) confirms
  `src/domain/mermaid/` imports no `src/infra/` (it depends only on the
  `Renderer` port) and `src/infra/mermaid/` imports only the port + domain types.
- **Determinism in CI:** a mocked renderer returns fixed SVG bytes; the
  `normalizeSvg` unit tests and Kroki determinism tests (TC-MERM-DETM-001,
  TC-MERM-NORM-001) prove that non-deterministic raw SVG inputs normalize to a
  stable hash. Real Kroki responses are validated manually (network-dependent).

## Test Environment

- **No real network:** all tests run offline against a stubbed `Renderer` / mocked
  `fetch` / mock `TargetSystem`. The real Kroki endpoint is reached only by the
  manual determinism check and the E5-S1 live-sandbox gate.
- **Mock target:** records `attachmentExists` / `uploadAttachment` calls and uses
  the real `renderStorage` so the produced Storage XHTML is authentic.

## Test Coverage Metrics

- Every adapter response path (200, 4xx, 5xx, timeout, network-throw) has a unit
  assertion; the critical paths (activation, reuse, fallback, privacy) also have
  an integration assertion.
- The transform is covered for all three policies, in-doc dedup, empty source,
  and recursive (nested-block) fence discovery.
- The golden fixture byte-locks the render-policy Storage structure.

## References

- [Feature spec](../../spec/features/feature-mermaid-rendering.md)
- [ADR-0002](../../decisions/ADR-0002-mermaid-rendering-strategy.md) (fallback
  ladder rung 6, C-2 no-silent-failure, C-3 privacy)
- [Nonfunctional requirements](../../spec/nonfunctional.md) (NFR-PRIV-2,
  NFR-PERF-4)
- [Architecture overview](../../overview/architecture-overview.md)
- [Testing strategy](../../../.ai/rules/testing-strategy.md)
- [Change test plan (GH-69)](../changes/2026-07/2026-07-13--GH-69--mermaid-kroki-render/chg-GH-69-test-plan.md)
- [Change test plan (GH-76)](../changes/2026-07/2026-07-14--GH-76--mermaid-deterministic-svg-lock-prune/chg-GH-76-test-plan.md)
