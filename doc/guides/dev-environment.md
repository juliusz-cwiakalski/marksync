---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: redistributable
id: DEV-ENVIRONMENT
status: Draft
created: 2026-07-05
last_updated: 2026-07-05
owners: [Juliusz Ćwiąkalski]
area: engineering
document_classification: current-truth
links:
  related_decisions: [ADR-0001, TDR-0002, TDR-0003, TDR-0004]
  related_changes: []
  summary: "Developer environment setup guide — prerequisites, install, scripts, and common workflows for MarkSync contributors."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Developer Environment Setup

_How to set up a local development environment for MarkSync. Target audience:
contributors and the maintainer. Covers prerequisites, installation, common
workflows, and troubleshooting._

## Prerequisites

| Tool | Version | Purpose | Required? |
|---|---|---|---|
| **Bun** | ≥ 1.2 (latest stable) | Runtime, package manager, test runner, single-binary compiler | **Yes** |
| **Git** | ≥ 2.30 | Version control; MarkSync's external prerequisite (TDR-0003) | **Yes** |
| **Node.js** | ≥ 22 (optional) | Fallback runtime for non-Bun environments; type-checking with `tsc` | Optional |
| **OS** | Linux or macOS (dev); Linux + Windows (target `MS-0002`) | Dev environment | Dev: any; `MS-0002` target: Linux + Windows |

### Installing Bun

```bash
# Linux / macOS
curl -fsSL https://bun.sh/install | bash

# Windows
powershell -c "irm bun.sh/install.ps1 | iex"

# Verify
bun --version
```

## Setup

```bash
# 1. Clone
git clone https://github.com/juliusz-cwiakalski/marksync.git
cd marksync

# 2. Install dependencies
bun install

# 3. Verify the toolchain
bun run lint
bun run typecheck
bun test tests/unit/ tests/integration/ tests/golden/
bun run test:bdd

# 4. (Optional) Set up local credentials for live testing
cp .env.example .env.local
# Edit .env.local with your Confluence credentials
```

## Common scripts

_These scripts will be defined in `package.json` at `MS-0002` implementation
start. They are documented here as the target contract._

| Script | Command | Purpose |
|---|---|---|
| `bun run lint` | Linter check | CI gate; fails on lint errors |
| `bun run format` | Formatter write | Auto-format code |
| `bun run format:check` | Formatter check | CI gate; fails on unformatted code |
| `bun run typecheck` | `tsc --noEmit` or `bun tsc --noEmit` | CI gate; fails on type errors |
| `bun test` | Run all tests (unit + integration + golden) | Fast loop; excludes E2E |
| `bun test tests/golden/` | Golden-fixture tests only | Verify renderer determinism |
| `bun test tests/unit/ tests/integration/ tests/golden/` | Fast loop (excludes E2E and BDD) | CI gate |
| `bun run test:bdd` | Cucumber lifecycle invariants (TDR-0007) | CI gate |
| `bun test tests/e2e/` | Live-sandbox E2E (requires credentials) | Separate gate |
| `bun test --update-snapshots` | Update golden-fixture snapshots | Explicit, reviewed action |
| `bun run build` | `bun build --compile` | Build single binary |
| `bun run test:bdd` | Cucumber lifecycle invariants (TDR-0007) | CI gate |
| `bun run bench` | Run repo-local benchmark gate (TDR-0004 §8) | Track test-suite performance |

## Local credentials (for live testing)

Live testing (E2E, manual Confluence testing) requires Confluence credentials.
**Never commit credentials.** Use `.env.local` (gitignored):

```bash
cp .env.example .env.local
# Edit .env.local:
#   MARKSYNC_CONFLUENCE_BASE_URL=https://your-tenant.atlassian.net
#   MARKSYNC_USER_EMAIL=you@example.com
#   MARKSYNC_API_TOKEN=your-api-token
```

See [`.env.example`](../../.env.example) for all environment variables.

### For local keyring (optional, spike-gated)

If `keytar` is compatible with Bun compile (spike-gated), local users can store
credentials in the OS keyring instead of env:

```bash
# Planned command (MS-0002):
marksync login --keyring
# Stores token in OS keyring; never in project files.
```

## Running MarkSync locally (during development)

```bash
# From source (no compile):
bun run src/cli/index.ts plan --config marksync.yaml --dry-run

# Compiled binary:
bun run build
./dist/marksync plan --config marksync.yaml --dry-run
```

## IDE recommendations

### VS Code

Recommended extensions:

- **Biome** (or ESLint + Prettier) — lint/format on save.
- **Markdown All in One** — for editing docs.
- **Mermaid Preview** — for diagram authoring.
- **YAML** — for config/lock files.

Settings (`.vscode/settings.json` target):

```jsonc
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "biomejs.biome", // or "esbenp.prettier-vscode"
  "[typescript]": { "editor.defaultFormatter": "biomejs.biome" },
  "[markdown]": { "editor.wordWrap": "on" }
}
```

### Other editors

- **JetBrains (WebStorm/IntelliJ)**: built-in TypeScript support; install Biome
  or ESLint plugin.
- **Neovim/Vim**: `tsserver` LSP + `biome` or `eslint` LSP; `prettierd` for
  formatting.

## Troubleshooting

### `bun install` fails

- **Lock-file mismatch:** delete `node_modules/` and `bun.lock` (or legacy
  `bun.lockb`), then
  `bun install`.
- **Native module (keytar):** `keytar` is spike-gated; if it fails under Bun,
  use env-token auth (`MARKSYNC_API_TOKEN`) instead.

### `bun test` finds no tests

- During inception, there are no source tests. CI uses `|| true` guards. At
  `MS-0002` start, these guards are removed.

### Mermaid render tests fail

- Ensure `happy-dom` is installed: `bun install`.
- The preload script must be passed: `bun test tests/golden/mermaid --preload ./tests/mermaid.preload.ts`.
- If `happy-dom` cannot run the Mermaid DOM path, escalate to Vitest for those
  files (TDR-0004 escalation path).

### Cross-compile fails

- Bun `build --compile` cross-compile matrix is evolving. Pin the Bun version
  per release.
- Check [ADR-0001](../decisions/ADR-0001-implementation-language-and-runtime.md)
  for known cross-compile issues.

## Contributing

See the repository's contributing guidelines (to be added at `MS-0008` public
launch readiness). During inception, contributions are limited to the
maintainer.

## See also

- [TypeScript conventions](../../.ai/rules/typescript.md) — coding standards.
- [Testing strategy](../../.ai/rules/testing-strategy.md) — test tiers and CI.
- [Security baseline](./security-baseline.md) — secret management.
- [Tech stack](../overview/tech-stack.md) — full technology choices.
