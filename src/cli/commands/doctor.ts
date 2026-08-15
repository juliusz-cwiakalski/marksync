// Doctor command handler (GH-30 / TDR-0009 / DEC-4).

import type { CommandResult } from "#cli/output";
import type { DoctorReport } from "#app/doctor";
import {
	EXIT_INTERNAL,
	EXIT_OK,
	SCHEMA_VERSION,
	codeToExitCode,
} from "#cli/output";
import { mapMarkSyncErrorToCommandError } from "#cli/error-map";
import { runDoctor } from "#app/doctor";
import { cwd } from "node:process";

/** Injectable seams for tests (DEC-4); production callers omit `deps`.
 *  Exists so unit tests never need `mock.module`, which is process-global
 *  under bun:test workers and leaks into unrelated test files. */
export interface DoctorCommandDeps {
	runDoctor?: typeof runDoctor;
}

/**
 * Run `marksync doctor`. Calls the app-tier `runDoctor` orchestration and
 * constructs `CommandResult<DoctorReport>` directly (DEC-4). On `ok(report)`,
 * the exit code is derived from `report.worstStatus`: `0` when no check fails,
 * `EXIT_HEALTH` (60) when any gating check reports `fail`. The `error` field
 * is never set — the report is always present as `data`. On `err`, the failure
 * is an unexpected infrastructure error that prevented report production; it is
 * mapped via `mapMarkSyncErrorToCommandError` and exits via the mapped code.
 */
export async function doctorCommand(
	flags: { probeCapabilities?: boolean } = {},
	deps: DoctorCommandDeps = {},
): Promise<CommandResult<DoctorReport>> {
	const run = deps.runDoctor ?? runDoctor;
	const report = await run({
		cwd: cwd(),
		probeCapabilities: flags.probeCapabilities === true,
	});

	if (!report.ok) {
		// Unexpected infrastructure failure — map and return as error
		const mapped = mapMarkSyncErrorToCommandError(report.error);
		return {
			schemaVersion: SCHEMA_VERSION,
			runId: crypto.randomUUID(),
			exitCode: mapped.code ? codeToExitCode(mapped.code) : EXIT_INTERNAL,
			error: mapped,
		};
	}

	// Construct CommandResult directly (DEC-4) — data=report always present,
	// error never set, exitCode derived from worstStatus
	const isFail = report.value.worstStatus === "fail";
	return {
		schemaVersion: SCHEMA_VERSION,
		runId: crypto.randomUUID(),
		exitCode: isFail ? codeToExitCode("DOCTOR_FAIL") : EXIT_OK,
		data: report.value,
	};
}
