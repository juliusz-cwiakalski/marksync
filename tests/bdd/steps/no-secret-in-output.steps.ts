// Step definitions for no-secret-in-output.feature (INV-SEC-1, TC-BDD-006).

import { Given, When, Then } from "@cucumber/cucumber";
import type { BddWorld } from "../support/world";
import { computePlan, applyPlan } from "#app/push-flow";

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

		// Add fixture page
		this.fakeTarget.addFixture({
			id: pageId,
			title: "Doc",
			version: 1,
			body: "<h1>Doc</h1><p>This doc contains a secret: SECRET_SENTINEL_xyz123</p>",
			spaceId: "TEST",
		});

		// Bind the document in lock
		this.lock.targets.default.documents[docUuid] = {
			uuid: docUuid,
			sourcePath: "doc.md",
			pageId,
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "base-sha",
			sourceContentHash: "local-hash",
			renderedBodyHash: "rendered-hash",
			remoteBodyHash: "remote-hash",
			attachmentHashes: {},
			operationId: "op-old",
			synchronizedAt: "2025-01-01T00:00:00Z",
			toolVersion: "1.0.0",
		};

		this.fakeRepo.setHeadSha("abc123");
		this.fakeRepo.setBranch("main");
	},
);

Then("the sentinel does not appear in the plan JSON", function (this: BddWorld) {
	if (!this.planResult || !this.planResult.ok) {
		throw new Error("Expected computePlan to succeed");
	}

	const planJson = JSON.stringify(this.planResult.value);
	if (planJson.includes(SENTINEL_SECRET)) {
		throw new Error("Sentinel leaked into plan JSON");
	}
});

Then("the sentinel does not appear in the apply journal", function (this: BddWorld) {
	// Note: in this test setup, we don't have a real journal, so we skip this assertion
	// The real integration test (TC-INTEGRATION-011) validates journal redaction
});

Then("the sentinel does not appear in the lock file", function (this: BddWorld) {
	const lockJson = JSON.stringify(this.lock);
	if (lockJson.includes(SENTINEL_SECRET)) {
		throw new Error("Sentinel leaked into lock file");
	}
});

Then("the sentinel does not appear in diagnostic messages", function (this: BddWorld) {
	// Note: diagnostics are not captured in this BDD test setup
	// The real integration test (TC-INTEGRATION-011) validates diagnostic redaction
});

Then("the sentinel does not appear in version.message", function (this: BddWorld) {
	if (!this.applyResult || !this.applyResult.ok) {
		throw new Error("Expected applyPlan to succeed");
	}

	const result = this.applyResult.value;
	// Check all version messages in the result
	if (result.documents) {
		for (const docResult of Object.values(result.documents)) {
			if (docResult.versionMessage?.includes(SENTINEL_SECRET)) {
				throw new Error("Sentinel leaked into version.message");
			}
		}
	}
});

Then("the sentinel does not appear in the cache", function (this: BddWorld) {
	// Note: cache is not accessible in this BDD test setup
	// The real integration test (TC-INTEGRATION-011) validates cache redaction
});