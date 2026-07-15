// Step definitions for no-secret-in-output.feature (INV-SEC-1, TC-BDD-006).

import { Given, Then } from "@cucumber/cucumber";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { BddWorld } from "../support/world";

const SENTINEL_SECRET = "SECRET_SENTINEL_xyz123";

Given(
	"a corpus with one managed document containing a secret sentinel in body content",
	function (this: BddWorld) {
		const docUuid = "019f56e4-18f5-759b-bfdf-5438918bb3bc";
		const pageId = "page-secret";

		// Seed document with sentinel in BODY content (OQ-P2 RESOLVED: inject into document content, not config/provenance)
		this.fakeRepo.setFile(
			"doc.md",
			`---
marksync:
  uuid: ${docUuid}
---
# Doc

This doc contains a secret: ${SENTINEL_SECRET}`,
		);

		// Add fixture page with NO body field so computePlan falls back to
		// binding.remoteBodyHash (LOCAL_AHEAD pattern → writes journal/message).
		this.fakeTarget.addFixture({
			id: pageId,
			title: "Doc",
			version: 1,
			spaceId: "TEST",
		});

		// Bind the document in lock (LOCAL_AHEAD pattern: renderedBodyHash === remoteBodyHash)
		this.lock.targets.default.documents[docUuid] = {
			uuid: docUuid,
			sourcePath: "doc.md",
			pageId,
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "base-sha",
			sourceContentHash: "new-local-hash", // Local changed
			renderedBodyHash: "old-rendered-hash", // Same as remote → LOCAL_AHEAD
			remoteBodyHash: "old-rendered-hash", // == base → remote unchanged
			attachmentHashes: {},
			operationId: "op-old",
			synchronizedAt: "2025-01-01T00:00:00Z",
			toolVersion: "1.0.0",
		};

		this.fakeRepo.setHeadSha("abc123");
		this.fakeRepo.setBranch("main");
	},
);

Then(
	"the sentinel does not appear in the plan JSON",
	function (this: BddWorld) {
		if (!this.planResult || !this.planResult.ok) {
			throw new Error("Expected computePlan to succeed");
		}

		const planJson = JSON.stringify(this.planResult.value);
		if (planJson.includes(SENTINEL_SECRET)) {
			throw new Error("Sentinel leaked into plan JSON");
		}
	},
);

Then(
	"the sentinel does not appear in the apply journal",
	function (this: BddWorld) {
		if (!this.applyResult || !this.applyResult.ok) {
			throw new Error("Expected applyPlan to succeed");
		}

		if (!this.planResult || !this.planResult.ok) {
			throw new Error("Expected computePlan to succeed");
		}

		const report = this.applyResult.value;
		const plan = this.planResult.value;

		// Read the journal file (.marksync/journal/<run-id>.jsonl)
		const journalPath = join(
			this.applyOpts.cacheDir,
			"journal",
			`${plan.runId}.jsonl`,
		);
		const journalContent = readFileSync(journalPath, "utf-8");

		// Assert the journal contains NO occurrences of the sentinel
		if (journalContent.includes(SENTINEL_SECRET)) {
			throw new Error("Sentinel leaked into apply journal");
		}
	},
);

Then(
	"the sentinel does not appear in the lock file",
	function (this: BddWorld) {
		const lockJson = JSON.stringify(this.lock);
		if (lockJson.includes(SENTINEL_SECRET)) {
			throw new Error("Sentinel leaked into lock file");
		}
	},
);

Then(
	"the sentinel does not appear in diagnostic messages",
	function (this: BddWorld) {
		if (!this.planResult || !this.planResult.ok) {
			throw new Error("Expected computePlan to succeed");
		}

		if (!this.applyResult || !this.applyResult.ok) {
			throw new Error("Expected applyPlan to succeed");
		}

		const plan = this.planResult.value;
		const report = this.applyResult.value;

		// Check plan entries for warnings/diagnostics
		for (const entry of Object.values(plan.entries)) {
			if (entry.action.kind === "Block" && entry.action.reason) {
				if (entry.action.reason.includes(SENTINEL_SECRET)) {
					throw new Error("Sentinel leaked into plan action reason");
				}
			}
		}

		// Check ApplyReport warnings
		for (const warning of report.warnings ?? []) {
			if (warning.includes(SENTINEL_SECRET)) {
				throw new Error("Sentinel leaked into apply report warnings");
			}
		}

		// Check individual result warnings
		for (const result of report.results) {
			for (const warning of result.warnings ?? []) {
				if (warning.includes(SENTINEL_SECRET)) {
					throw new Error("Sentinel leaked into result warnings");
				}
			}
		}
	},
);

Then(
	"the sentinel does not appear in version.message",
	function (this: BddWorld) {
		if (!this.applyResult || !this.applyResult.ok) {
			throw new Error("Expected applyPlan to succeed");
		}

		// ApplyReport has no 'documents' field — check FakeTarget's captured calls instead.
		// Mirror TC-INTEGRATION-011 pattern: inspect updatePageCalls[].message and createPageCalls[].message.
		for (const updateCall of this.fakeTarget.updatePageCalls) {
			if (updateCall.message?.includes(SENTINEL_SECRET)) {
				throw new Error("Sentinel leaked into version.message (updatePage)");
			}
		}

		for (const createCall of this.fakeTarget.createPageCalls) {
			if (createCall.message?.includes(SENTINEL_SECRET)) {
				throw new Error("Sentinel leaked into version.message (createPage)");
			}
		}
	},
);

Then("the sentinel does not appear in the cache", function (this: BddWorld) {
	if (!this.applyResult || !this.applyResult.ok) {
		throw new Error("Expected applyPlan to succeed");
	}

	// Recursively scan the cache directory for any file containing the sentinel
	const cacheDir = this.applyOpts.cacheDir;
	const scanDir = (dir: string): void => {
		const entries = readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dir, entry.name);

			if (entry.isDirectory()) {
				scanDir(fullPath);
			} else if (entry.isFile()) {
				const content = readFileSync(fullPath, "utf-8");
				if (content.includes(SENTINEL_SECRET)) {
					throw new Error(`Sentinel leaked into cache file: ${fullPath}`);
				}
			}
		}
	};

	scanDir(cacheDir);
});
