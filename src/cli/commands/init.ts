// src/cli/commands/init.ts
//
// `marksync init` command module (GH-15 F-5 — Phase 8.2). A thin presentation
// layer over the application-tier `writeStarterConfig` helper. Structured for
// registration by the future CLI bootstrap (Cliffy — TDR-0002) without rewrite:
// export a plain action the bootstrap can bind to a command definition.
//
// Tier rule: presentation imports application ONLY — NOT `#domain/*` and NOT
// `#infra/*` (typescript.md `presentation-may-not-import-domain` /
// `-infra`, enforced by dependency-cruiser). The Result type flows in from
// `writeStarterConfig`'s return signature; the handler uses it structurally
// without naming any domain type.

import { writeStarterConfig } from "#app/config-template";

/** Options accepted by the init command action. */
export interface InitCommandOptions {
	/** Working directory to initialize (defaults to process.cwd() at call time). */
	cwd?: string;
}

/** Result of running the init command (presentation-friendly, no domain types). */
export interface InitCommandResult {
	/** Process exit code (0 = success, 1 = refused / failure). */
	exitCode: number;
	/** Human-readable message for the operator. */
	message: string;
}

/**
 * Run `marksync init`: write the starter `marksync.yml` into the target
 * directory. Refuses to overwrite an existing config (OQ-TP-1) — returns
 * exit code 1 with a clear message.
 *
 * Pure presentation: the config-writing logic lives in `#app/config-template`;
 * this handler only translates the application Result into an exit code +
 * message for the operator.
 */
export function initCommand(
	options: InitCommandOptions = {},
): InitCommandResult {
	const dir = options.cwd ?? process.cwd();
	const result = writeStarterConfig(dir);
	if (result.ok) {
		return {
			exitCode: 0,
			message: `Created marksync.yml in ${dir}. Edit it to set your Confluence spaceKey and parentPageId, then run 'marksync push'.`,
		};
	}
	return { exitCode: 1, message: result.error.humanMessage };
}
