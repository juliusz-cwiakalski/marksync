---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/tech-stack-template.md
ados_distribution: redistributable
id: TECH-STACK
status: Draft
created: 2026-07-04
last_updated: 2026-07-04
owners: [Juliusz Ćwiąkalski]
area: engineering
document_classification: current-truth
links:
  related_decisions: [ADR-0001, ADR-0002, ADR-0003, ADR-0004, ADR-0005, ADR-0006, ADR-0007, ADR-0008, ADR-0009]
  related_changes: []
  summary: "Tech stack — TypeScript + Bun single-binary CLI; remark/HAST Markdown pipeline; official Mermaid; Confluence Storage Format; local-first, no DB."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Tech Stack

_The stack is selected to satisfy three non-negotiable constraints from
ADR-0001: (1) reuse the official Mermaid library in-process; (2) ship a single
self-contained binary per OS/arch with no mandatory language runtime; (3) cross-
compile to Linux/macOS/Windows × amd64/arm64. The spike (`MS-0001`) proved the
Confluence contract; ADR-0005 settled Storage over ADF._

> **Spike-gated items.** Two entries are explicitly contingent on the ADR-0002
> headless-render spike (`A-FEA-1`, `testing`): the Mermaid in-process render
> path and, transitively, the full justification for TypeScript over Go. If the
> spike fails late, the `MS-0002` fallback is render-failure policy `code`
> (preserve the code block) and full in-process render moves to `MS-0003`
> (`02-roadmap.md`).

## Languages and runtimes

| Language / runtime | Version | Toolchain | Role |
|---|---|---|---|
| TypeScript | 5.x (ESM) | `tsc` / Bun's transpiler | Implementation language for the entire CLI + library |
| Bun | ≥ 1.2 (latest stable) | `bun` runtime + `bun build --compile` | Dev runtime, test runner, and **single-binary compiler** (cross-compile to per-OS/arch executables) |
| Confluence Storage Format (XHTML + `ac:`/`ri:`) | v2 page API | n/a (emitted) | The write target body representation (ADR-0005) |
| YAML / JSON | schema v1 | `ajv` / `zod` | Config, lock file, structured output |

> **Why not Node/Deno as the runtime?** Bun is chosen as the single-binary
> compiler (`build --compile`) per ADR-0001. Deno `compile` is a near-equivalent
> sub-option kept as a fallback (ADR-0001 Unresolved Questions). The codebase
> targets standards-compliant ESM + Web APIs (`fetch`, `crypto.subtle`,
> `WebCrypto`) so it is portable across Bun/Node 24+/Deno with minimal shim.

## Frameworks and libraries

| Library / framework | Version | Role |
|---|---|---|
| `@cliffy/command` + `@cliffy/prompt` (Cliffy) | v1.0.0-rc.7 (pin) | CLI framework: commands, flags, help, completions, interactive prompts (init/doctor). TS-native; Bun-compatible (ADR-0007) |
| `remark` + `remark-gfm` (unified) | latest | Markdown → MDAST parser; GFM table/task-list/strikethrough support |
| `rehype` + `remark-rehype` | latest | MDAST → HAST (HTML AST); the bridge to Storage rendering |
| `jsdom` | latest | Headless DOM for in-process Mermaid `mermaid.render()` (spike-gated, ADR-0002). **Output = SVG** (byte-stable); enable `deterministicIds: true` + fixed `fontFamily` |
| `mermaid` (official npm) | latest | Diagram rendering — the load-bearing dependency justifying TypeScript (ADR-0001/0002) |
| `uuid` (v9+) | latest | UUID v7 generation for document identity (ADR-0006). `crypto.randomUUID()` fallback where v7 is available |
| `ajv` (JSON Schema) | latest | YAML config + lock file schema validation |
| `zod` | latest | Runtime typing for IO boundaries (config, plan, diagnostics) |
| `pino` | latest | Structured logging (redacted, JSON-friendly) |
| `keytar` (or OS-native) | latest | OS keyring credential storage for local users |
| Native `fetch` + `WebCrypto` | platform | HTTP client + hashing; no `axios`/`node-fetch` dependency |
| `bun:test` | built-in | Unit/integration/golden-fixture tests (ADR-0009); thin E2E runner for live-sandbox; vitest+happy-dom only for Mermaid-DOM files if needed |

> **Markdown parser choice rationale.** `remark`/`unified` is the mature TS
> ecosystem standard, gives an AST (MDAST/HAST) for deterministic transforms, and
> the last mile HAST→Storage is a thin visitor (ADR-0005). `marked` was
> considered but lacks a clean AST pipeline. `goldmark` is Go-only and irrelevant
> post-ADR-0001.

## Datastores

| Store | Type | Data owned |
|---|---|---|
| Repository filesystem (YAML) | versioned file | `ProjectConfig`, `TargetConfig`, document selection, hierarchy mapping |
| Repository filesystem (lock file) | versioned file | `PageBinding` map: document UUID → page ID, parent, version, hashes, shared base. Committed; no secrets. (ADR-0006) |
| `.marksync/` (gitignored) | local disposable cache | Rendered bodies, asset cache, journal `<run-id>.jsonl`, conflict workspaces. **Never needed for correctness.** |
| OS keyring | OS-managed secret | API tokens / OAuth refresh tokens (never written to project files) |

> **No database.** MarkSync is local-first with no hosted backend (`01-north-star.md`).
> All durable state lives in version-controlled files (config + lock) or the
> disposable cache. The Confluence Cloud tenant is the remote system of record
> for *pages*; the lock file is MarkSync's shared-base record.

