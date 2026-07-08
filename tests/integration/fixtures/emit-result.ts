// tests/integration/fixtures/emit-result.ts
//
// Test-only fixture for Phase 7 integration tests (GH-16 TC-INT-001 / TC-INT-003).
// NOT production code — lives under tests/ and is spawned via `Bun.spawn` by
// tests/integration/cli-output.test.ts to prove the REAL OutputService chokepoint
// redacts + exits end-to-end on REAL emitted bytes (the over-mocking guardrail:
// INV-SEC-1 must hold on captured stdout/stderr, never via a mock that asserts
// "redact was called" — testing-strategy §"Over-mocking guardrail").
//
// Why a fixture and not the live entrypoint? The production stub handlers
// (`plan`/`sync`/…) return hardcoded placeholder results and cannot carry a
// synthetic token or a CONFLICT code. Rather than pollute production stubs with
// test hooks, this fixture builds a `CommandResult` inline and routes it through
// the REAL `OutputService` (the same production code the entrypoint uses) to the
// real `process.stdout`/`process.stderr`, then `process.exit`s. The bytes a
// caller captures therefore cross the genuine non-bypassable redact→render→write
// chokepoint — exactly the surface INV-SEC-1 must hold on.
//
// Usage (spawned by the integration test):
//   bun tests/integration/fixtures/emit-result.ts token
//       Emits a success CommandResult whose `data.pageBody` embeds a synthetic
//       GitHub token (read from $MARKSYNC_TEST_TOKEN) as JSON to stdout. The
//       caller greps captured stdout+stderr for the raw token and asserts 0
//       matches (INV-SEC-1 e2e).
//   bun tests/integration/fixtures/emit-result.ts conflict
//       Emits a `{ error: { code: "CONFLICT" } }` CommandResult as JSON and
//       `process.exit`s with the mapped exit code (30). The caller asserts the
//       spawned exit code (AC-6 e2e).

import { err, ok, OutputService } from "#cli/output";

const mode = process.argv[process.argv.length - 1];
const service = new OutputService();

if (mode === "token") {
	const token =
		process.env.MARKSYNC_TEST_TOKEN ?? "gho_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
	const result = ok(
		{ pageBody: `see ${token} embedded` },
		{ runId: "token-run" },
	);
	service.emit(result, { format: "json" });
} else if (mode === "conflict") {
	const result = err("CONFLICT", "remote version is ahead of local", true, {
		runId: "conflict-run",
	});
	const exit = service.emit(result, { format: "json" });
	process.exit(exit);
} else {
	process.stderr.write(`emit-result: unknown mode "${mode ?? "(none)"}"\n`);
	process.exit(2);
}
