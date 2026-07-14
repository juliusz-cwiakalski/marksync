---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-76
  type: fix
  status: Proposed
  slug: mermaid-deterministic-svg-lock-prune
  title: "Mermaid SVG attachments regenerated on every sync — lock file grows indefinitely"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [bug, MS-0002, priority:high, mermaid, kroki]
  version_impact: patch
  audience: internal
  security_impact: low
  risk_level: medium
  dependencies:
    internal: [mermaid-rendering, asset-pipeline, lock-state, push-flow]
    external: [Kroki API (https://kroki.io)]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Fix non-deterministic Mermaid SVG rendering and additive lock-merge so that unchanged diagrams are reused (0 re-uploads), the lock file stops growing indefinitely, and no-op syncs classify as `NO_CHANGE` — restoring the NFR-PERF-4 idempotent-rerun invariant broken by GH-69.

## 1. SUMMARY

The `render` Mermaid policy (GH-69) is non-deterministic: the Kroki adapter POSTs raw diagram source without passing Mermaid render configuration (`deterministicIds`, `htmlLabels`), so Kroki uses its defaults and emits random SVG element IDs — producing different content hashes on every sync. Combined with an additive-only lock merge that never prunes stale attachment hashes, this causes a new attachment upload every sync, indefinite lock-file growth, and no-op syncs being classified as `LOCAL_AHEAD`. This change fixes both root causes: (A) passes Mermaid config to Kroki as diagram options and normalizes the SVG output before hashing so the same source + config produces a stable hash, and (C) replaces (not merges) per-page attachment hashes in the lock so stale entries are pruned on every sync.

## 2. CONTEXT

### 2.1 Current State Snapshot

- **GH-69 (Mermaid Kroki render) is merged.** The `render` policy POSTs diagram source to `https://kroki.io/mermaid/svg` as `text/plain`, receives SVG bytes, hashes them via full sha256, and uploads as `marksync-mermaid-<hash>.svg` via the GH-26 asset pipeline. The `Renderer` port signature is `render(source: string)` — no config parameter. The `KrokiClient` is constructed with no Mermaid configuration.
- **The `MermaidRenderConfig` type exists** with fields `policy`, `securityLevel`, `htmlLabels`, `deterministicIds`. The HAST transform receives this config but only checks `policy`; the render-configuration fields are never forwarded to the Kroki adapter.
- **Lock merge is additive.** `finalizeSuccessfulUpdate` persists attachment hashes via `{...binding.attachmentHashes, ...assetUploadHashes}` — old entries are never removed. Since the filename is `marksync-mermaid-<hash>.svg` and the hash changes each sync (non-deterministic rendering), each sync adds new keys without pruning old ones.
- **The classifier compares attachment hashes.** `classify()` computes `attachmentHash(base.attachmentHashes)` (a sorted, null-joined sha256 over all filename→hash pairs) and compares it to `local.attachmentHash`. When rendered SVG bytes change, the hash in `attachmentHashes` changes, so `localChanged = true` → classifies as `LOCAL_AHEAD` instead of `NO_CHANGE`.
- **`attachmentExists` checks by hash.** When the hash differs (non-deterministic rendering), `attachmentExists` returns false → a new attachment is uploaded.

### 2.2 Pain Points / Gaps

- **Non-deterministic SVG rendering.** Kroki is called without `deterministicIds: true`, so Mermaid generates random element IDs (e.g., `flowchart-<random>-<random>`), random marker names, and non-deterministic SVG structure. The same source produces different SVG bytes on each call → different sha256 hash → different attachment filename.
- **Lock file grows indefinitely.** The additive merge `{...old, ...new}` accumulates stale attachment hashes. Evidence from the ticket: a demo repo with 11 Mermaid diagrams grew from 19 to 55 attachment entries across 10 syncs — all 55 hashes unique.
- **No-op syncs become write syncs.** The changed attachment hashes cause the classifier to see a content change, turning a `NO_CHANGE` into a `LOCAL_AHEAD` → unnecessary page update + attachment upload on every sync.
- **Violates NFR-PERF-4.** The idempotent-rerun invariant ("a second semantically-unchanged push performs 0 writes") is broken for any page with Mermaid diagrams under the `render` policy.
- **GH-69 RSK-3 materialized.** GH-69's risk register assumed Kroki was deterministic (Probability: L, Residual Risk: M). This assumption was wrong — the non-determinism is real and caused by missing config passthrough.

## 3. PROBLEM STATEMENT

Because the Kroki adapter sends raw Mermaid source without render configuration and the lock merge never prunes stale attachment hashes, users running `marksync sync` with `render.mermaid.policy: "render"` cannot achieve idempotent syncs — every sync re-renders all diagrams (producing different SVG bytes), re-uploads all Mermaid attachments, grows the lock file without bound, and classifies unchanged content as a local change, resulting in unnecessary writes, Confluence storage bloat from orphaned attachments, and a noisy audit trail.

## 4. GOALS

- **G-1**: Same Mermaid source + same render config → same SVG content hash across syncs (deterministic rendering via Kroki).
- **G-2**: Lock file attachment hashes pruned to the current run's entries per page (no indefinite growth).
- **G-3**: No-op sync (unchanged content) classifies as `NO_CHANGE`, not `LOCAL_AHEAD`.
- **G-4**: Mermaid render configuration from `marksync.yml` is forwarded to the rendering adapter and affects the rendered SVG.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| SVG determinism | Same source + config → identical sha256 hash across ≥ 2 syncs (100% of cases) |
| Attachment reuse (NFR-PERF-4) | Second sync with unchanged Mermaid content → **0** `uploadAttachment` calls |
| Lock entry count | After sync, `attachmentHashes` per page == current run's attachment count (not cumulative) |
| No-op classification | Sync with unchanged content → `NO_CHANGE` (not `LOCAL_AHEAD`) |
| Config passthrough | `deterministicIds` and `htmlLabels` from config reach Kroki and alter SVG output |
| Quality gate | `bun run check` exits **0** |

### 4.2 Non-Goals

- **NG-1**: In-process Mermaid rendering (deferred to MS-0003+ per CEO-DEC-1 / GH-11 H4 FAIL).
- **NG-2**: Migration or cleanup of existing bloated lock files (self-healing on the next sync with the fix — stale entries are pruned automatically).
- **NG-3**: Option B (hash by source, not by rendered output) — not needed if rendering is made deterministic via Option A.
- **NG-4**: SVG sanitization (deferred to MS-0003+ per ADR-0002 Security Requirements; Kroki is trusted for MS-0002).
- **NG-5**: Changes to the `code` or `skip` policies (only the `render` policy is affected).

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Mermaid config passthrough to renderer | The renderer must receive and apply `MermaidRenderConfig` fields (`deterministicIds`, `htmlLabels`) so the rendered SVG reflects configured options. Currently the config exists but is never forwarded to the Kroki adapter. |
| F-2 | Deterministic SVG normalization before hashing | SVG output is normalized (non-deterministic elements stripped/rewritten) before content hashing, so the same logical input produces a stable hash even if the raw SVG contains residual non-determinism. |
| F-3 | Lock attachment hash pruning | Per-page attachment hashes in the lock are replaced (not merged) with the current run's complete set, preventing indefinite accumulation of stale entries. |

### 5.1 Capability Details

- **F-1 (Mermaid config passthrough).** The render operation must carry the Mermaid render configuration (`securityLevel`, `htmlLabels`, `deterministicIds`) from `marksync.yml` to the rendering adapter. The `MermaidRenderConfig` type already defines these fields; the gap is that they are not forwarded. The adapter translates applicable config fields to Kroki diagram options — Kroki accepts Mermaid config as query parameters using kebab-case naming (e.g., `deterministic-ids=true`, `html-labels=false`). **Research finding (Kroki docs — see Appendix A):** Kroki blocks `securityLevel` as a diagram option for security reasons — it cannot be overridden. However, Kroki enforces `securityLevel: strict` by default, which matches the required posture (ADR-0002 Security Requirements). Only `htmlLabels` and `deterministicIds` are forwarded; `securityLevel` is accepted as enforced-by-Kroki-default (DEC-1).

- **F-2 (Deterministic SVG normalization).** The SVG bytes returned by Kroki are normalized before content hashing. Normalization strips non-deterministic elements (random element IDs, marker names, clip-path IDs, ephemeral metadata) without altering visual output. The normalization rules follow the digest-stability rules recorded in `feature-mermaid-rendering.md` §3.3 (XML comments stripped, attributes sorted per element, ephemeral IDs rewritten to a stable sequence, whitespace canonicalized, font/system metadata normalized). The normalized SVG is the artifact content and the hash input — ensuring `hash = sha256(normalizedSVG)` is stable across syncs. **Non-goal:** normalization is for digest stability, not for altering rendered semantics (per §3.3). Normalization is defense-in-depth: even if `deterministicIds` does not fully stabilize Kroki output, ID rewriting + attribute sorting + whitespace canonicalization produce a stable digest.

- **F-3 (Lock attachment hash pruning).** After a successful page update or create, the per-page `attachmentHashes` in the lock binding is set to the current run's complete attachment set (resolved assets + Mermaid artifacts), replacing — not merging with — the previous binding's entries. This prunes stale attachment hashes on every sync. Existing bloated lock files are self-healing: the first sync with the fix replaces the accumulated entries with the current run's set. For `NO_CHANGE` outcomes (no update applied), the existing binding's hashes are preserved unchanged.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — Deterministic render + reuse (unchanged diagram, second sync):
  computePlan:
    for each pre>code.language-mermaid:
      source = code.textContent
      renderer.render(source, mermaidConfig):
        POST https://kroki.io/mermaid/svg?deterministic-ids=true&html-labels=false
        body = source
        → SVG bytes (with deterministicIds applied)
        normalizedSVG = normalize(svgBytes)     # strip non-deterministic elements
        hash = sha256(normalizedSVG)
        artifact = Artifact{ bytes: normalizedSVG, mime, hash, kind: "mermaid" }
      attachmentExists(pageId, hash)? → true (same hash as sync 1) → skip upload
    classify → NO_CHANGE (attachmentHash unchanged, body unchanged)
  applyPlan → 0 writes, 0 uploads

Flow 2 — Lock pruning on Update:
  applyPlan (Update outcome):
    uploadAssets(pageId, entry.assets):
      for each artifact: attachmentExists? true → skip; false → upload
    finalizeSuccessfulUpdate:
      updatedBinding.attachmentHashes = currentRunAttachmentHashes   # REPLACE, not merge
      saveLock → putProperty

Flow 3 — Self-healing of bloated lock:
  existing lock has 55 stale attachment entries (from pre-fix syncs):
    computePlan:
      render all diagrams → normalized hashes (stable)
      build currentRunAttachmentHashes (e.g., 11 entries for 11 diagrams)
    applyPlan (Update):
      finalizeSuccessfulUpdate:
        updatedBinding.attachmentHashes = currentRunAttachmentHashes   # 11 entries, not 55+
      lock pruned from 55 → 11 on first sync with fix

Flow 4 — Config passthrough to Kroki:
  marksync.yml: render.mermaid: { policy: render, securityLevel: strict, htmlLabels: false, deterministicIds: true }
    renderer receives MermaidRenderConfig
    adapter translates to Kroki diagram options:
      deterministic-ids=true   (kebab-case query param)
      html-labels=false        (kebab-case query param)
      securityLevel: NOT passed (blocked by Kroki; enforced as strict by default)
    POST https://kroki.io/mermaid/svg?deterministic-ids=true&html-labels=false
    → SVG output reflects deterministicIds (stable element IDs)

Flow 5 — No-op sync stability (unchanged content):
  second sync, all content unchanged (body + Mermaid sources + assets):
    renderer produces same normalized hashes → same attachmentHashes
    classify: local.attachmentHash == baseAttachmentHash → localChanged = false
    remote unchanged → remoteChanged = false
    → NO_CHANGE → applyPlan skips → 0 writes, 0 uploads
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Forwarding Mermaid render configuration (`deterministicIds`, `htmlLabels`) to the Kroki rendering adapter (F-1).
- SVG normalization before content hashing, following §3.3 digest-stability rules (F-2).
- Replacing (not merging) per-page attachment hashes in the lock on Update/Create outcomes (F-3).
- Adjusting the renderer contract to carry Mermaid render configuration.
- Unit tests: deterministic rendering (same source + config → same hash), SVG normalization (non-deterministic elements stripped), lock pruning (replace vs merge).
- Integration tests: end-to-end no-op sync with Mermaid diagrams under `render` policy → `NO_CHANGE` + 0 writes.

### 7.2 Out of Scope

- [OUT] In-process Mermaid rendering (NG-1, deferred to MS-0003+).
- [OUT] Migration/cleanup of existing bloated lock files (NG-2, self-healing).
- [OUT] Option B — hash by source instead of rendered output (NG-3, not needed if Option A works).
- [OUT] SVG sanitization (NG-4, deferred to MS-0003+).
- [OUT] Changes to `code` or `skip` policies (NG-5).
- [OUT] Overriding `securityLevel` on Kroki (blocked by Kroki; enforced as `strict` by default).

### 7.3 Deferred / Maybe-Later

- **In-process renderer** — when MS-0003+ lands, the normalization rules (§3.3) are already established and reusable.
- **Self-hosted Kroki** — configurable endpoint URL for privacy-sensitive environments (forward-compatible).
- **Orphaned attachment cleanup** — delete pre-fix orphaned attachments from Confluence (OQ-2).
- **Per-diagram render options** — theme, scale, background via config (ADR-0002 hash formula includes these).

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

| Endpoint | Method | Request | Response | Change |
|----------|--------|---------|----------|--------|
| `https://kroki.io/mermaid/svg` | POST | `Content-Type: text/plain`; body = Mermaid source; **query params: `deterministic-ids=true&html-labels=false`** (derived from `MermaidRenderConfig`) | `Content-Type: image/svg+xml`; body = SVG bytes | **Modified:** diagram options added as query parameters. `securityLevel` is not passed (blocked by Kroki; enforced as `strict` by default). |

### 8.2 Events / Messages

N/A — no event bus. No changes to the conceptual signals (Mermaid Rendered / Mermaid Render Failed).

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `Renderer` port contract (MODIFIED) | The render operation must carry `MermaidRenderConfig` so the adapter can apply render options. The existing `MermaidRenderConfig` type is unchanged; the contract is extended to forward it. |
| DM-2 | `PageBinding.attachmentHashes` (SEMANTICS CHANGE) | Structure unchanged (`Record<string, string>`). Semantics change from additive merge to replacement per page on Update/Create. `NO_CHANGE` outcomes preserve existing entries unchanged. |
| DM-3 | `Artifact` content (MODIFIED) | For Mermaid artifacts, `bytes` is the normalized SVG (not raw Kroki output), and `hash` is `sha256(normalizedSVG)`. This ensures hash stability. The `kind: "mermaid"` marker and filename format (`marksync-mermaid-<hash>.svg`) are unchanged. |

### 8.4 External Integrations

- **Kroki API** — `POST https://kroki.io/mermaid/svg`. **Change:** diagram options (`deterministic-ids`, `html-labels`) are now passed as query parameters per Kroki's diagram-options convention (kebab-case, case-insensitive). `securityLevel` is blocked by Kroki and not passed; Kroki enforces `strict` by default. No changes to the Confluence integration.

### 8.5 Backward Compatibility

- **Lock file:** existing lock files with bloated `attachmentHashes` are self-healing — the first sync with the fix replaces accumulated entries with the current run's set. No migration script needed.
- **Config:** no schema changes. `MermaidRenderConfig` fields already exist; they are now forwarded to the renderer.
- **Attachment content:** Mermaid attachments uploaded before this fix remain on Confluence as orphaned attachments (not deleted). New syncs upload the normalized SVG under a new (stable) hash. Acceptable for MS-0002 (pre-release).
- **Renderer port:** the contract change (carrying config) is internal; no external API impact.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | SVG determinism (F-1, F-2) | Same Mermaid source + same config → identical sha256 hash across ≥ 2 syncs (100% of cases) |
| NFR-2 | Attachment reuse (NFR-PERF-4, F-2) | Second sync with unchanged Mermaid content → **0** `uploadAttachment` calls (asserted via mock target) |
| NFR-3 | Lock pruning (F-3) | After sync, `attachmentHashes` per page contains only the current run's entries (count == current attachment count, not cumulative) |
| NFR-4 | No-op classification (F-1, F-2, F-3) | Sync with unchanged content (body + attachments) → `NO_CHANGE`, not `LOCAL_AHEAD` |
| NFR-5 | Config passthrough (F-1) | `deterministicIds` and `htmlLabels` from `marksync.yml` reach Kroki as diagram options; `securityLevel` enforced by Kroki default (`strict`) |
| NFR-6 | Normalization safety (F-2) | Normalized SVG renders identically to raw SVG (**0** visual differences; normalization strips only non-deterministic metadata/IDs) |
| NFR-7 | Per-document isolation (carry-over) | A render failure on one doc's fences → that doc falls back to code; the run continues |
| NFR-8 | Network fallback (carry-over, ADR-0002 C-2) | Kroki HTTP error → code block + warning; never silent drop (unchanged from GH-69) |
| NFR-9 | Quality gate | `bun run check` exits **0** |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No product telemetry (NFR-SEC-3). Observability is structural:

- **Plan warnings** — unchanged; privacy warning + render-failure warnings still emitted.
- **Attachment filenames** — `marksync-mermaid-<hash>.svg` now reflects a stable hash, making the dedup key reviewable and consistent across syncs.
- **Lock file** — `attachmentHashes` per page no longer grows; entry count reflects current attachments, making the audit trail clean.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | SVG normalization strips elements that affect visual output | M | L | Normalization rules (§3.3) are designed for digest stability, not semantic alteration — they strip only non-deterministic metadata (IDs, comments, whitespace, font declarations). Golden-fixture comparison validates normalized SVG renders identically. | L |
| RSK-2 | Kroki changes diagram-options convention or blocks additional options | M | L | Kroki's diagram-options API is documented and stable. If `deterministicIds` is blocked, SVG normalization (F-2) alone can rewrite random IDs deterministically — defense-in-depth. | L |
| RSK-3 | `securityLevel` cannot be passed to Kroki (blocked) | L | H (confirmed) | Kroki enforces `securityLevel: strict` by default — matches required posture (ADR-0002). No action needed; documented as DEC-1. | L |
| RSK-4 | Lock pruning drops legitimately needed attachment entries | M | L | Pruning replaces with the current run's complete set (assets + Mermaid artifacts), not an empty set. `NO_CHANGE` outcomes preserve existing entries. Self-healing: any error is corrected on the next sync. | L |
| RSK-5 | Existing orphaned attachments on Confluence consume storage | L | H (confirmed) | Pre-fix uploads remain as orphans. Acceptable for MS-0002 (pre-release). Future: orphan cleanup deferred (OQ-2). | L |
| RSK-6 | Residual non-determinism in SVG despite config + normalization | M | L | Normalization (F-2) is defense-in-depth: even if `deterministicIds` does not fully stabilize output, ID rewriting + attribute sorting + whitespace canonicalization produce a stable digest. | L |

## 12. ASSUMPTIONS

- Kroki's diagram-options API accepts `deterministic-ids` and `html-labels` as query parameters (confirmed via Kroki docs — see Appendix A).
- Kroki enforces `securityLevel: strict` by default and blocks override (confirmed via Kroki docs).
- SVG normalization per §3.3 rules produces a stable digest without altering visual output (evidenced by the GH-11 spike for the in-process path; the rules are renderer-agnostic).
- The GH-26 asset pipeline (`uploadAssets`, `attachmentExists`) correctly handles normalized Mermaid artifacts (same `Artifact` shape, only `bytes` content differs).
- Existing bloated lock files are self-healing (no migration needed).

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | GH-69 (Mermaid Kroki render) | The render path being fixed. Merged. |
| Depends on | GH-26 (asset pipeline) | `uploadAssets`, `attachmentExists`, `attachmentFilename`. Merged. |
| Depends on | GH-22 (drift classifier) | `classify()` compares attachment hashes. Merged. |
| Depends on | GH-19 (state manager) | `PageBinding.attachmentHashes` lock structure. Merged. |
| Depends on | ADR-0002 | Mermaid rendering strategy, security requirements, fallback ladder. |
| Depends on | `feature-mermaid-rendering.md` §3.3 | Normalization rules for digest stability. |
| Depends on | NFR-PERF-4 | Idempotent rerun invariant being restored. |
| Reuses | `TargetSystem` port, `AttachmentService` | No changes. |
| Blocks | E5-S1 (BDD + E2E) | Stable Mermaid rendering is a prerequisite for reliable E2E mermaid scenarios. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Should the SVG normalization for the Kroki path reuse the full §3.3 rule set (designed for the in-process renderer), or a simplified subset sufficient for Kroki output? | §3.3 includes gantt `today`-line stripping (Rule 5) which may not be relevant for Kroki output. A subset focusing on ID rewriting + attribute sorting + whitespace canonicalization may suffice. | Decision needed: consult `@decision-advisor` |
| OQ-2 | Should orphaned attachments from pre-fix syncs be cleaned up (deleted from Confluence)? | Pre-fix syncs uploaded attachments under non-deterministic hashes. These remain on Confluence as orphans. | Open (deferred to maybe-later) |

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | Accept that `securityLevel` cannot be passed to Kroki | Kroki blocks `securityLevel` as a diagram option for security reasons (prevents downgrade to `loose`). Kroki enforces `strict` by default, matching ADR-0002 Security Requirements. Only `htmlLabels` and `deterministicIds` are forwarded. | 2026-07-14 |
| DEC-2 | Combine Option A (deterministic rendering) + Option C (lock pruning) | The ticket recommends A+C. Option A alone fixes re-uploads but not lock growth (stale entries from pre-fix syncs remain). Option C alone fixes lock growth but not re-uploads. Together they restore full idempotency. | 2026-07-14 |
| DEC-3 | Normalize SVG before hashing; use normalized bytes as artifact content | Hashing the normalized SVG (not raw Kroki output) ensures `hash = sha256(bytes)` is stable. Using normalized bytes as `Artifact.bytes` keeps hash and content consistent. Normalization does not alter visual output (§3.3 non-goal). | 2026-07-14 |
| DEC-4 | Lock pruning replaces (not merges) per-page on Update/Create; preserves on NO_CHANGE | Replacement ensures stale entries are pruned every sync. `NO_CHANGE` outcomes skip the update, so existing entries are preserved (correct — nothing changed). | 2026-07-14 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| Kroki rendering adapter (infra tier) | UPDATED — forwards Mermaid config as Kroki diagram options; normalizes SVG before hashing (F-1, F-2) |
| `Renderer` port (domain tier) | UPDATED — contract carries `MermaidRenderConfig` so the adapter can apply render options (DM-1) |
| Mermaid HAST transform (domain tier) | UPDATED — forwards config to the renderer (currently only checks `policy`) |
| `finalizeSuccessfulUpdate` (app tier) | UPDATED — replaces (not merges) per-page attachment hashes (F-3) |
| `PageBinding.attachmentHashes` (domain tier) | SEMANTICS CHANGE — replacement instead of additive merge (DM-2) |
| `classify()` (domain tier) | NO CHANGE — benefits from stable hashes; classification logic unchanged |
| `attachmentFilename()` / `AttachmentService` (infra tier) | NO CHANGE — filename format and upload/reuse logic unchanged |
| `MermaidRenderConfig` type (domain tier) | NO CHANGE — fields already exist; now forwarded to renderer |

## 17. ACCEPTANCE CRITERIA

Each AC uses Given/When/Then and traces to at least one F-/NFR- ID.

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-F1-1 | **Given** a Mermaid diagram source and a `MermaidRenderConfig` with `deterministicIds: true`, `htmlLabels: false`, **when** the renderer renders the source twice via Kroki, **then** both renders produce identical `Artifact.hash` (sha256 of normalized SVG). | F-1, F-2, NFR-1 |
| AC-F1-2 | **Given** `MermaidRenderConfig` with `deterministicIds: true`, `htmlLabels: false`, **when** the renderer calls Kroki, **then** the request includes `deterministic-ids=true` and `html-labels=false` as query parameters. `securityLevel` is not passed (blocked by Kroki; enforced as `strict` by default). | F-1, NFR-5 |
| AC-F2-1 | **Given** two SVG outputs from Kroki for the same Mermaid source that differ only in non-deterministic elements (random IDs, marker names), **when** both are normalized and hashed, **then** the normalized forms are byte-identical and the hashes match. | F-2, NFR-1, NFR-6 |
| AC-F2-2 | **Given** a Mermaid diagram rendered via Kroki, **when** the normalized SVG is compared visually to the raw Kroki SVG, **then** there are **0** visual differences (normalization strips only non-deterministic metadata/IDs). | F-2, NFR-6 |
| AC-F3-1 | **Given** a page with a pre-existing lock binding containing stale attachment hashes (e.g., 55 entries from prior syncs), **when** a sync completes with an Update outcome for that page, **then** the updated `attachmentHashes` contains only the current run's entries (e.g., 11 for 11 diagrams), not the cumulative set. | F-3, NFR-3 |
| AC-F3-2 | **Given** a sync where the page classifies as `NO_CHANGE`, **when** `applyPlan` processes the entry, **then** the existing `attachmentHashes` are preserved unchanged (no pruning on no-op). | F-3, NFR-4 |
| AC-F3-3 | **Given** a second sync with unchanged Mermaid content (same source, same config), **when** `applyPlan` runs, **then** `attachmentExists` returns true for all Mermaid artifacts → **0** `uploadAttachment` calls. | F-1, F-2, F-3, NFR-2 |
| AC-F3-4 | **Given** a sync where all content (body + attachments) is unchanged from the base, **when** `classify()` runs, **then** the result is `NO_CHANGE` (not `LOCAL_AHEAD`), because attachment hashes are stable. | F-1, F-2, F-3, NFR-4 |
| AC-QG-1 | **Given** the full test suite, **when** `bun run check` is executed, **then** it exits **0**. | NFR-9 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Delivery order:** (1) Extend renderer contract to carry config → (2) Implement Kroki config passthrough (diagram options) → (3) Implement SVG normalization before hashing → (4) Implement lock pruning (replace vs merge) → (5) Test end-to-end → (6) Commit.
- **Merge strategy:** PR against `main`; review ensures F-1–F-3 are satisfied and NFR-PERF-4 idempotent-rerun is restored.
- **Communication:** This is a bug fix for the `render` policy (opt-in). Users with `render.mermaid.policy: render` will benefit automatically. The `code` default is unaffected.
- **Adoption notes:** The first sync after this fix prunes stale lock entries (self-healing). No user action required.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

No migration script. Existing bloated lock files are self-healing: the first sync with the fix replaces accumulated `attachmentHashes` entries with the current run's set. Orphaned attachments on Confluence (from pre-fix syncs) remain but are not referenced; cleanup is deferred (OQ-2).

## 20. PRIVACY / COMPLIANCE REVIEW

No change to privacy posture. The `render` policy remains opt-in with a one-time privacy warning (NFR-PRIV-2, GH-69). Config passthrough does not send additional data to Kroki — the same diagram source is sent; only query parameters (render options) are added. `securityLevel` is not passed (blocked by Kroki); Kroki enforces `strict` by default.

## 21. SECURITY REVIEW HIGHLIGHTS

- **`securityLevel` blocked by Kroki:** Kroki prevents overriding `securityLevel` (blocks downgrade to `loose`/`sandbox`). Kroki enforces `strict` by default — matches ADR-0002 Security Requirements. No action needed (DEC-1).
- **SVG normalization safety:** Normalization operates on SVG bytes only (strips metadata/IDs); does not execute or interpret SVG content. No injection risk from normalization.
- **No new external data egress:** Config passthrough adds query parameters to the existing Kroki POST; no new endpoints or data flows.

## 22. MAINTENANCE & OPERATIONS IMPACT

- **Reduced operational noise:** Lock files no longer grow indefinitely; attachment dedup works as designed.
- **Reduced Confluence storage:** No more orphaned attachment uploads on every sync (only on actual content change).
- **Forward-compatible:** The SVG normalization rules (§3.3) are reusable for the in-process renderer (MS-0003+).
- **No new monitoring:** Existing warning paths (privacy, render-failure) are unchanged.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Deterministic rendering | Same input + config → same output bytes (after normalization) → same content hash. |
| SVG normalization | Stripping/rewriting non-deterministic SVG elements (random IDs, marker names, ephemeral metadata) to produce a stable digest. Rules per `feature-mermaid-rendering.md` §3.3. |
| Lock pruning | Replacing per-page `attachmentHashes` with the current run's complete set, removing stale entries. |
| Kroki diagram options | Mermaid config passed as kebab-case query parameters to the Kroki API (e.g., `deterministic-ids=true`). |
| Additive lock merge | The pre-fix behavior: `{...old, ...new}` — old entries preserved, never pruned. |
| Self-healing | Existing bloated lock files are automatically pruned on the first sync with the fix; no manual migration needed. |

## 24. APPENDICES

### Appendix A — Kroki Diagram Options Research

**Source:** Kroki documentation — https://docs.kroki.io/kroki/setup/diagram-options/

**Findings:**

1. Kroki passes Mermaid config as diagram options (query parameters on the POST URL).
2. Naming convention: Mermaid camelCase → Kroki kebab-case (e.g., `deterministicIds` → `deterministic-ids`, `htmlLabels` → `html-labels`).
3. Diagram-type-specific options use `_` instead of `.` (e.g., `er_title-top-margin`).
4. Options are case-insensitive.
5. **Blocked options** (for security): `maxTextSize`, `securityLevel`, `secure`, `startOnLoad`.
6. The complete list of available options is in Mermaid's `config.type.ts` (https://github.com/mermaid-js/mermaid/blob/master/packages/mermaid/src/config.type.ts).

**Implication for GH-76:**

| Config field | Kroki option | Status |
|---|---|---|
| `deterministicIds` | `deterministic-ids` | ✅ Available — pass as query param |
| `htmlLabels` | `html-labels` | ✅ Available — pass as query param |
| `securityLevel` | — | ❌ Blocked by Kroki; enforced as `strict` by default |

### Appendix B — Evidence of Non-Determinism (from ticket)

Demo repo lock file attachment count across syncs (11 Mermaid diagrams total):

| Commit | Mermaid attachment entries |
|--------|--------------------------|
| 240ccee | 19 |
| 46acf05 | 26 |
| 8935e50 | 30 |
| da93967 | 30 |
| 750e10d | 34 |
| 8ae14ce | 38 |
| b28135c | 42 |
| 7038d2d | 46 |
| 70f8a3d | 51 |
| ea751a0 | 55 |

All 55 hashes are unique — no deduplication across syncs.

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-14 | spec-writer (AI-assisted) | Initial specification |

---

## AUTHORING GUIDELINES

This spec was authored using the following context:

- GitHub Issue #76 (authoritative scope) — read via `gh issue view 76 --json body`
- Feature spec: `doc/spec/features/feature-mermaid-rendering.md` — §3.2 (attachment identity), §3.3 (normalization rules), §5 (AC: attachment reuse)
- ADR-0002: `doc/decisions/ADR-0002-mermaid-rendering-strategy.md` — fallback ladder, security requirements, hash formula
- NFRs: `doc/spec/nonfunctional.md` — NFR-PERF-4 (idempotent rerun)
- Existing implementation reviewed: Kroki adapter, Renderer port, HAST transform, push-flow (KrokiClient instantiation + `finalizeSuccessfulUpdate` additive merge), config types, classifier, page binding, hash helpers, existing Kroki unit tests
- GH-69 spec (the feature being fixed): `doc/changes/2026-07/2026-07-13--GH-69--mermaid-kroki-render/chg-GH-69-spec.md`
- Kroki API documentation: https://docs.kroki.io/kroki/setup/diagram-options/ — research on Mermaid config passing (Appendix A)

Design decisions (DEC-1 through DEC-4) resolve the key questions: `securityLevel` handling (blocked by Kroki, enforced as `strict` by default), A+C combination, SVG normalization approach, and lock pruning semantics.

The spec follows the template at `doc/templates/change-spec-template.md` and the house style from the GH-69 spec.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-76)
- [x] `owners` has at least one entry
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, NFR-, RSK-, DEC-, DM-, OQ-)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details (no file-level code paths, no step-by-step tasks)
- [x] No content duplicated from linked docs
- [x] Front matter validates per front_matter_rules
