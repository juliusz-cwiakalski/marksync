// `marksync init` command (GH-15 F-5; GH-18 F-6 UUID assignment). Presentation-
// thin: writes the starter config, then delegates UUID assignment to the
// application orchestrator. Imports NO `#domain/*` / `#infra/*` (dep-cruiser).

import { assignUuidsFromDisk } from "#app/identity-assign";
import { writeStarterConfig } from "#app/config-template";
import { ok, type CommandResult } from "#cli/output";
import { resultErrorFromAppResult } from "#cli/commands/result-adapter";

export interface InitCommandOptions {
	cwd?: string;
}

export async function initCommand(
	options: InitCommandOptions = {},
): Promise<CommandResult<void>> {
	const dir = options.cwd ?? process.cwd();

	// Refuse to overwrite an existing config (OQ-TP-1); UUID assignment runs
	// ONLY on a successful init — TC-ASSIGN-005.
	const configResult = writeStarterConfig(dir);
	if (!configResult.ok) return resultErrorFromAppResult(configResult);

	const assignResult = await assignUuidsFromDisk(dir);
	if (!assignResult.ok) return resultErrorFromAppResult(assignResult);

	const docs = assignResult.value;
	if (docs.length === 0) return ok(undefined);
	const written = docs.filter((d) => d.written).length;
	return ok(undefined, {
		warnings: [
			{
				code: "IDENTITY_ASSIGNED",
				message: `UUID assignment: ${written} document(s) assigned, ${docs.length - written} already had an identity.`,
			},
		],
	});
}
