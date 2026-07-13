# CI Concurrency Groups for MarkSync

These GitHub Actions workflow snippets reduce overlapping CI runs at the source via GitHub Actions `concurrency:` groups. They are **complementary** to MarkSync's write-time concurrency gates (operation-ID dedup, stale-plan expiry, 409 re-fetch-once) — the templates prevent overlap, MarkSync remains safe even without them.

## Why Use Concurrency Groups?

When multiple commits are pushed to the same branch in quick succession, or when multiple PRs target the same branch, CI runs can overlap. MarkSync's write-time gates protect against data races, but overlapping runs waste CI resources and can cause confusing transient 409 conflicts.

The `concurrency:` group key ensures that:
1. **Feature branches**: New commits cancel the previous run — only the latest state is applied.
2. **Main branch**: Queued runs wait for the previous run to finish — no cancellation, preserving order.

## Group Key Strategy

The recommended group key combines:
- `github.ref` — the branch or PR reference (e.g., `refs/heads/develop`, `refs/pull/123/merge`)
- A target identifier — e.g., `marksync-${{ matrix.target || 'default' }}`

```yaml
concurrency:
  group: ${{ github.ref }}-marksync-${{ matrix.target || 'default' }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

**Why this strategy?**
- Branch-scoped: Runs on different branches don't cancel each other.
- Target-scoped: Multi-target repos (e.g., `confluence-prod`, `confluence-staging`) don't cancel each other.
- Main-protected: The `main` branch never cancels in-progress runs (prevents last-writer-wins on the canonical branch).

## Cancel-in-Progress Tradeoff

The `cancel-in-progress` setting balances CI efficiency against branch safety:

| Branch | `cancel-in-progress` | Rationale |
|--------|----------------------|-----------|
| Feature branches (`develop`, `feature/*`) | `true` | New commits supersede old ones; no need to apply stale states. |
| `main` / `mainline` | `false` | Prevents last-writer-wins; ensures every commit to main is applied in order. |

The expression `${{ github.ref != 'refs/heads/main' }}` implements this policy.

## Example Usage

Copy the following snippet into your GitHub Actions workflow file (`.github/workflows/marksync.yml`):

```yaml
name: MarkSync with Concurrency Groups

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.ref }}-marksync-${{ matrix.target || 'default' }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

jobs:
  marksync:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        target: [confluence-prod, confluence-staging]
      fail-fast: false

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run MarkSync
        env:
          MARKSYNC_CONFLUENCE_BASE_URL: ${{ secrets.MARKSYNC_CONFLUENCE_BASE_URL }}
          MARKSYNC_USER_EMAIL: ${{ secrets.MARKSYNC_USER_EMAIL }}
          MARKSYNC_API_TOKEN: ${{ secrets.MARKSYNC_API_TOKEN }}
        run: bun run marksync sync --target ${{ matrix.target }}
```

## Multi-Target Repos

If your repo has multiple Confluence targets (e.g., production and staging), use a matrix to run MarkSync against each target independently:

```yaml
strategy:
  matrix:
    target: [confluence-prod, confluence-staging]
  fail-fast: false  # Continue if one target fails
```

The group key `${{ matrix.target || 'default' }}` ensures that runs for different targets don't cancel each other.

## Relationship to MarkSync's Write-Time Gates

MarkSync's concurrency control (ADR-0006 C-5) consists of three write-time gates:

1. **Operation-ID dedup** — Detects if a newer plan already applied (via `marksync.metadata.operationId`).
2. **Stale-plan expiry** — Aborts plans older than `sync.stalePlanMinutes` (default 15).
3. **409 re-fetch-once policy** — Re-fetches the remote on conflict, re-applies if now safe.

These gates provide **decentralized safety** — no shared coordination service is required. Two runners on separate machines cannot silently overwrite each other.

The CI concurrency groups are a **source-level reduction** — they prevent overlap before MarkSync even runs. Together, they provide defense in depth:
- CI groups reduce overlap → fewer conflicts → faster CI.
- Write-time gates protect against any overlap that slips through (e.g., manual runs, ad-hoc scripts).

## References

- [ADR-0006: Document Identity and Shared Base State Model](../../../doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md) — C-5/C-6: Concurrency control mechanisms.
- [feature-safe-publish §3.1: Concurrency Control](../../../doc/spec/features/feature-safe-publish.md) — Feature specification.
- [GitHub Actions: Using concurrency](https://docs.github.com/en/actions/using-jobs/using-concurrency) — Official documentation.