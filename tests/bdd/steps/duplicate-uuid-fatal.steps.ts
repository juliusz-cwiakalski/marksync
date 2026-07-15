// Step definitions for duplicate-uuid-fatal.feature (INV-SAFE-3, TC-BDD-005).

import { Given, When, Then } from "@cucumber/cucumber";
import type { BddWorld } from "../support/world";
import { computePlan } from "#app/push-flow";
import { Result as Res } from "#domain/result";

Given(
	"a corpus with two documents sharing the same marksync.uuid",
	function (this: BddWorld) {
		const duplicateUuid = "019f56e4-18f5-759b-bfdf-5438918bb3bc";

		// Seed two markdown files with identical UUID-v7 front-matter
		this.fakeRepo.setFile(
			"doc-a.md",
			`---
marksync:
  uuid: ${duplicateUuid}
---
# Doc A

This is doc A content.`,
		);

		this.fakeRepo.setFile(
			"doc-b.md",
			`---
marksync:
  uuid: ${duplicateUuid}
---
# Doc B

This is doc B content.`,
		);

		// Ensure the git repo is in the correct state
		this.fakeRepo.setHeadSha("abc123");
		this.fakeRepo.setBranch("main");
	},
);

When("a sync is run", async function (this: BddWorld) {
	// Call the REAL computePlan (DEC-4: domain logic is real, only adapter ports are mocked)
	this.planResult = await computePlan(
		this.config,
		this.lock,
		this.fakeRepo,
		this.fakeTarget,
	);
});

Then(
	"detectDuplicateUuids returns err\\(DuplicateUuid) naming both source paths",
	function (this: BddWorld) {
		if (!this.planResult) {
			throw new Error("planResult is undefined");
		}

		// Assert the result is an error (computePlan aborted at duplicate-UUID gate)
		if (this.planResult.ok) {
			throw new Error(
				"Expected computePlan to return err(DuplicateUuid) but got success",
			);
		}

		const error = this.planResult.error as { kind: string; uuid: string; paths: string[] };

		// Assert error kind is DuplicateUuid
		if (error.kind !== "DuplicateUuid") {
			throw new Error(
				`Expected error.kind to be "DuplicateUuid" but got "${error.kind}"`,
			);
		}

		// Assert both source paths are named
		if (!error.paths.includes("doc-a.md")) {
			throw new Error("Expected paths to include 'doc-a.md'");
		}
		if (!error.paths.includes("doc-b.md")) {
			throw new Error("Expected paths to include 'doc-b.md'");
		}
	},
);

Then("zero pages are written to Confluence", function (this: BddWorld) {
	// Assert NO createPage or updatePage calls reached the target (zero writes)
	if (this.fakeTarget.createPageCalls.length !== 0) {
		throw new Error(
			`Expected 0 createPage calls but got ${this.fakeTarget.createPageCalls.length}`,
		);
	}
	if (this.fakeTarget.updatePageCalls.length !== 0) {
		throw new Error(
			`Expected 0 updatePage calls but got ${this.fakeTarget.updatePageCalls.length}`,
		);
	}
});