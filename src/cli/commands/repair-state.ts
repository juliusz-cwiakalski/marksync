// src/cli/commands/repair-state.ts
//
// `marksync repair-state` command handler — thin shell calling runRepair
// (GH-28 Phase 3). Returns CommandResult<RepairReport> via ok() / err().
// Mirrors sync.ts pattern: load config → load lock → resolve cache/creds →
// create target → call app-tier use case → map result. DEC-1 tier rules:
// imports only `#cli/output` + `#app/*` (NO `#domain/*` / `#infra/*`).

import type { CommandResult } from "#cli/output";
import { err, ok } from "#cli/output";
import { cwd } from "node:process";
import { loadConfig } from "#app/config";
import { loadLock } from "#app/lock";
import { resolveCacheDir } from "#app/cache";
import { resolveCredentials } from "#app/credentials";
import { createRepository, createTarget } from "#app/ports";
import { mapMarkSyncErrorToCommandError } from "#cli/error-map";
import { runRepair, type RepairReport } from "#app/repair";

/**
 * Run `marksync repair-state`. Flags: dryRun (default true), apply.
 * Calls runRepair and returns CommandResult<RepairReport>.
 */
export async function repairStateCommand(
	flags: { dryRun?: boolean; apply?: boolean } = {},
): Promise<CommandResult<RepairReport>> {
	const currentCwd = cwd();

	// Resolve mode: --apply wins; default is dry-run
	const apply = flags.apply === true;
	const dryRun = !apply;

	// 1. Load config
	const configResult = loadConfig(currentCwd);
	if (!configResult.ok) {
		const mapped = mapMarkSyncErrorToCommandError(configResult.error);
		return err(mapped.code, mapped.message, mapped.retryable);
	}
	const config = configResult.value;

	// 2. Load lock
	const lockResult = loadLock(currentCwd);
	if (!lockResult.ok) {
		const mapped = mapMarkSyncErrorToCommandError(lockResult.error);
		return err(mapped.code, mapped.message, mapped.retryable);
	}
	const lock = lockResult.value;

	// 3. Resolve cache dir (pure function, always succeeds)
	const cacheDir = resolveCacheDir(currentCwd);

	// 4. Resolve credentials
	const credsResult = resolveCredentials();
	if (!credsResult.ok) {
		const mapped = mapMarkSyncErrorToCommandError(credsResult.error);
		return err(mapped.code, mapped.message, mapped.retryable);
	}
	const creds = credsResult.value;

	// 5. Create Repository (shell-git via app-tier factory)
	const git = createRepository(currentCwd);

	// 6. Create TargetSystem (ConfluenceTarget via app-tier factory)
	// Use the default target config
	const targetConfig = config.targets.default;
	if (!targetConfig) {
		return err(
			"INVALID_CONFIG",
			"no default target configured in marksync.yml",
			false,
		);
	}
	const target = createTarget(creds, targetConfig.spaceKey);

	// 7. Call runRepair (diagnose + apply orchestration)
	const repairResult = await runRepair(lock, git, target, config, {
		cwd: currentCwd,
		cacheDir,
		targetId: "default",
		dryRun,
		stalePlanMinutes: config.sync.stalePlanMinutes,
	});

	if (!repairResult.ok) {
		const mapped = mapMarkSyncErrorToCommandError(repairResult.error);
		return err(mapped.code, mapped.message, mapped.retryable);
	}

	// 8. Return success
	return ok(repairResult.value);
}
