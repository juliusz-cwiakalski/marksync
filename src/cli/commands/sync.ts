// src/cli/commands/sync.ts
//
// `marksync sync` command handler — thin shell calling computePlan + applyPlan
// (MS2-E3-S6 Phase 7). Returns CommandResult<ApplyReport> via ok() / err().

import type { CommandResult } from "#cli/output";
import { err, ok } from "#cli/output";
import { cwd } from "node:process";
import { loadConfig } from "#app/config";
import { loadLock } from "#app/lock";
import { resolveCacheDir } from "#app/cache";
import { createShellGit } from "#infra/git/shell-git";
import { ConfluenceTarget } from "#infra/confluence/target";
import { ConfluenceCredentials } from "#domain/credentials";
import { mapConfigError, mapLockError } from "#cli/error-map";
import { computePlan, applyPlan, type ApplyReport } from "#app/push-flow";

/**
 * Run `marksync sync`. Calls computePlan then applyPlan and returns CommandResult<ApplyReport>.
 */
export async function syncCommand(): Promise<CommandResult<ApplyReport>> {
	const currentCwd = cwd();

	// 1. Load config
	const configResult = loadConfig(currentCwd);
	if (!configResult.ok) {
		return err(
			mapConfigError(configResult.error).code,
			mapConfigError(configResult.error).message,
			false,
		);
	}
	const config = configResult.value;

	// 2. Load lock
	const lockResult = loadLock(currentCwd);
	if (!lockResult.ok) {
		return err(
			mapLockError(lockResult.error).code,
			mapLockError(lockResult.error).message,
			false,
		);
	}
	const lock = lockResult.value;

	// 3. Resolve cache dir
	const cacheDirResult = resolveCacheDir(currentCwd);
	if (!cacheDirResult.ok) {
		return err("INTERNAL", cacheDirResult.error.humanMessage, false);
	}
	const cacheDir = cacheDirResult.value;

	// 4. Create Repository (shell-git)
	const git = createShellGit(currentCwd);

	// 5. Create TargetSystem (ConfluenceTarget)
	// NOTE: In a real CLI, credentials would come from environment/secret manager
	// For this implementation, we use a minimal credential provider
	const credentials: ConfluenceCredentials = {
		email: config.targets.default.email,
		// In production, token comes from secret manager/encrypted storage
		// For now, we read from environment variable or error
		token: process.env.MARKSYNC_CONFLUENCE_TOKEN || "",
	};
	const target = ConfluenceTarget.fromCredentials(
		credentials,
		config.targets.default.spaceId,
	);

	// 6. Compute plan
	const planResult = await computePlan(config, lock, git, target);
	if (!planResult.ok) {
		return err(
			planResult.error.kind,
			planResult.error.humanMessage || planResult.error.kind,
			false,
		);
	}
	const plan = planResult.value;

	// 7. Get target ID (single-target for MS-0002)
	const targetId = Object.keys(config.targets)[0];
	if (!targetId) {
		return err("INTERNAL", "No target configured", false);
	}

	// 8. Apply plan
	const applyResult = await applyPlan(plan, target, lock, {
		cwd: currentCwd,
		cacheDir,
		targetId,
	});
	if (!applyResult.ok) {
		return err(
			applyResult.error.kind,
			applyResult.error.humanMessage || applyResult.error.kind,
			false,
		);
	}

	// 9. Return success
	return ok(applyResult.value);
}