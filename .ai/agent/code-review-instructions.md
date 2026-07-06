# Code Review Instructions

<!-- This file EXTENDS the reviewer agent's built-in heuristics. -->
<!-- Items here take priority over built-in defaults on any conflict. -->

## Repository Context

- **Product**: MarkSync for Confluence — CLI that syncs Git-tracked Markdown to
  Confluence Cloud.
- **Primary language**: TypeScript (strict, ESM, `verbatimModuleSyntax`).
- **Runtime**: Bun (single-binary target).
- **Architecture**: Ports-and-adapters; `TargetSystem` port isolates Confluence.
- **Error handling**: `Result<T, E>` pattern — no thrown exceptions for expected
  failures (see [.ai/rules/typescript.md](../rules/typescript.md)).
- **Testing**: 6 tiers; coverage tied to invariants (see
  [.ai/rules/testing-strategy.md](../rules/testing-strategy.md)).

## Review Priorities

Ordered from most to least important for this repo:

1. **Safety invariants** — sync must never silently overwrite or lose content.
2. **Credential security** — secrets never logged; redaction centralized.
3. **Ports-and-adapters boundaries** — Confluence code stays behind the
   `TargetSystem` port; domain logic has zero Confluence imports.
4. **Result<T,E> discipline** — expected errors are returned, not thrown.
5. **Test coverage of invariants** — INV-SAFE-1/2/3, INV-SEC-1 must have tests.
6. **Determinism** — Mermaid rendering, cache keys, and lock entries must be
   reproducible.
7. **TypeScript strictness** — no `any`, exhaustive `never`, zod validation at
   IO boundaries.

## Review Checklist

### Safety & determinism

- [ ] No silent overwrite path: every Confluence write checks `version` /
      content-property state before applying.
- [ ] UUID v7 identity is never regenerated for an existing document.
- [ ] Lock file mutations are atomic (write-temp-then-rename or equivalent).
- [ ] Mermaid rendering uses `deterministicIds` (no random hash in output).
- [ ] `.marksync/cache/` is treated as disposable — no logic depends on its
      persistence across runs.

### Security

- [ ] No credential (token, password, API key) appears in logs, error messages,
      `version.message`, or cache files.
- [ ] Redaction goes through the centralized redaction layer
      (NFR-SEC-2, ADR-0011) — no ad-hoc `replace` calls.
- [ ] `.env.example` lists any new environment variable (no values).
- [ ] Markdown converter treats input as untrusted — adversarial fixtures
      covered (NFR-SEC-5).
- [ ] `allowBranches` / branch restriction enforced for any provenance write.

### Architecture boundaries

- [ ] No `import` from an adapter module into a domain module (enforced by
      dependency-cruiser, TDR-0006 — but review confirms intent).
- [ ] Confluence-specific types (`Storage Format`, v2 response shapes) do not
      leak into domain or CLI layers.
- [ ] New external integrations go through a defined port, not direct calls.

### Error handling

- [ ] Expected failures (API errors, parse failures, missing files) return
      `Result.err(...)`, not `throw`.
- [ ] `never`-exhaustive checks present on all discriminated unions.
- [ ] Error messages are AI-agent-readable: include the failing input, the
      expected shape, and a suggested fix where possible.
- [ ] No `try/catch` that swallows errors silently.

### Testing

- [ ] New invariants have tests at the correct tier (unit / golden / BDD).
- [ ] No over-mocking: mocks do not replicate the system-under-test's logic
      (testing-strategy guardrail).
- [ ] Golden fixtures committed under `tests/golden/` with clear names.
- [ ] BDD scenarios cover lifecycle invariants (idempotency, drift detection).

### TypeScript & style

- [ ] No `any` — use `unknown` + zod validation at boundaries.
- [ ] ESM imports use explicit extensions or `package.json` `exports`/`imports`
      maps.
- [ ] Biome formatting/linting passes (TDR-0005).
- [ ] Commit message follows Conventional Commits (TDR-0008).

### Confluence API correctness

- [ ] v2 API used for content/properties; v1 only for attachments, labels,
      search, restrictions.
- [ ] Optimistic concurrency (409 handling) implemented for writes.
- [ ] `version.message` respects the length limit (spike-gated, OPEN-Q6).

## What to Ignore

- **Formatting / line length** — handled by Biome (TDR-0005); do not flag.
- **Import ordering** — handled by Biome.
- **Trivial type inference** — let TS infer where the type is obvious; do not
  demand redundant annotations.

## Special Patterns

- **Result<T,E> is the error channel** — do not flag "missing try/catch" when a
  function returns `Result`. This is intentional (see
  [.ai/rules/typescript.md](../rules/typescript.md) → Result<T,E>). `CommandResult<T>`
  (the CLI output wrapper) is a separate concern governed by ADR-0011.
- **Disposable cache** — tests may delete `.marksync/cache/` freely; this is not
  a bug.
- **Squash provenance** — `version.message` carries a compact summary, not
  full Git history (ADR-0010).
- **Adapter separation** — Confluence-specific code in adapter modules is
  expected; flag only if it leaks into domain/CLI.

## References

- [.ai/rules/typescript.md](../rules/typescript.md) — TypeScript conventions
- [.ai/rules/testing-strategy.md](../rules/testing-strategy.md) — testing strategy
- [doc/spec/nonfunctional.md](../../doc/spec/nonfunctional.md) — NFRs
- [doc/guides/security-baseline.md](../../doc/guides/security-baseline.md) — security baseline
- [doc/decisions/](../../doc/decisions/) — decision records (ADR/TDR/PDR)
