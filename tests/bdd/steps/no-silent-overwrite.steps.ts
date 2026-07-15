// Step definitions for no-silent-overwrite.feature (INV-SAFE-1, TC-BDD-001 + TC-BDD-002).

import { Given, When, Then } from "@cucumber/cucumber";
import type { BddWorld } from "../support/world";
import { computePlan, applyPlan } from "#app/push-flow";

Given(
	"a managed document whose remote is in REMOTE_AHEAD state",
	function (this: BddWorld) {
		const docUuid = "019f56e4-18f5-759b-bfdf-5438918bb3bc";
		const pageId = "page-remote-ahead";

		// Seed local document
		this.fakeRepo.setFile(
			"doc.md",
			`---
marksync:
  uuid: ${docUuid}
---
# Doc

Local content (version 1).`,
		);

		// Add fixture page with version > local base (REMOTE_AHEAD)
		this.fakeTarget.addFixture({
			id: pageId,
			title: "Doc",
			version: 2, // Remote is ahead
			body: "<h1>Doc</h1><p>Remote content (version 2)</p>",
			spaceId: "TEST",
		});

		// Bind the document in lock
		this.lock.targets.default.documents[docUuid] = {
			uuid: docUuid,
			sourcePath: "doc.md",
			pageId,
			parentPageId: "ROOT",
			pageVersion: 1, // Local base version
			sourceCommit: "base-sha",
			sourceContentHash: "local-hash",
			renderedBodyHash: "rendered-hash-v1",
			remoteBodyHash: "remote-hash-v2", // Diverged
			attachmentHashes: {},
			operationId: "op-old",
			synchronizedAt: "2025-01-01T00:00:00Z",
			toolVersion: "1.0.0",
		};

		this.fakeRepo.setHeadSha("abc123");
		this.fakeRepo.setBranch("main");
	},
);

Given(
	"a managed document whose remote body hash diverges from local base \\(DIVERGED state\\)",
	function (this: BddWorld) {
		const docUuid = "019f56e4-18f5-759b-bfdf-5438918bb3bc";
		const pageId = "page-diverged";

		// Seed local document
		this.fakeRepo.setFile(
			"doc.md",
			`---
marksync:
  uuid: ${docUuid}
---
# Doc

Local content (changed).`,
		);

		// Add fixture page with same version but divergent body
		this.fakeTarget.addFixture({
			id: pageId,
			title: "Doc",
			version: 1, // Same version
			body: "<h1>Doc</h1><p>Remote content (different from local)</p>",
			spaceId: "TEST",
		});

		// Bind the document in lock with divergent hashes
		this.lock.targets.default.documents[docUuid] = {
			uuid: docUuid,
			sourcePath: "doc.md",
			pageId,
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "base-sha",
			sourceContentHash: "local-hash-changed",
			renderedBodyHash: "rendered-hash-changed",
			remoteBodyHash: "remote-hash-different", // DIVERGED
			attachmentHashes: {},
			operationId: "op-old",
			synchronizedAt: "2025-01-01T00:00:00Z",
			toolVersion: "1.0.0",
		};

		this.fakeRepo.setHeadSha("abc123");
		this.fakeRepo.setBranch("main");
	},
);

When(
	"computePlan + applyPlan run without --adopt/--rebind",
	async function (this: BddWorld) {
		// Call REAL computePlan (DEC-4: domain logic is real, only adapter ports are mocked)
		this.planResult = await computePlan(
			this.config,
			this.lock,
			this.fakeRepo,
			this.fakeTarget,
		);

		// If plan succeeded, call applyPlan with proper options
		if (this.planResult.ok) {
			this.applyResult = await applyPlan(
				this.planResult.value,
				this.fakeTarget,
				this.lock,
				this.applyOpts,
			);
		}
	},
);

Then("the drifted document is Blocked", function (this: BddWorld) {
	if (!this.planResult || !this.planResult.ok) {
		throw new Error("Expected computePlan to succeed");
	}

	const plan = this.planResult.value;
	const entry = Object.values(plan.entries)[0];

	if (!entry) {
		throw new Error("Expected at least one plan entry");
	}

	if (entry.action.kind !== "Block") {
		throw new Error(
			`Expected action.kind to be "Block" but got "${entry.action.kind}"`,
		);
	}
});

Then("the diverged document is Blocked", function (this: BddWorld) {
	if (!this.planResult || !this.planResult.ok) {
		throw new Error("Expected computePlan to succeed");
	}

	const plan = this.planResult.value;
	const entry = Object.values(plan.entries)[0];

	if (!entry) {
		throw new Error("Expected at least one plan entry");
	}

	if (entry.action.kind !== "Block") {
		throw new Error(
			`Expected action.kind to be "Block" but got "${entry.action.kind}"`,
		);
	}
});

Then("FakeTarget received 0 updatePage calls", function (this: BddWorld) {
	if (this.fakeTarget.updatePageCalls.length !== 0) {
		throw new Error(
			`Expected 0 updatePage calls but got ${this.fakeTarget.updatePageCalls.length}`,
		);
	}
});

Then("FakeTarget received 0 createPage calls", function (this: BddWorld) {
	if (this.fakeTarget.createPageCalls.length !== 0) {
		throw new Error(
			`Expected 0 createPage calls but got ${this.fakeTarget.createPageCalls.length}`,
		);
	}
});

When("computePlan + applyPlan run", async function (this: BddWorld) {
	// Call REAL computePlan (DEC-4: domain logic is real, only adapter ports are mocked)
	this.planResult = await computePlan(
		this.config,
		this.lock,
		this.fakeRepo,
		this.fakeTarget,
	);

	// If plan succeeded, call applyPlan with proper options
	if (this.planResult.ok) {
		this.applyResult = await applyPlan(
			this.planResult.value,
			this.fakeTarget,
			this.lock,
			this.applyOpts,
		);
	}
});