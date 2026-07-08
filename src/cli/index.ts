// src/cli/index.ts
//
// The real CLI entrypoint (GH-16 D-9 / F-9). Replaces the trivial
// `console.log("marksync 0.1.0")` stub. The flow (per the spec F-9):
//
//   parse args (Cliffy) → route to the command handler → execute →
//   OutputService.emit(result, { format, color }) → process.exit(result.exitCode)
//
// ## Error handling (DEC-2)
//
// - **Usage errors** (unknown command, bad flags) — Cliffy is configured with
//   `.throwErrors()`, so these throw `ValidationError` / `UnknownCommandError`
//   which the entrypoint catches and translates into a `CommandResult` with
//   `error.code: "USAGE"` (exit 2). NO domain type is imported — the error is
//   constructed purely from the presentation `err` factory.
// - **Unexpected throws** — any other error becomes `error.code: "INTERNAL"`
//   (exit 99) with a redacted, stable message (DEC-5).
// - **`--help` / `--version`** — Cliffy renders these itself and calls
//   `process.exit(0)`; the entrypoint never reaches its emit code for these.
//
// ## Testability
//
// The core logic is extracted into {@link runCli} which returns the exit code
// WITHOUT calling `process.exit`, so unit tests can exercise it with injectable
// streams. The module bootstrap (`import.meta.main`) calls `runCli` then
// `process.exit`. The heavy end-to-end (real process spawn, color/pipe matrix)
// is Phase 7 integration.
//
// Tier rule: presentation. Imports `@jsr/cliffy__command` is NOT needed here
// (the router owns the Cliffy tree); this module imports `#cli/commands/router`
// and `#cli/output` (same tier). NEVER imports `#domain/*` / `#infra/*`
// (DEC-1 / dep-cruiser).

import { buildCommand } from "#cli/commands/router";
import type { CommandResult } from "#cli/output";
import { OutputService, type WritableLike, err } from "#cli/output";

/**
 * Run the CLI against `argv` and return the exit code (without calling
 * `process.exit`). Parses args via the Cliffy router, emits the matched
 * command's `CommandResult` (or a USAGE/INTERNAL error) through the
 * `OutputService`, and returns the exit code the caller should pass to
 * `process.exit`.
 *
 * @param argv The raw args (typically `process.argv.slice(2)`).
 * @param streams Injectable stdout/stderr (defaults to the real process
 *   streams) so tests capture output deterministically.
 */
export async function runCli(
	argv: string[],
	streams: { stdout: WritableLike; stderr: WritableLike } = {
		stdout: process.stdout,
		stderr: process.stderr,
	},
): Promise<number> {
	const { command, getRun } = buildCommand();
	const service = new OutputService(streams.stdout, streams.stderr);

	try {
		await command.parse(argv);
	} catch (e) {
		// Cliffy `.throwErrors()` → ValidationError / UnknownCommandError = USAGE
		// (exit 2). Anything else = INTERNAL (exit 99, DEC-5 redacted message).
		const result: CommandResult<never> =
			e instanceof Error && isCliffyParseError(e)
				? err("USAGE", `usage error: ${e.message}`, false)
				: err("INTERNAL", "internal error", false);
		return service.emit(result, { format: "human" });
	}

	const run = getRun();
	if (run === null) {
		// No action fired and no parse error — e.g. a bare invocation. Cliffy
		// renders help for these before reaching here in most cases; if we do
		// land here, exit 0 (nothing to emit).
		return 0;
	}

	return service.emit(run.result, {
		format: run.format,
		color: run.color,
		quiet: run.quiet,
		command: run.command,
	});
}

/**
 * Heuristic: does this error originate from Cliffy's arg parsing? Cliffy throws
 * `ValidationError` (exported) and `UnknownCommandError` (not exported) — both
 * carry an `exitCode` property set to `2`. We detect them by name + exit-code to
 * classify the failure as USAGE without importing Cliffy error types (keeping
 * the catch path domain-free and Cliffy-error-class-free).
 */
function isCliffyParseError(e: Error): boolean {
	return (
		e.constructor.name === "ValidationError" ||
		e.constructor.name === "UnknownCommandError" ||
		(e as { exitCode?: unknown }).exitCode === 2
	);
}

// Module bootstrap — only runs when executed directly (not when imported in
// tests). `import.meta.main` is Bun's equivalent of Node's `require.main ===
// module`.
if (import.meta.main) {
	const code = await runCli(process.argv.slice(2));
	process.exit(code);
}
