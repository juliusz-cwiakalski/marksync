---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: SPEC-MERMAID-RENDERING
status: Current
created: 2026-07-06
last_updated: 2026-07-06
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
links:
  related_changes: []
  decisions: [ADR-0001, ADR-0002]
  contracts: []
---

# Feature Specification: Mermaid Diagram Rendering

> Deterministic in-process Mermaid rendering — no external service dependency.

## 1. Overview

MarkSync renders Mermaid diagram source blocks from Markdown into SVG images
that are attached to the published Confluence page. Rendering is done in-process
using the official Mermaid library, deterministically, so the same input always
produces the same output.

## 2. Business Context

### 2.1 Problem Statement

- **Problem:** Mermaid diagrams in Markdown need to be visible on Confluence.
  External rendering services add latency, cost, and a dependency. Naive
  rendering is non-deterministic (random element IDs) and has security risks
  (CSS/HTML injection).
- **Affected Users:** All users with Mermaid diagrams in their documentation.
- **Business Impact:** In-process rendering eliminates the external dependency;
  determinism enables reliable caching and drift detection.

## 3. Functionality

### 3.1 Capabilities

- **Render Mermaid → SVG:** in-process via official `mermaid` library.
- **Deterministic output:** `deterministicIds: true` ensures stable element IDs;
  same input → same SVG bytes (after normalization).
- **Security:** `securityLevel: "strict"` (encodes HTML, disables click);
  `htmlLabels: false`; SVG sanitized; no external resource loading.
- **Content hashing:** render output is content-hashed for attachment reuse
  (unchanged diagram → reused attachment, no re-upload).
- **Fallback ladder:** if in-process render fails, `code` policy preserves the
  raw code block (MS-0002 fallback per ADR-0002).

### 3.2 Attachment identity

Attachment filename is derived from a deterministic hash:

```
marksync-mermaid-render-v1 + normalized-source + renderer-family/version +
output-format + theme + security-config + font-policy + scale + background
```

Unchanged logical render input → same hash → same attachment → no re-upload.

### 3.3 Edge cases & error handling

- **Malformed Mermaid source:** render fails → fallback to `code` policy
  (preserve block); emit warning.
- **Mermaid security advisory:** `securityLevel: strict` + SVG sanitization;
  adversarial input fixture suite (NFR-SEC-5).
- **Large diagrams:** size guard; warn if render output exceeds threshold.

## 4. Technical Architecture

### 4.1 Design

The renderer runs in a headless DOM environment (happy-dom per TDR-0004) within
the Bun process. The SVG output is extracted, sanitized, and content-hashed.

### 4.2 Core components

| Component | Responsibility |
|---|---|
| MermaidRenderer | Loads official Mermaid, renders source → SVG |
| DOMEnvironment | happy-dom headless environment (TDR-0004) |
| SVGSanitizer | Strips unsafe elements/attributes |
| AttachmentHasher | Deterministic hash for attachment identity |

### 4.3 Key decisions

- **ADR-0001:** TypeScript chosen partly because Mermaid ecosystem is TS-native.
- **ADR-0002:** Official library in-process; `securityLevel: strict`;
  `deterministicIds: true`; fallback ladder (`strict` → `loose` → `code`).
- **TDR-0004:** bun:test + happy-dom for Mermaid-DOM rendering tests.

## 5. Acceptance criteria

- [ ] **Determinism:** same Mermaid source + config → byte-identical normalized
      SVG across runs.
- [ ] **Security:** `securityLevel: strict`; SVG sanitized; no external resource
      loading; adversarial fixtures pass.
- [ ] **Spike-gated:** if ADR-0002 headless render spike fails late, MS-0002
      falls back to `code` policy (preserve code block).
- [ ] **Attachment reuse:** unchanged diagram → same hash → no re-upload.
- [ ] **Fallback:** render failure → `code` policy; warning emitted.

## 6. References

- [ADR-0001](../../decisions/ADR-0001-implementation-language-and-runtime.md)
- [ADR-0002](../../decisions/ADR-0002-mermaid-rendering-strategy.md)
- [TDR-0004](../../decisions/TDR-0004-testing-runner.md)
- [Testing strategy: Mermaid-DOM tier](../../../.ai/rules/testing-strategy.md)
- [NFR-SEC-5: converter injection safety](../nonfunctional.md)
