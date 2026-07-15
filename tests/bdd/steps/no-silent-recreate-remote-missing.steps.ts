// Step definitions for no-silent-recreate-remote-missing.feature (INV-SAFE-2, TC-BDD-003 + TC-BDD-004).

import { Given, When, Then } from "@cucumber/cucumber";
import type { BddWorld } from "../support/world";
import { computePlan, applyPlan } from "#app/push-flow";

Given(
	"a managed page whose remote was deleted \\(FakeTarget returns RemoteMissing\\)",
	function (this: BddWorld) {
		const docUuid = "019f56e4-18f5-759b-bfdf-5438918bb3bc";
		const pageId = "page-deleted";

		// Seed local document
		this.fakeRepo.setFile(
			"doc.md",
			`---
marksync:
  uuid: ${docUuid}
---
# Doc

Local content.`,
		);

		// DO NOT add fixture page (so FakeTarget.getPage returns RemoteMissing)

		// Bind the document in lock (remote was deleted)
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

Given(
	"a corpus with 3 managed documents, one of which is REMOTE_MISSING",
	function (this: BddWorld) {
		const doc1Uuid = "019f56e4-18f5-759b-bfdf-5438918bb3bc";
		const doc2Uuid = "019f56e4-18f5-759c-bfdf-5438918bb3bc";
		const doc3Uuid = "019f56e4-18f5-759d-bfdf-5438918bb3bc"; // REMOTE_MISSING

		const page1Id = "page-1";
		const page2Id = "page-2";
		const page3Id = "page-3-deleted";

		// Seed 3 local documents
		this.fakeRepo.setFile(
			"doc1.md",
			`---
marksync:
  uuid: ${doc1Uuid}
---
# Doc 1`,
		);

		this.fakeRepo.setFile(
			"doc2.md",
			`---
marksync:
  uuid: ${doc2Uuid}
---
# Doc 2`,
		);

		this.fakeRepo.setFile(
			"doc3.md",
			`---
marksync:
  uuid: ${doc3Uuid}
---
# Doc 3 (REMOTE_MISSING)`,
		);

		// Add fixtures for doc1 and doc2 only (doc3 is REMOTE_MISSING)
		this.fakeTarget.addFixture({
			id: page1Id,
			title: "Doc 1",
			version: 1,
			body: "<h1>Doc 1</h1>",
			spaceId: "TEST",
		});

		this.fakeTarget.addFixture({
			id: page2Id,
			title: "Doc 2",
			version: 1,
			body: "<h1>Doc 2</h1>",
			spaceId: "TEST",
		});

		// DO NOT add fixture for doc3 (REMOTE_MISSING)

		// Bind all 3 documents in lock
		this.lock.targets.default.documents[doc1Uuid] = {
			uuid: doc1Uuid,
			sourcePath: "doc1.md",
			pageId: page1Id,
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "base-sha",
			sourceContentHash: "local-hash-1",
			renderedBodyHash: "rendered-hash-1",
			remoteBodyHash: "remote-hash-1",
			attachmentHashes: {},
			operationId: "op-old",
			synchronizedAt: "2025-01-01T00:00:00Z",
			toolVersion: "1.0.0",
		};

		this.lock.targets.default.documents[doc2Uuid] = {
			uuid: doc2Uuid,
			sourcePath: "doc2.md",
			pageId: page2Id,
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "base-sha",
			sourceContentHash: "local-hash-2",
			renderedBodyHash: "rendered-hash-2",
			remoteBodyHash: "remote-hash-2",
			attachmentHashes: {},
			operationId: "op-old",
			synchronizedAt: "2025-01-01T00:00:00Z",
			toolVersion: "1.0.0",
		};

		this.lock.targets.default.documents[doc3Uuid] = {
			uuid: doc3Uuid,
			sourcePath: "doc3.md",
			pageId: page3Id,
			parentPageId: "ROOT",
			pageVersion: 1,
			sourceCommit: "base-sha",
			sourceContentHash: "local-hash-3",
			renderedBodyHash: "rendered-hash-3",
			remoteBodyHash: "remote-hash-3",
			attachmentHashes: {},
			operationId: "op-old",
			synchronizedAt: "2025-01-01T00:00:00Z",
			toolVersion: "1.0.0",
		};

		this.fakeRepo.setHeadSha("abc123");
		this.fakeRepo.setBranch("main");
	},
);

Then("the REMOTE_MISSING document is Blocked", function (this: BddWorld) {
	if (!this.planResult || !this.planResult.ok) {
		throw new Error("Expected computePlan to succeed");
	}

	const plan = this.planResult.value;
	const entry = Object.values(plan.entries).find((e) =>
		e.sourcePath.includes("doc.md"),
	);

	if (!entry) {
		throw new Error("Expected to find plan entry for doc.md");
	}

	if (entry.action.kind !== "Block") {
		throw new Error(
			`Expected action.kind to be "Block" but got "${entry.action.kind}"`,
		);
	}
});

Then(
	"FakeTarget.createPageCalls.length is strictly less than total documents",
	function (this: BddWorld) {
		const totalDocuments = 3;
		if (this.fakeTarget.createPageCalls.length >= totalDocuments) {
			throw new Error(
				`Expected createPageCalls.length (${this.fakeTarget.createPageCalls.length}) < totalDocuments (${totalDocuments})`,
			);
		}
	},
);

Then(
	"the REMOTE_MISSING document is not in the created pages list",
	function (this: BddWorld) {
		// Check that none of the createPage calls are for the REMOTE_MISSING doc
		for (const call of this.fakeTarget.createPageCalls) {
			if (call.title.includes("Doc 3 (REMOTE_MISSING)")) {
				throw new Error(
					"REMOTE_MISSING document should not be in createPage calls",
				);
			}
		}
	},
);

When(
	"computePlan + applyPlan run without --adopt\\/--rebind",
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
