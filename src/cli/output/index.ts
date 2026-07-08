// src/cli/output/index.ts
//
// OutputService — the SINGLE non-bypassable chokepoint all command output
// crosses (GH-16 D-7 / F-7 / ADR-0011 C-5 / INV-SEC-1 / NFR-SEC-2). The
// pipeline is: REDACT → RENDER → WRITE → RETURN exitCode. No command code calls
// `process.stdout`/`process.stderr`/`process.exit` directly — it produces a
// `CommandResult<T>` and hands it to `emit`, which returns the exit code for the
// entrypoint's `process.exit` (F-1 / F-9).
//
// DEC-4 (authoritative — redact the SERIALIZED string): each format is rendered
// to a string FIRST, then `redactString` scrubs the whole string. This catches
// tokens nested anywhere inside `data` (exposed only post-`JSON.stringify`) on
// every format path — JSON, NDJSON, and human (INV-SEC-1 / TC-RED-007).
//
// Write routing: JSON/NDJSON always go to stdout (machine contract preserved —
// even an error result's envelope is JSON on stdout). Human output routes by
// result class — success → stdout (suppressed under `--quiet`), error → stderr
// always (`--quiet` only suppresses non-error stdout; errors still surface).
//
// Tier rule: presentation output. Imports only sibling output modules
// (`./command-result` type-only, `./redact`, `./json`, `./human`, `./color`) —
// no `#domain/*` / `#infra/*` (DEC-1 / dep-cruiser).

import type { ColorPolicy } from "./color";
import { renderJson, renderNdjson } from "./json";
import type { CommandResult } from "./command-result";
import { redactString } from "./redact";
import { renderHumanForCommand } from "./human";

/** Output format selector (mirrors the `--output` / `--json` flags). */
export type OutputFormat = "json" | "ndjson" | "human";

/** Minimal writable stream surface the OutputService writes to. */
export interface WritableLike {
	/** Return value is ignored; typed `void` so both `process.stdout` (returns
	 *  `boolean`) and in-memory test captures are assignable (TS void-return
	 *  special-casing), and avoids a confusing `boolean | void` union. */
	write(chunk: string): void;
}

/** Options accepted by `OutputService.emit` (the chokepoint entry). */
export interface EmitOptions {
	/** The output format to render (`--output={json,ndjson,human}` / `--json`). */
	format: OutputFormat;
	/**
	 * The resolved color policy (caller-resolved via `resolveColorPolicy` from
	 * `./color`). When absent, color is disabled (safe default — no ANSI).
	 */
	color?: ColorPolicy;
	/**
	 * The command name, used to resolve a registered human formatter (registry
	 * override vs the generic fallback — AC-7). Optional; only consulted for
	 * `format: "human"`.
	 */
	command?: string;
	/**
	 * `--quiet` — suppress non-error human output on stdout. Errors still emit to
	 * stderr; JSON/NDJSON are unaffected (machine contract preserved).
	 */
	quiet?: boolean;
}

/**
 * The single output chokepoint. Constructed with injectable stdout/stderr
 * streams (defaults to `process.stdout`/`process.stderr`) so tests capture
 * output deterministically. The default `outputService` instance + the
 * module-level `emit` convenience use the real process streams.
 */
export class OutputService {
	constructor(
		private readonly stdout: WritableLike = process.stdout,
		private readonly stderr: WritableLike = process.stderr,
	) {}

	/**
	 * Emit a `CommandResult` through the redact → render → write pipeline and
	 * return its `exitCode` (the caller then calls `process.exit`).
	 *
	 * The rendered string is ALWAYS passed through `redactString` (DEC-4), so a
	 * secret anywhere in `data`/`error`/`warnings` is scrubbed on every format
	 * path before any byte reaches a stream (INV-SEC-1 / ADR-0011 C-5).
	 */
	emit(result: CommandResult<unknown>, opts: EmitOptions): number {
		const colorEnabled = opts.color?.enabled ?? false;

		switch (opts.format) {
			case "json": {
				const rendered = renderJson(result);
				this.stdout.write(redactString(rendered));
				break;
			}
			case "ndjson": {
				const rendered = renderNdjson(result);
				this.stdout.write(redactString(rendered));
				break;
			}
			case "human": {
				const rendered = renderHumanForCommand(opts.command, result, {
					colorEnabled,
				});
				const redacted = redactString(rendered);
				const isError = result.error !== undefined;
				if (isError) {
					// Errors always surface (to stderr), even under --quiet.
					this.stderr.write(redacted);
				} else if (!opts.quiet) {
					// Success → stdout, unless --quiet suppresses it.
					this.stdout.write(redacted);
				}
				break;
			}
		}
		return result.exitCode;
	}
}

/** The default OutputService bound to the real process stdout/stderr. */
export const outputService = new OutputService();

/**
 * Convenience over the default OutputService — emit through the real process
 * streams and return the exit code. Equivalent to `outputService.emit(...)`.
 */
export function emit(
	result: CommandResult<unknown>,
	opts: EmitOptions,
): number {
	return outputService.emit(result, opts);
}

// Re-export the presentation output surface so `#cli/output` is a single import
// root for the CLI entrypoint and handlers (D-7 chokepoint).
export type { ColorPolicy } from "./color";
export { resolveColorPolicy, createColor } from "./color";
export type { ColorKit } from "./color";
export {
	EXIT_OK,
	EXIT_USAGE,
	EXIT_CONFIG,
	EXIT_AUTH,
	EXIT_CONFLICT,
	EXIT_REMOTE_MISSING,
	EXIT_INVARIANT,
	EXIT_RENDER_UNAVAILABLE,
	EXIT_INTERNAL,
	CODE_TO_EXIT,
	codeToExitCode,
} from "./exit-codes";
export {
	SCHEMA_VERSION,
	ok,
	err,
} from "./command-result";
export type {
	CommandResult,
	CommandResultError,
	CommandResultMeta,
	CommandResultTiming,
	CommandResultWarning,
} from "./command-result";
export { renderJson, renderNdjson } from "./json";
export {
	renderHuman,
	renderHumanForCommand,
	registerHumanFormatter,
	getHumanFormatter,
	clearHumanFormatterRegistry,
} from "./human";
export type { HumanFormatter, HumanRenderOptions } from "./human";
export {
	redactString,
	Redactor,
	DEFAULT_REDACTOR,
	DEFAULT_PATTERNS,
	createRedactor,
} from "./redact";
export type { RedactionKind, RedactionPattern } from "./redact";
