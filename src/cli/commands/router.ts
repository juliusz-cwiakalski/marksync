// src/cli/commands/router.ts
//
// Cliffy command router — the command skeleton with global flags and stub
// handlers (GH-16 D-8 / F-8 / TDR-0002). Registers the global output flags
// (`--json`/`--output`/`--color`/`--no-color`/`--quiet`) and the five
// subcommands (`init`, `plan`, `sync`, `doctor`, `repair-state`). Each
// subcommand's action calls its handler, captures the `CommandResult`, and
// resolves the output format + color policy from the global flags — all for the
// entrypoint to emit.
//
// ## Cliffy presentation boundary (TDR-0002 mitigation 4 / DEC-6)
//
// All `@cliffy` imports are confined to `src/cli/` (this file and the
// entrypoint). `rg '@cliffy' src/app src/domain src/infra` → zero matches.
// The command handlers (init/plan/sync/doctor/repair-state) are plain functions
// that return `CommandResult` and know nothing about Cliffy — the router binds
// them to Cliffy actions. This keeps Cliffy swappable (the fallback watchlist
// behind the same presentation boundary).
//
// ## Tier rule
//
// Presentation tier. Imports `@jsr/cliffy__command` (runtime dep confined to
// `src/cli/`), `#cli/output` (same tier), and the sibling command handlers
// (`./init`, `./plan`, …). NEVER imports `#domain/*` / `#infra/*` (DEC-1 /
// dep-cruiser `presentation-may-not-import-domain|-infra`).

import { Command, EnumType } from "@jsr/cliffy__command";
import type { ColorPolicy, CommandResult, OutputFormat } from "#cli/output";
import { resolveColorPolicy } from "#cli/output";
import { doctorCommand } from "#cli/commands/doctor";
import { initCommand } from "#cli/commands/init";
import { planCommand } from "#cli/commands/plan";
import { repairStateCommand } from "#cli/commands/repair-state";
import { syncCommand } from "#cli/commands/sync";

/**
 * The version displayed in `--version` / help. Kept in lock-step with
 * `package.json` until a runtime version source is wired (GH-15 precedent; the
 * bump to `0.2.0` is Phase 8 / `version_impact: minor`).
 */
export const CLI_VERSION = "0.2.0";

/** The global flags as Cliffy surfaces them to an action (post-camelCase). */
export interface GlobalCommandFlags {
	/** `--json` — shorthand for `--output=json`. */
	json?: boolean;
	/** `--output {json,ndjson,human}` — the explicit format selector. */
	output?: "json" | "ndjson" | "human";
	/**
	 * `--color` / `--no-color`. Cliffy negates `--no-color` into `color: false`;
	 * `undefined` when neither flag is passed (auto-detect).
	 */
	color?: boolean;
	/** `--quiet` — suppress non-error human output. */
	quiet?: boolean;
}

/**
 * The run captured by the most recent subcommand action: the command name, the
 * handler's `CommandResult`, and the output format + color policy resolved from
 * the global flags. The entrypoint reads this after `command.parse()` returns
 * and feeds it to `OutputService.emit`.
 */
export interface CapturedRun {
	command: string;
	result: CommandResult<unknown>;
	format: OutputFormat;
	color: ColorPolicy;
	quiet: boolean;
}

/**
 * Minimal structural type for the command's public parse surface. Avoids
 * naming Cliffy's deeply-generic `Command<…>` type params (which are not
 * portable across the `.d.ts` boundary — TS2883) while giving callers a typed
 * `.parse()` method. The real built command satisfies this structurally.
 */
export interface ParsableCommand {
	parse(args: string[]): Promise<unknown>;
}

/**
 * The built command tree plus a getter for the captured run. The run holder is
 * mutable (set by actions during `parse`); `getRun()` returns `null` until an
 * action fires. The `command` field is typed as {@link ParsableCommand} (a
 * structural supertype of Cliffy's `Command`) so the return type is portable.
 */
export interface CommandRouter {
	readonly command: ParsableCommand;
	getRun(): CapturedRun | null;
}