## Infrastructure and DevOps tooling

| Tool | Category | Role |
|---|---|---|
| GitHub Actions | CI-CD | Lint + typecheck + test on push; release matrix on tag |
| Bun `build --compile` | container / packaging | Cross-compile to per-OS/arch single binaries (Linux/macOS/Windows × amd64/arm64) |
| `cyclonedx` / `syft` | SBOM | Software Bill of Materials per release (R-SEC-1 supply-chain control) |
| `osslsigncode` / `codesign` / `notarytool` | signing | Windows Authenticode + macOS notarization (spike-gated, ADR-0001 Unresolved Q; R-FEA-2) |
| GitHub Releases | hosting | Binary artifacts + checksums + SBOM + release notes |
| Git CLI | external prereq | Read committed snapshots, worktree status, renames (spec §9.4). Shell-Git behind the `Repository` interface (ADR-0008). `isomorphic-git` is the swap option if zero-external-binary becomes a hard requirement. |

## Observability stack

| Pillar | Tool | Notes |
|---|---|---|
| Metrics | none (no telemetry) | Local-first OSS; **no** outbound telemetry. Metrics are CLI-derivable from the plan/exec report. |
| Logs / diagnostics | `pino` (structured JSON) + stable diagnostic codes | Redacted by construction (R-SEC-1); machine + human output |
| Run tracing | run ID + journal `<run-id>.jsonl` | Per-run idempotency + partial-apply recovery (`MS-0002` `repair-state`) |
| Exit codes | stable contract | `0` clean; non-zero per error class; machine-parseable |

## Rationale (why each)

- **TypeScript + Bun** — the only stack that runs the official Mermaid library in-process **and** ships a no-runtime single binary (ADR-0001).
- **`remark`/`unified`** — mature AST pipeline; deterministic; the HAST→Storage transform is thin (ADR-0005).
- **`jsdom` + `mermaid`** — official-library fidelity without Chromium (spike-gated; ADR-0002).
- **Native `fetch`/`WebCrypto`** — zero HTTP/crypto dependencies; standards-compliant across runtimes.
- **`ajv`/`zod`** — config/lock schema validation catches user errors before any write.
- **`pino`** — structured, redactable, low-overhead logging.
- **No DB / no telemetry** — local-first, privacy-preserving, sustainable as OSS (A-VIA-1).

## Alternatives considered (trade-off table)

| Choice | Alternative | Why this one | When to switch |
|---|---|---|---|
| TypeScript + Bun | Go + GoReleaser | Reuses official Mermaid in-process (ADR-0001) | If ADR-0002 spike fails AND a pure-Go Mermaid renderer emerges |
| `remark`/`unified` | `marked` | Clean MDAST/HAST AST for deterministic Storage render | If AST pipeline proves too slow for very large docs (unlikely at ≤500 pages) |
| Bun `build --compile` | Deno `compile` | Bun is the recommended compiler in ADR-0001; matures fast | If Bun cross-compile/signing proves unviable (R-FEA-2) |
| In-process Mermaid via `jsdom` | shell-to-`mmdc` | Single-binary promise; no Node/Chromium dep | ADR-0002 spike fails → fallback ladder rung 1 (`mmdc`) |
| Shell-Git behind interface | `isomorphic-git` (pure TS) | 100% feature coverage; Git already a prereq for target users (ADR-0008) | If zero-external-binary becomes a hard requirement (isomorphic-git Bun fs issue permitting) |
| Cliffy (CLI framework) | `commander` / `citty` / `clipanion` | Most feature-complete (prompts+completions); Bun-compatible (ADR-0007) | If Cliffy maintenance stalls and a breaking Bun change forces a fork → Crust |
| `bun:test` | `vitest` / `jest` / `node:test` | Native, fastest, zero-dep, snapshots+mocks (ADR-0009) | If Mermaid-DOM test setup under `bun:test` proves painful → vitest+happy-dom for those files |
| OS keyring (`keytar`) | env-only secrets | Local DX; tokens never in project files | `keytar` native-module friction under Bun compile → env/agent-only |

## Upgrade and compatibility notes

- **Bun** — track latest stable; `build --compile` cross-compile matrix is evolving. Pin per release.
- **`mermaid`** — upstream syntax evolution is tracked automatically by depending on the official library; determinism must be re-verified per major (ADR-0002 C-1).
- **Confluence Cloud REST v2** — subject to Atlassian deprecation; isolated behind the `ConfluenceClient` adapter (A-FEA-6). Nightly live-smoke + weekly deprecation-feed check planned.
- **`jsdom`** — if Mermaid upstream requires browser APIs `jsdom` cannot shim, escalate to fallback ladder rung 1 (ADR-0002).
- **Storage Format** — revisit ADR-0005 if Atlassian removes Storage as a write representation (revisit trigger in ADR-0005).

## Four-risk awareness

- **Value** — the stack delivers the trust wedge (safe publish + drift + Mermaid fidelity); no stack choice compromises the wedge.
- **Usability** — single binary = low setup friction (A-USA-1); Bun binary size (~50–90 MB) is an accepted tradeoff (ADR-0001).
- **Feasibility** — **spike-gated**: ADR-0002 Mermaid headless render (`A-FEA-1`, `testing`) and Bun signing (`A-FEA-2`, `unvalidated`) are the load-bearing unknowns.
- **Viability** — TS + OSS ecosystem is sustainable for a single maintainer; deliberately narrow `MS-0002` matrix (Cloud, one auth path) controls combinatorial support load (A-VIA-2).
