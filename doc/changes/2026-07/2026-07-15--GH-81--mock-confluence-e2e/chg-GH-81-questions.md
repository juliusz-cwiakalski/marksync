# GH-81 — Open Questions

> Blocking questions for the GH-81 delivery. The change is paused at
> `clarify_scope` until these are answered. Reply inline here, on the PR, or in
> the GitHub issue thread.

## OPEN-Q1: Mock e2e execution level — CLI binary vs. programmatic full-pipeline?

**Question:** Which execution level should the mock e2e tests use?

- **Option A — CLI binary flow (matches the ticket's Proposed Design).** Spawn the
  real `marksync` CLI (`init` → `plan` → `sync`) against a `Bun.serve()` mock via
  `MARKSYNC_CONFLUENCE_BASE_URL=http://localhost:<port>`. This requires relaxing
  `isHttpsUrl` in `src/app/credentials.ts` to permit loopback `http`
  (`localhost` / `127.0.0.1` / `::1`) — a narrow, reversible change to
  security-sensitive credential validation. Most realistic; also exercises the
  CLI shell + `resolveCredentials`.

- **Option B — programmatic full-pipeline e2e (PM recommendation).** Call
  `computePlan` + `applyPlan` directly against a `Bun.serve()` mock via
  `ConfluenceTarget.fromCredentials` constructed directly (the established
  integration-test pattern in
  `tests/integration/confluence/confluence-target.test.ts`). No production code
  change; zero security impact; satisfies all four acceptance criteria literally
  (AC-1 endpoints, AC-2 scenarios, AC-3 CI job, AC-4 adapter-regression
  coverage). Does not exercise the CLI argument shell or `resolveCredentials`.

**Why this is blocking:** The ticket's Proposed Design specifies
`MARKSYNC_CONFLUENCE_BASE_URL=http://localhost:<port>` and "full marksync CLI
flow". But `resolveCredentials()` (`src/app/credentials.ts:64`) rejects non-https
base URLs (`isHttpsUrl` requires `protocol === "https:"`), so `http://localhost`
fails with `InvalidBaseUrl` before any request is made. This is a genuine
contradiction between the ticket proposal and existing security code. Resolving
it either touches production security code (Option A) or deviates from the
ticket's stated CLI-flow approach (Option B) — both are scope/footprint decisions
I should not make silently.

**Drivers:**
- Motivation (per ticket): catch HTTP adapter regressions like GH-71 (attachment
  response unwrap) and GH-66 (PropertyService API). Both are adapter-layer bugs;
  Option B catches them exactly (the adapter is exercised through the full
  pipeline). Option A additionally catches CLI-shell regressions, which were not
  the stated motivation.
- Least-privilege / paved-road principle favors B (no production change, follows
  existing pattern).
- Realism / defense-in-depth favors A (tests the actual binary users run).

### Answer
<!-- Human: reply "A" or "B" (and any constraints). If A, confirm the loopback-http relaxation in credentials.ts is acceptable. -->