/**
 * Resolve the output format from the global flags. `--json` takes precedence
 * (it is shorthand for `--output=json`); otherwise the `--output` value is
 * used; the default is `"human"`.
 */
export function resolveOutputFormat(flags: GlobalCommandFlags): OutputFormat {
	if (flags.json) {
		return "json";
	}
	if (flags.output === "ndjson") {
		return "ndjson";
	}
	if (flags.output === "json") {
		return "json";
	}
	return "human";
}

/**
 * Resolve the color policy from Cliffy's `color` flag. Cliffy represents
 * `--no-color` as `color: false`; `--color` as `color: true`; absent as
 * `undefined`. This maps to the {@link resolveColorPolicy} options:
 * `true` → force on; `false` → force off; `undefined` → non-interactive
 * auto-detect (ADR-0011 C-2 / NFR-A11Y-1).
 */
export function resolveColorPolicyFromFlags(
	flags: Pick<GlobalCommandFlags, "color">,
): ColorPolicy {
	if (flags.color === true) {
		return resolveColorPolicy({ color: true });
	}
	if (flags.color === false) {
		return resolveColorPolicy({ noColor: true });
	}
	return resolveColorPolicy({});
}

/**
 * Build the Cliffy command tree with the global output flags and the five
 * subcommands. Each subcommand action captures its `CommandResult` + resolved
 * output format/color into the returned router's run holder, which the
 * entrypoint reads after `parse` to feed `OutputService.emit`.
 *
 * Cliffy is configured with `.throwErrors()` so unknown commands / bad flags
 * throw catchable errors (`ValidationError` / `UnknownCommandError`) that the
 * entrypoint translates into a `USAGE` `CommandResult` (exit 2) — without
 * importing any domain type.
 */
export function buildCommand(): CommandRouter {
	let run: CapturedRun | null = null;

	/** Capture a handler's result + resolved flags for the entrypoint. */
	function capture(
		command: string,
		flags: GlobalCommandFlags,
		result: CommandResult<unknown>,
	): void {
		run = {
			command,
			result,
			format: resolveOutputFormat(flags),
			color: resolveColorPolicyFromFlags(flags),
			quiet: Boolean(flags.quiet),
		};
	}

	const command = new Command()
		.name("marksync")
		.version(CLI_VERSION)
		.description(
			"Synchronize a Git-tracked Markdown corpus to Atlassian Confluence Cloud.",
		)
		.throwErrors()
		.globalType("output", new EnumType(["json", "ndjson", "human"]))
		.globalOption(
			"--json",
			"Emit machine-parseable JSON (shorthand for --output=json).",
		)
		.globalOption(
			"-o, --output <mode:output>",
			"Output format: json, ndjson, or human.",
			{ default: "human" },
		)
		.globalOption(
			"--color",
			"Force color output on, even when piped/non-interactive.",
		)
		.globalOption("--no-color", "Force color output off (plain text).")
		.globalOption("--quiet", "Suppress non-error human output.")
		.command("init", "Write a starter marksync.yml into the current directory.")
		.action((flags) => {
			capture("init", flags as GlobalCommandFlags, initCommand());
		})
		.command("plan", "Compute a sync plan from the local corpus.")
		.action((flags) => {
			capture("plan", flags as GlobalCommandFlags, planCommand());
		})
		.command("sync", "Apply a sync plan to the remote Confluence space.")
		.action((flags) => {
			capture("sync", flags as GlobalCommandFlags, syncCommand());
		})
		.command("doctor", "Run health checks against the local corpus and config.")
		.action((flags) => {
			capture("doctor", flags as GlobalCommandFlags, doctorCommand());
		})
		.command(
			"repair-state",
			"Repair the committed versioned lock after drift or interruption.",
		)
		.action((flags) => {
			capture(
				"repair-state",
				flags as GlobalCommandFlags,
				repairStateCommand(),
			);
		});

	return {
		command,
		getRun: () => run,
	};
}
