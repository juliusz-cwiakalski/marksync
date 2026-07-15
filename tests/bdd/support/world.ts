// BDD world: per-scenario state holder for FakeTarget + FakeRepository + results.

import { Before, After } from "@cucumber/cucumber";
import { FakeRepository } from "#tests/_helpers/fake-repository";
import { FakeTarget } from "#tests/_helpers/fake-target";
import type { LockFile, ProjectConfig } from "#domain/config/types";
import type { Plan, ApplyReport, ApplyOptions } from "#app/push-flow";
import type { Result } from "#domain/result";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";

// Temporary cache directory for BDD tests (created per scenario)
let tmpCacheDir: string;

export interface BddWorld {
	// Adapter port mocks (only permitted mocks — DEC-4)
	readonly fakeRepo: FakeRepository;
	readonly fakeTarget: FakeTarget;

	// Config/lock fixtures
	config: ProjectConfig;
	lock: LockFile;

	// Computed results from computePlan
	planResult: Result<Plan, unknown> | undefined;

	// Computed results from applyPlan
	applyResult: Result<ApplyReport, unknown> | undefined;

	// Apply options (test configuration)
	applyOpts: ApplyOptions;
}

// Create a fresh world before each scenario (RSK-3: no state leakage)
Before(function () {
	// Create a fresh temporary cache directory for this scenario
	tmpCacheDir = mkdtempSync(`${tmpdir()}/marksync-bdd-`);

	const world = this as unknown as BddWorld;
	const applyOpts: ApplyOptions = {
		cwd: tmpCacheDir,
		cacheDir: tmpCacheDir,
		targetId: "default",
		stalePlanMinutes: 15,
	};

	Object.assign(world, {
		fakeRepo: new FakeRepository(),
		fakeTarget: new FakeTarget(),
		config: {
			version: 1,
			root: ".",
			select: ["**/*.md"],
			exclude: [],
			hierarchy: "flat",
			targets: {
				default: {
					type: "confluence",
					spaceKey: "TEST",
					parentPageId: "ROOT",
				},
			},
			sync: {
				allowBranches: ["main"],
				granularity: "squash",
				stalePlanMinutes: 15,
			},
			render: {
				mermaid: {
					policy: "render",
					securityLevel: "strict",
					htmlLabels: false,
					deterministicIds: true,
				},
			},
			output: {
				format: "storage",
				color: "auto",
			},
			provenance: {
				visiblePanel: true,
			},
		},
		lock: {
			version: 1,
			targets: {
				default: {
					documents: {},
				},
			},
		},
		planResult: undefined,
		applyResult: undefined,
		applyOpts,
	});
});

// Clean up the temporary cache directory after each scenario (L-2)
After(function () {
	// Best-effort cleanup: remove the temporary cache directory
	if (tmpCacheDir) {
		try {
			rmSync(tmpCacheDir, { recursive: true, force: true });
		} catch (error) {
			// Log but don't fail the test (best-effort cleanup)
			console.error(
				`[BDD Cleanup Failed] Failed to remove ${tmpCacheDir}:`,
				error,
			);
		}
	}
});
