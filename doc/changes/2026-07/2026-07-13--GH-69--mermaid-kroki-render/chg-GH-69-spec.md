---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-69
  type: feat
  status: Proposed
  slug: mermaid-kroki-render
  title: "[MS2-E4] Mermaid SVG rendering via Kroki API — render diagrams as Confluence image attachments (P0 for demo)"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, MS2-E4, mermaid, kroki, remote-rendering, attachments]
  version_impact: minor
  audience: internal
  security_impact: low
  risk_level: medium
  dependencies:
    internal: [MS2-E3-S3 (GH-20 markdown pipeline), MS2-E3-S4 (GH-21 Confluence adapter + TargetSystem port + AttachmentService), MS2-E3-S6 (GH-23 sync engine computePlan/applyPlan), GH-26 (asset pipeline), GH-25 (Mermaid config + code policy)]
    external: [Kroki API (https://kroki.io)]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Enable Mermaid diagram rendering via the public Kroki API, converting code blocks into SVG image attachments on Confluence pages — the "wow" feature for the MS-0002 demo, with privacy-preserving opt-in behavior and deterministic content hashing for attachment reuse.

## 1. SUMMARY

This is the **Mermaid rendering implementation** for MS-0002, delivering the ADR-0002 rung 6 fallback (public Kroki) with opt-in privacy warning. When `render.mermaid.policy` is set to `"render"`, MarkSync discovers Mermaid code blocks in Markdown, sends each to the Kroki API (`POST https://kroki.io/mermaid/svg` with the diagram source as the request body), receives rendered SVG bytes, content-hashes them for deduplication, uploads them as Confluence page attachments with filename `marksync-mermaid-<sha256-24>.svg`, and replaces the code block with an `<ac:image><ri:attachment ri:filename="..."/></ac:image>` reference. The existing GH-26 asset pipeline handles upload/reuse; the `code` policy remains the default (preserves raw code as implemented in GH-25). Network failures fall back gracefully to the code block with a warning; a one-time privacy warning is emitted when rendering against the remote endpoint (NFR-PRIV-2 compliance).

## 2. CONTEXT

### 2.1 Current State Snapshot

- **GH-25 (Mermaid config + code policy) is merged.** The `MermaidPolicy` enum (`"code" | "render" | "skip"`) exists with `"code"` as the default. Mermaid fences are preserved as `<ac:structured-macro ac:name="code">` with `language=mermaid`. Golden + adversarial fixtures prove injection safety.
- **GH-20 (markdown pipeline) is merged.** `parseMarkdown` → `mdastToHast` produces HAST where Mermaid fences are `element` nodes with `tagName: "pre"`, containing a `code` child with `className: ["language-mermaid"]` and the diagram source as `text` content.
- **GH-21 (Confluence adapter + TargetSystem port) is merged.** The `AttachmentService` implements `uploadAttachment`/`attachmentExists`/`listAttachments` and dedups by hash. `Artifact` has an optional `kind?: "asset" | "mermaid"` marker. The naming function `attachmentFilename()` produces `marksync-mermaid-<hash>.svg` for `kind === "mermaid"`.
- **GH-26 (asset pipeline) is merged.** `AssetResolver` walks HAST for `<img>` nodes, resolves local paths content-addressed, populates `PlanEntry.assets`, and `uploadAssets()` in `applyPlan` handles upload/reuse. The same pattern applies to Mermaid artifacts.
- **GH-23 (sync engine) is merged.** `computePlan` runs `mdastToHast` then `assetResolver.resolve`, then `target.renderBody`. `applyPlan` calls `uploadAssets` after Create/Update. The `PlanEntry.assets` array carries artifacts.
- **The MS-0001 spike validated Kroki API reachability.** `POST https://kroki.io/mermaid/svg` with diagram source as text body returns SVG; reachable with HTTP 200. This is the primary render path for this change.
- **No mermaid-specific HAST transform exists today.** Mermaid fences pass through unchanged to `renderStorage`, which emits them as code macros (per GH-25).

### 2.2 Pain Points / Gaps

- **Mermaid diagrams are not visual on Confluence.** The `code` policy (GH-25) preserves the raw source, but users expect rendered diagrams — especially for demos. The "wow" factor is missing.
- **The `render` policy is a no-op.** The config value exists, but nothing implements rendering. Enabling it has no effect.
- **In-process rendering failed in the GH-11 spike.** happy-dom/jsdom lack an SVG layout engine (`getBBox` returns zeros), so the ADR-0002 Part B design target is not viable for MS-0002. We must descend the fallback ladder.
- **External rendering carries privacy risk.** Sending diagram content to a remote service (Kroki) must be opt-in only (NFR-PRIV-2 / ADR-0002 C-3). This is not enforced today.
- **No deterministic mermaid artifact identity.** Without content hashing, the same diagram would re-upload on every run (violating NFR-PERF-4 idempotency). The hash formula from ADR-0002 exists but is not wired.

## 3. PROBLEM STATEMENT

Because the `render` policy is unimplemented and in-process rendering is blocked by the GH-11 spike outcome (happy-dom/jsdom lack SVG layout engine), Mermaid diagrams in Markdown cannot appear as rendered images on Confluence under MS-0002, which blocks the demo value and the expected user experience. Until this story delivers a Kroki API-based renderer that respects the privacy opt-in requirement (NFR-PRIV-2), content-addresses SVG output for reuse, integrates with the GH-26 asset pipeline, and falls back to the code block on network failure, the `render` policy remains a no-op.

## 4. GOALS

- **G-1**: Deliver Kroki-based Mermaid rendering — discover `language-mermaid` fences, render via `POST https://kroki.io/mermaid/svg`, produce SVG bytes, hash them, and build `Artifact { bytes, mime: "image/svg+xml", hash, kind: "mermaid" }` (F-1).
- **G-2**: Wire the mermaid transform into `computePlan` — run after `mdastToHast` and before `target.renderBody`, only when `config.render.mermaid.policy === "render"`. Build `Artifact[]` and populate `ContentHash.attachmentHashes` (F-2).
- **G-3**: Integrate with GH-26 asset pipeline — `applyPlan` uploads mermaid artifacts via the existing `uploadAssets()` path, reuses via `attachmentExists`, and merges hashes into `PageBinding.attachmentHashes` (F-3).
- **G-4**: Content-hashed deduplication — same Mermaid source → same Kroki output → same `sha256` → same filename `marksync-mermaid-<first-24-hex>.svg` → reused on subsequent runs (0 re-uploads, NFR-PERF-4) (F-4).
- **G-5**: Privacy compliance — emit a one-time warning when `render.mermaid.policy === "render"` is active against the public Kroki endpoint (NFR-PRIV-2 / ADR-0002 C-3). The default (`code`) sends no content remotely (F-5).
- **G-6**: Graceful fallback on network failure — Kroki HTTP errors → fall back to code block + warning; never silently drop a diagram (ADR-0002 C-2) (F-6).
- **G-7**: Determinism — same source + Kroki version → stable SVG output; hash-based identity enables idempotency (F-4).
- **G-8**: `bun run check` green.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Mermaid render activation | `render.mermaid.policy: render` → diagrams render as `<ac:image>` with mermaid attachment; `code`/`skip` unchanged |
| Attachment reuse (NFR-PERF-4) | unchanged diagram → `attachmentExists` true → **0** `uploadAttachment` calls (asserted via mock target) |
| Determinism | same Mermaid source → same SVG hash → same filename; unchanged across runs |
| Privacy warning (NFR-PRIV-2) | `render.mermaid.policy: render` → one-time warning "Mermaid rendering sends diagram content to Kroki API (https://kroki.io) — review privacy policy before use"; no warning for `code`/`skip` |
| Network fallback | Kroki HTTP error → code block emitted + warning containing the HTTP status |
| Attachment dedup | multiple identical mermaid fences in one doc → one `Artifact` → one upload |
| Pipeline integration | doc with mermaid fence → Storage body contains `<ri:attachment ri:filename="marksync-mermaid-<hash>.svg"/>`; attachment exists after apply |
| quality gate | `bun run check` exits **0** |

### 4.2 Non-Goals

- **NG-1**: mmdc CLI implementation in this change. The ticket lists it as a fallback, but this story delivers Kroki as the primary render path. Design the `Renderer` port to be swappable, but do not wire mmdc unless it's low-cost (document the recommendation).
- **NG-2**: Self-hosted Kroki configuration. Forward-compatible but not in scope; this change uses the public `https://kroki.io` endpoint.
- **NG-3**: SVG sanitization. Kroki is trusted for MS-0002; adversarial payload handling is out of scope (deferred to MS-0003+ per ADR-0002 Security Requirements).
- **NG-4**: Reimplementing the GH-26 asset pipeline. Reuse the existing `uploadAssets()`, `attachmentExists()`, `Artifact` shape, and `PlanEntry.assets` wiring.
- **NG-5**: Reimplementing `codeMacro` or the `code` policy behavior. GH-25 already delivers this; unchanged.
- **NG-6**: PNG output. SVG is the output format for this change (matches ADR-0002 §"Output format (SVG vs PNG)").
- **NG-7**: In-process headless rendering (deferred to MS-0003+ per CEO-DEC-1 and the GH-11 spike outcome).

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Kroki-based Mermaid renderer | HTTP adapter that POSTs diagram source to `https://kroki.io/mermaid/svg` and returns `Artifact { bytes, mime, hash, kind: "mermaid" }`. The render adapter (infra tier). |
| F-2 | Mermaid HAST transform | Walks HAST for `pre > code.language-mermaid`, renders via Kroki, replaces the fence with an `img` node (so `imageMacro` emits `<ri:attachment>`). Only active when policy === `"render"`. The domain-side orchestration. |
| F-3 | `computePlan` mermaid wiring | Run the mermaid transform after `mdastToHast` and before `target.renderBody`; populate `ContentHash.attachmentHashes` and `PlanEntry.assets`. |
| F-4 | Content hashing and naming | Hash SVG bytes via sha256; filename is `marksync-mermaid-<first-24-hex>.svg`. Enables dedup and reuse (0 re-uploads on unchanged diagrams). |
| F-5 | Privacy warning emission | Emit one-time warning when `render.mermaid.policy === "render"` is active. Satisfies NFR-PRIV-2 / ADR-0002 C-3. |
| F-6 | Network fallback handling | Kroki HTTP errors → fall back to emitting the original code block + warning. Satisfies ADR-0002 C-2 (no silent failure). |

### 5.1 Capability Details

- **F-1 (Kroki-based Mermaid renderer).** An HTTP adapter at `src/infra/mermaid/kroki.ts` exposing `render(source: string): Promise<Result<Artifact, MarkSyncError>>`:
  - `POST https://kroki.io/mermaid/svg` with `source` as `text/plain` body.
  - On HTTP 200: read response bytes as `Uint8Array`, compute `sha256` hash, build `Artifact { bytes, mime: "image/svg+xml", hash, kind: "mermaid" }`, return `ok(artifact)`.
  - On HTTP error (4xx/5xx): return `err({ kind: "RemoteUnreachable", ... })` (mapped to the existing error kind; carries the status and URL).
  - On network timeout/DNS failure: return `err({ kind: "RemoteUnreachable", ... })`.
  - Timeouts: use a sensible default (e.g., 30s) to avoid indefinite hangs.
  - This is an infra-tier adapter because it performs HTTP I/O (per architecture module-governance rules).

- **F-2 (Mermaid HAST transform).** A domain service at `src/domain/mermaid/transform.ts` (or similar) with `transform(hast: Root, config: MermaidRenderConfig, renderer: Renderer): Promise<Result<{ artifacts: Artifact[]; transformedHast: Root }, MarkSyncError>>`:
  - Walks the HAST for `pre > code` elements where `className` includes `"language-mermaid"`.
  - If `config.policy === "code"` or `config.policy === "skip"` → skip (no change; `codeMacro` will preserve the fence as-is).
  - If `config.policy === "render"`:
    - For each mermaid fence, extract the diagram source (text content of the `code` element).
    - Call `renderer.render(source)`.
    - On success: build an `img` node with `properties.src` set to the mermaid filename (`marksync-mermaid-<hash>.svg` from F-4) and `properties.alt` set to "Mermaid diagram". Replace the original `pre` element with this `img` node.
    - On failure (`RemoteUnreachable`): keep the original `pre` element unchanged (so it renders as code) and emit a warning (via the Result warning path or a separate warnings array).
  - Dedup within a doc: if the same source appears multiple times, reuse the same `Artifact` (hash-based dedup).
  - Return `ok({ artifacts, transformedHast })` where `transformedHast` is the modified HAST.

- **F-3 (`computePlan` mermaid wiring).** In `computePlan` (`src/app/push-flow.ts`):
  - After `mdastToHast` and **before** `target.renderBody`, check `config.render.mermaid.policy`.
  - If `"render"`:
    - Construct the Kroki renderer adapter (injectable for tests).
    - Call the mermaid transform with the HAST, config, and renderer.
    - On `RemoteUnreachable` → treat as a per-document warning (don't abort the plan; the transform falls back to code).
    - On success: merge the mermaid `artifacts` into `entry.assets` (append to existing assets from `AssetResolver` if present), use the `transformedHast` for `target.renderBody`, and populate `ContentHash.attachmentHashes` from the mermaid artifacts (filename → hash).
  - If `"code"` or `"skip"` → no mermaid transform; assets remain empty; mermaid fences render as code blocks (existing behavior).
  - The privacy warning (F-5) is emitted once per run when the mermaid transform is active with the remote Kroki endpoint (e.g., via a `console.warn` or collected into `plan.warnings`).

- **F-4 (Content hashing and naming).**
  - Hash: compute full sha256 hex of the SVG bytes returned by Kroki (using `crypto.subtle` like GH-26).
  - Filename: `marksync-mermaid-<first-24-hex>.svg` where `<first-24-hex>` is the first 24 characters of the full hash.
  - Lookup: `attachmentExists(pageId, hash)` uses the **full** hash (the existing GH-26 pattern). The truncated form is only for display/filename.
  - This is parallel to GH-26: hash full bytes for lookup, truncate for filename.
  - The `Artifact.kind` marker is `"mermaid"` to gate the `marksync-mermaid-` prefix (per GH-26 DEC-1).

- **F-5 (Privacy warning emission).** When `config.render.mermaid.policy === "render"`:
  - Emit a one-time warning: "Mermaid rendering sends diagram content to Kroki API (https://kroki.io) — review privacy policy before use."
  - This warning appears once per run (not per diagram) and is surfaced in the output (e.g., via `plan.warnings` or `console.warn`).
  - This satisfies NFR-PRIV-2 ("Any path sending diagram content to a remote service is off by default with a warning") and ADR-0002 C-3.

- **F-6 (Network fallback handling).** When the Kroki renderer returns `RemoteUnreachable`:
  - The mermaid transform does NOT replace the original `pre` element; it remains as-is.
  - The `target.renderBody` step will emit it as a code block (existing `codeMacro` behavior).
  - A warning is surfaced (e.g., "Mermaid render failed for diagram at <sourcePath>: <error> — falling back to code block").
  - This ensures no silent failure (ADR-0002 C-2).

## 6. USER & SYSTEM FLOWS

```
Flow 1 — computePlan with mermaid `render` policy (Kroki primary):
  for each discovered doc:
    parseMarkdown(bytes) → mdastToHast → hast
    assetResolver.resolve(hast, docPath) → assets for local images
    if config.render.mermaid.policy === "render":
      mermaidTransform(hast, config, krokiRenderer):
        for each pre>code.language-mermaid:
          source = code.textContent
          krokiRenderer.render(source):
            POST https://kroki.io/mermaid/svg → SVG bytes
            hash = sha256(bytes)
            artifact = Artifact{bytes, mime:"image/svg+xml", hash, kind:"mermaid"}
            filename = marksync-mermaid-<first-24(hash)>.svg
            artifacts.push(artifact)
            replace pre with img(src=filename, alt="Mermaid diagram")
          on RemoteUnreachable:
            keep pre unchanged → will render as code
            warn("Mermaid render failed: <error> — falling back to code block")
      → { artifacts: Artifact[], transformedHast }
      merge mermaid artifacts into PlanEntry.assets
      hast = transformedHast
      populate ContentHash.attachmentHashes from mermaid artifacts
    else (code/skip policy):
      no mermaid transform; assets remain empty
    target.renderBody(hast) → { body, hash, warnings }
    buildContentHash({ ..., attachmentHashes })
  → Plan emitted; 0 writes.

Flow 2 — applyPlan Create with mermaid artifacts:
  target.createPage(...) → Page (page now exists)
  uploadAssets(pageId, entry.assets):
    for each artifact in entry.assets (local + mermaid):
      target.attachmentExists(pageId, artifact.hash)?
        true  → skip (reuse — 0 writes)
        false → target.uploadAttachment(pageId, artifact) → AttachmentRef
  binding.attachmentHashes = { filename→hash } (mermaid + local merged)
  journal{op:"create"} → saveLock → putProperty

Flow 3 — Idempotent rerun (NFR-PERF-4, mermaid reuse):
  second push, mermaid source unchanged:
    krokiRenderer.render → same SVG bytes → same hash → same filename
    attachmentExists(hash)? true → skip (0 uploads)
    classify → NO_CHANGE (if body also unchanged) or LOCAL_AHEAD (if only mermaid changed)
    applyPlan skips → 0 writes, 0 uploads

Flow 4 — Network failure fallback:
  krokiRenderer.render → RemoteUnreachable (HTTP 5xx / DNS fail)
    transform keeps original pre element
    renderBody emits code macro with language=mermaid
    warning: "Mermaid render failed: <error> — falling back to code block"
    no mermaid Artifact → no upload attempt

Flow 5 — Privacy warning (NFR-PRIV-2):
  first doc with config.render.mermaid.policy === "render":
    emit warning: "Mermaid rendering sends diagram content to Kroki API (https://kroki.io) — review privacy policy before use."
    subsequent docs in same run → no repeat warning
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Kroki HTTP adapter at `src/infra/mermaid/kroki.ts` — `render(source) → Result<Artifact, MarkSyncError>` (F-1).
- Mermaid HAST transform at `src/domain/mermaid/` — discover fences, render via adapter, replace with img, fallback on error (F-2, F-6).
- `computePlan` wiring — run transform when policy === `"render"`; populate `ContentHash.attachmentHashes`; merge mermaid artifacts into `PlanEntry.assets` (F-3).
- Content hashing and naming — sha256 of SVG bytes; filename `marksync-mermaid-<first-24-hex>.svg` (F-4).
- Privacy warning — one-time warning when `render` policy active (F-5).
- Network fallback — code block emission on `RemoteUnreachable` + warning (F-6).
- Integration with GH-26 asset pipeline — `uploadAssets` handles mermaid artifacts; dedup via `attachmentExists`.
- Unit tests: Kroki HTTP adapter (mock fetch), mermaid transform (fence→img, fallback), content hashing.
- Integration tests: transform + mock Kroki adapter + mock target upload/reuse; network failure fallback; privacy warning emitted.

### 7.2 Out of Scope

- [OUT] mmdc CLI implementation (NG-1) — design `Renderer` port to be swappable, but do not wire mmdc in this change.
- [OUT] Self-hosted Kroki configuration — uses public `https://kroki.io` only.
- [OUT] SVG sanitization — Kroki trusted for MS-0002 (NG-3).
- [OUT] Reimplementing GH-26 asset pipeline — reuse existing `uploadAssets`, `Artifact`, `PlanEntry.assets` (NG-4).
- [OUT] PNG output — SVG only (NG-6).
- [OUT] In-process headless rendering — deferred to MS-0003+ (NG-7).
- [OUT] Mermaid source normalization beyond what Kroki provides.

### 7.3 Deferred / Maybe-Later

- **mmdc CLI adapter** — implement as a swappable `Renderer` adapter if low-cost or if users request local-only rendering.
- **Self-hosted Kroki** — configurable endpoint URL for privacy-sensitive environments.
- **SVG sanitization** — for MS-0003+ per ADR-0002 Security Requirements.
- **Per-diagram render options** — theme, scale, background via config (ADR-0002 hash formula includes these).

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

| Endpoint | Method | Request | Response | Error handling |
|----------|--------|---------|----------|----------------|
| `https://kroki.io/mermaid/svg` | POST | `Content-Type: text/plain`; body = Mermaid source | `Content-Type: image/svg+xml`; body = SVG bytes | HTTP 4xx/5xx → `RemoteUnreachable`; network error → `RemoteUnreachable`; timeout → `RemoteUnreachable` |

### 8.2 Events / Messages

No event bus. The conceptual **Mermaid Rendered** and **Mermaid Render Failed (fallback)** signals are realized as typed values in the transform result and surfaced via warnings in the plan output.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `Artifact.kind` marker (USED) | Existing optional field `kind?: "asset" | "mermaid"` (GH-26). Mermaid artifacts use `kind: "mermaid"` to gate the `marksync-mermaid-` prefix. |
| DM-2 | `ContentHash.attachmentHashes` (POPULATED) | Already exists (GH-22); this story populates it from mermaid artifacts (filename → hash). |
| DM-3 | `PageBinding.attachmentHashes` (POPULATED) | Already exists (GH-19); this story persists mermaid artifact hashes into it via `uploadAssets` merge. |
| DM-4 | `PlanEntry.assets` (POPULATED) | Already exists (GH-26); this story appends mermaid `Artifact[]` to it. |
| DM-5 | Mermaid naming (NEW) | Filename helper: `mermaidFilename(hash: string) → "marksync-mermaid-<first-24-hex>.svg"`. |
| DM-6 | `Renderer` port (NEW, domain/mermaid/port.ts) | `render(source: string): Promise<Result<Artifact, MarkSyncError>>`. Generic renderer contract; Kroki adapter implements it. |

### 8.4 External Integrations

- **Kroki API** — `POST https://kroki.io/mermaid/svg`. Public endpoint, no auth. Diagram source sent as plain-text body. Privacy risk addressed by opt-in + warning (NFR-PRIV-2 / ADR-0002 C-3).
- **No changes to Confluence integration** — reuses the existing `TargetSystem` port and `AttachmentService` (GH-21) via `uploadAssets` (GH-26).

### 8.5 Backward Compatibility

N/A for released artifacts (MS-0002 is pre-release). This story is **additive**: new infra adapter, new domain transform, new `computePlan` call site, new `Renderer` port. The `code`/`skip` policies remain unchanged; the default (`code`) sends no content remotely. Existing GH-26 asset pipeline and `TargetSystem` port are **unchanged**.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | Mermaid render activation (F-2) | `render.mermaid.policy: render` → diagrams render as `<ac:image>`; `code`/`skip` unchanged |
| NFR-2 | Attachment reuse (NFR-PERF-4, F-4) | unchanged diagram → `attachmentExists` true → **0** `uploadAttachment` calls (asserted via mock target) |
| NFR-3 | Determinism (F-4) | same Mermaid source → same SVG hash → same filename; stable across runs |
| NFR-4 | Privacy warning (NFR-PRIV-2, F-5) | `render.mermaid.policy: render` → one-time warning emitted; no warning for `code`/`skip` |
| NFR-5 | Network fallback (ADR-0002 C-2, F-6) | Kroki HTTP error → code block emitted + warning; never silent drop |
| NFR-6 | Per-document isolation (carry-over) | a `RemoteUnreachable` on one doc's mermaid fences → that doc falls back to code; the run continues |
| NFR-7 | Timeout safety | Kroki HTTP request times out after ~30s → `RemoteUnreachable` + fallback |
| NFR-8 | No secrets in output (INV-SEC-1 / NFR-SEC-1) | **0** credential/token occurrences in plan JSON, apply report, or rendered bodies (diagram source may contain secrets — this is user data; but no MarkSync secrets) |
| NFR-9 | Quality gate | `bun run check` exits **0** |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No product telemetry (NFR-SEC-3). Observability is structural:

- **`CommandResult<Plan>` / `CommandResult<ApplyReport>`** — unchanged envelope; plan warnings include privacy warning + render-failure warnings.
- **Mermaid attachment filenames as provenance** — `marksync-mermaid-<hash>.svg` is a content-addressed, reviewable dedup key visible in Confluence.
- **Plan JSON** — `PlanEntry.assets` (when present) makes the resolved mermaid artifact set reviewable in the dry-run plan before any write (plan-before-write, NFR-OBS-5).

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Mermaid source contains secrets, sent to public Kroki | H | M | Privacy warning (NFR-PRIV-2 / F-5) warns user; `render` is opt-in, `code` is default; review policy before use. | L |
| RSK-2 | Kroki API unavailable or rate-limited → all diagrams fall back to code | M | M | Graceful fallback to code block + warning (F-6); per-document isolation (run continues). | L |
| RSK-3 | Non-deterministic SVG output from Kroki → different hashes on each run → no reuse (violates NFR-PERF-4) | M | L | Assume Kroki is deterministic for MS-0002 (validated via manual test); if not, this is a Kroki bug, not MarkSync. Document assumption. | M |
| RSK-4 | Mermaid transform runs in wrong order → `imageMacro` doesn't pick up the `img` node | M | L | Spec requires transform runs AFTER `mdastToHast` and BEFORE `target.renderBody`; test validates order. | L |
| RSK-5 | Mermaid `Artifact.kind` marker collision with user-authored SVG | M | L | User-authored SVG uses `kind: "asset"` (GH-26) → `marksync-asset-` prefix; mermaid uses `kind: "mermaid"` → `marksync-mermaid-` prefix. Prefix collision resolved by DEC-1. | L |
| RSK-6 | Privacy warning missing or per-diagram → noise | L | M | Emit warning once per run (not per diagram) when `render` policy is active. | L |
| RSK-7 | Network timeout hangs the run | M | L | Use ~30s timeout on Kroki HTTP request; map timeout to `RemoteUnreachable` + fallback. | L |

## 12. ASSUMPTIONS

- The public Kroki API (`https://kroki.io/mermaid/svg`) is available and stable for MS-0002 demo purposes.
- Kroki returns deterministic SVG output for a given Mermaid source (validated via manual test for this milestone).
- Users review the Kroki privacy policy before enabling `render.mermaid.policy: render` (privacy warning ensures awareness).
- The `Renderer` port is designed to be swappable, but this change only implements the Kroki adapter; mmdc is out of scope.
- The GH-26 asset pipeline (`uploadAssets`, `attachmentExists`) correctly handles mermaid artifacts (same `Artifact` shape, only `kind` differs).

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | MS2-E3-S3 (GH-20 markdown pipeline) | `mdastToHast` produces HAST with mermaid fences. Merged. |
| Depends on | MS2-E3-S4 (GH-21 Confluence adapter) | `AttachmentService`, `TargetSystem` port, `Artifact.kind` marker, `attachmentFilename()`. Merged. |
| Depends on | MS2-E3-S6 (GH-23 sync engine) | `computePlan`, `applyPlan`, `PlanEntry.assets`. Merged. |
| Depends on | GH-26 (asset pipeline) | `uploadAssets`, `attachmentExists`, `PlanEntry.assets` wiring. Merged. |
| Depends on | GH-25 (Mermaid config + code policy) | `MermaidPolicy` enum, `code` policy default. Merged. |
| Depends on | ADR-0002 | Fallback ladder (rung 6 = public Kroki, opt-in with privacy warning), hash formula, SVG default. |
| Depends on | NFR-PRIV-2 | Privacy requirement: remote rendering off by default with warning. |
| Reuses | `TargetSystem` port | No changes to `uploadAttachment`/`attachmentExists`/`listAttachments`. |
| Blocks | E5-S1 (BDD + E2E) | Live-sandbox mermaid rendering + upload is an E5-S1 E2E scenario. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Exact Kroki timeout value | Spec suggests ~30s; needs to be tuned based on real-world latency. Non-blocking. | Open (resolved at planning) |
| OQ-2 | Should mmdc be implemented in this change? | Ticket lists it as fallback, but `NG-1` recommends deferring unless low-cost. | Open (recommendation: defer) |
| OQ-3 | How to emit the privacy warning? | Via `plan.warnings` or `console.warn`? Needs consistency with existing warning patterns. | Open (resolved at planning) |

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | Replace mermaid `pre` with `img` node (not `raw` XHTML) | Cleaner integration: `imageMacro` already emits `<ac:image><ri:attachment ri:filename="..."/>` for `<img>` nodes. `raw` node would duplicate that logic. | 2026-07-13 |
| DEC-2 | Kroki adapter lives in `src/infra/mermaid/kroki.ts` | Infra tier because it performs HTTP I/O; respects ports-and-adapters layering. | 2026-07-13 |
| DEC-3 | Mermaid transform lives in `src/domain/mermaid/` | Domain tier because it orchestrates the renderer and transforms HAST (adapter-agnostic logic). | 2026-07-13 |
| DEC-4 | Hash: full sha256 for lookup, truncated to 24 chars for filename | Parallel to GH-26 pattern: full hash for dedup lookup, truncated for display. | 2026-07-13 |
| DEC-5 | mmdc CLI deferred (not implemented in this change) | Low priority for MS-0002 demo; Kroki is the primary path. Design `Renderer` port for swappability, but don't wire mmdc. | 2026-07-13 |
| DEC-6 | Privacy warning emitted once per run (not per diagram) | Avoids noise; user only needs to see it once per run when `render` policy is active. | 2026-07-13 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| `src/infra/mermaid/kroki.ts` | NEW — Kroki HTTP adapter (F-1) |
| `src/domain/mermaid/transform.ts` | NEW — Mermaid HAST transform (F-2, F-6) |
| `src/domain/mermaid/port.ts` | NEW — `Renderer` port interface (DM-6) |
| `src/app/push-flow.ts` | UPDATED — `computePlan` wiring: run mermaid transform when policy === `"render"` (F-3) |
| `src/domain/assets/naming.ts` | UPDATED — add `mermaidFilename(hash)` helper (DM-5) |
| `src/domain/config/types.ts` | NO CHANGE — `MermaidPolicy` enum exists (GH-25) |
| `src/infra/confluence/attachments.ts` | NO CHANGE — reuses existing `AttachmentService` |
| `src/infra/confluence/render/storage.ts` | NO CHANGE — reuses existing `imageMacro` |

## 17. ACCEPTANCE CRITERIA

Each AC is testable and traces to a ticket AC + F/NFR.

- **AC-1 (render activation, ticket AC):** A Markdown doc with a mermaid fence and `render.mermaid.policy: render` → the Confluence Storage body contains `<ac:image><ri:attachment ri:filename="marksync-mermaid-<hash>.svg"/></ac:image>`; the attachment exists on the page after apply. (Traces to F-1, F-2, F-3, ticket AC #1)
- **AC-2 (attachment dedup, ticket AC):** An unchanged mermaid diagram (same source) across two runs → `attachmentExists(pageId, hash)` returns true on the second run → **0** `uploadAttachment` calls (asserted via mock target). (Traces to F-4, NFR-2, ticket AC #2)
- **AC-3 (policy activation, ticket AC):** `render.mermaid.policy: render` activates rendering; `render.mermaid.policy: code` preserves raw code as `<ac:structured-macro ac:name="code">` with `language=mermaid`. (Traces to F-2, F-5, ticket AC #3)
- **AC-4 (network fallback, ticket AC):** A network failure on Kroki API → the original mermaid fence is emitted as a code block + a warning is surfaced (no `ac:image`, no upload attempt). (Traces to F-6, NFR-5, ticket AC #4)
- **AC-5 (determinism, ticket AC):** Same mermaid source → same SVG bytes → same hash → same filename `marksync-mermaid-<first-24-hex>.svg` across runs. (Traces to F-4, NFR-3, ticket AC #5)
- **AC-6 (privacy warning, NFR-PRIV-2):** `render.mermaid.policy: render` → one-time warning "Mermaid rendering sends diagram content to Kroki API (https://kroki.io) — review privacy policy before use" is emitted; `code`/`skip` → no warning. (Traces to F-5, NFR-4, NFR-PRIV-2)
- **AC-7 (quality gate):** `bun run check` exits **0**. (Traces to NFR-9)

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Delivery order:** Implement Kroki adapter → implement mermaid transform → wire into `computePlan` → test → commit.
- **Merge strategy:** PR against `main`; review ensures F-1–F-6 are satisfied.
- **Communication:** The `render.mermaid.policy: render` setting is opt-in; the privacy warning ensures users are aware before enabling. Demo documentation should highlight this feature.
- **Adoption notes:** Users must explicitly set `render.mermaid.policy: render` to activate; the default (`code`) remains safe and local-only.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

No data migration. This is additive; existing pages remain unchanged. Only pages with mermaid fences and `render.mermaid.policy: render` will have new mermaid attachments uploaded.

## 20. PRIVACY / COMPLIANCE REVIEW

**Privacy risk:** Mermaid diagram content is sent to the public Kroki API (`https://kroki.io`) when `render.mermaid.policy: render` is active.

**Mitigation:**
- The `render` policy is opt-in; the default is `code` (no remote rendering).
- A one-time privacy warning is emitted when `render` is active (F-5, NFR-PRIV-2, ADR-0002 C-3).
- Users review the Kroki privacy policy before enabling.

**Compliance:** Satisfies NFR-PRIV-2 ("Any path sending diagram content to a remote service is off by default with a warning").

## 21. SECURITY REVIEW HIGHLIGHTS

- **Injection safety:** Mermaid source is rendered by Kroki, a trusted external service. For MS-0002, we assume Kroki does not execute malicious input in a way that affects the MarkSync process. SVG sanitization is out of scope (NG-3, deferred to MS-0003+).
- **No secrets in output (INV-SEC-1 / NFR-SEC-1):** Mermaid source may contain secrets (user data), but MarkSync secrets (tokens, credentials) are never leaked into rendered bodies, plan JSON, or apply reports.
- **Network security:** HTTPS only to Kroki; no auth required. Timeout prevents hangs.
- **Path traversal:** Not applicable (mermaid source is text, not a file path).

## 22. MAINTENANCE & OPERATIONS IMPACT

- **Ongoing dependencies:** Relies on public Kroki API availability. If Kroki deprecates the endpoint, `RemoteUnreachable` fallback ensures diagrams render as code blocks.
- **Monitoring:** No product telemetry; users report issues via logs (warnings surface fallback behavior).
- **Future extensions:** Self-hosted Kroki configuration (endpoint URL) is forward-compatible but not in scope; mmdc adapter can be added later via the `Renderer` port.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Mermaid | A text-based diagramming syntax (https://mermaid.js.org). |
| Kroki | An HTTP-based diagram rendering service (https://kroki.io) that supports Mermaid among other formats. |
| `render` policy | Mermaid render mode that sends source to Kroki and renders as SVG image attachments. |
| `code` policy | Mermaid render mode that preserves the raw source as a code block (default, safe). |
| `Artifact` | A binary attachment (bytes, mime, hash, optional `kind` marker) for upload to Confluence. |
| Content hash | sha256 hex of artifact bytes; used for dedup lookup. |
| Mermaid filename | `marksync-mermaid-<first-24-hex>.svg`; derived from the content hash. |
| Privacy warning | One-time warning emitted when `render.mermaid.policy: render` is active, informing the user that diagram content is sent to Kroki. |

## 24. APPENDICES

None.

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | spec-writer (AI-assisted) | Initial specification |

---

## AUTHORING GUIDELINES

This spec was authored using the mandatory context from the planning session:
- Story file: `doc/planning/milestones/MS-2/MS2-E4--features/MS2-E4-S1--mermaid-rendering.md`
- Feature spec: `doc/spec/features/feature-mermaid-rendering.md`
- ADR-0002: `doc/decisions/ADR-0002-mermaid-rendering-strategy.md`
- NFRs: `doc/spec/nonfunctional.md`
- Existing implementation: `src/domain/config/types.ts`, `src/domain/target/port.ts`, `src/domain/assets/resolver.ts`, `src/domain/assets/naming.ts`, `src/domain/markdown/mdast-to-hast.ts`, `src/domain/render/canonicalize.ts`, `src/infra/confluence/render/storage.ts`, `src/app/push-flow.ts`

Design decisions (DEC-1 through DEC-6) resolve the key questions from the ticket, including: where components live, how the HAST transform integrates, hash strategy, mmdc deferral, and privacy warning handling.

The spec follows the template at `doc/templates/change-spec-template.md` and the house style from `doc/changes/2026-07/2026-07-13--GH-26--attachments-images/chg-GH-26-spec.md`.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-69)
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