// src/cli/commands/sync.ts
//
// `marksync sync` command handler — thin shell calling applyPlan
// (MS2-E3-S6 Phase 7). Returns CommandResult<ApplyReport> via ok() / err().

import type { CommandResult } from "#cli/output";
import { err, ok } from "#cli/output";
import { cwd } from "node:process";
import { loadConfig } from "#app/config";
import { loadLock } from "#app/lock";
import { resolveCacheDir } from "#app/cache";
import { resolveCredentials } from "#app/credentials";
import { createRepository, createTarget } from "#app/ports";
import { mapMarkSyncErrorToCommandError } from "#cli/error-map";
import { computePlan, applyPlan, type ApplyReport } from "#app/push-flow";

/**
 * Run `marksync sync`. Calls computePlan + applyPlan and returns CommandResult<ApplyReport>.
 */
export async function syncCommand(): Promise<CommandResult<ApplyReport>> {
	const currentCwd = cwd();

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

	// 7. Compute plan
	let planResult: Awaited<ReturnType<typeof computePlan>>;
	try {
		planResult = await computePlan(config, lock, git, target);
	} catch (e) {
		// Git failures throw as host invariants → INTERNAL
		// Include a redacted summary of the error (F-8)
		const message =
			e instanceof Error
				? `internal error: git operation failed (${e.name})`
				: "internal error: git operation failed";
		return err("INTERNAL", message, false);
	}
	if (!planResult.ok) {
		const mapped = mapMarkSyncErrorToCommandError(planResult.error);
		return err(mapped.code, mapped.message, mapped.retryable);
	}
	const plan = planResult.value;

	// 8. Apply plan
	let applyResult: Awaited<ReturnType<typeof applyPlan>>;
	try {
		applyResult = await applyPlan(plan, target, lock, {
			cwd: currentCwd,
			cacheDir,
			targetId: "default",
		});
	} catch (e) {
		// Git failures throw as host invariants → INTERNAL
		// Include a redacted summary of the error (F-8)
		const message =
			e instanceof Error
				? `internal error: git operation failed (${e.name})`
				: "internal error: git operation failed";
		return err("INTERNAL", message, false);
	}
	if (!applyResult.ok) {
		const mapped = mapMarkSyncErrorToCommandError(applyResult.error);
		return err(mapped.code, mapped.message, mapped.retryable);
	}

	// 9. Return success
	return ok(applyResult.value);
}
