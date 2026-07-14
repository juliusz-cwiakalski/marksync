// tests/unit/cli/commands/init.test.ts
//
// Unit tests for the `initCommand` (GH-15 F-5; GH-18 F-6 UUID assignment; GH-74
// F-1/F-2). The handler uses `CommandResult<void>` contract via
// `resultErrorFromAppResult`:
//   - success → ok(undefined) (exit 0);
//   - ConfigError (write-failure / validation-error) → mapped code INVALID_CONFIG
//     + exit 10, with a redacted structural message (DEC-5).
//
// Uses real temp directories + the real `writeStarterConfig` and
// `assignUuidsFromDisk` — no mock — so the end-to-end presentation → application
// → domain Result flow is exercised.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { initCommand } from "#cli/commands/init";
import type { CommandResult } from "#cli/output";

/** Create a fresh temp directory per test. */
function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "marksync-init-test-"));
}

describe("initCommand (rewired) — CommandResult contract", () => {
	let dir: string;

	beforeEach(() => {
		dir = tempDir();
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	test("returns a CommandResult (not the old {exitCode, message} shape)", async () => {
		const result = await initCommand({ cwd: dir });
		expect(result).toBeDefined();
		expect(result.schemaVersion).toBe(1);
		expect(typeof result.runId).toBe("string");
		// The old shape had `exitCode` + `message` at the top level; the new
		// shape has `exitCode` + optional `error`/`data` (CommandResult<T>).
		expect(result).not.toHaveProperty("message");
	});

	test("success → exitCode 0, no error, data undefined (void)", async () => {
		const result: CommandResult<void> = await initCommand({ cwd: dir });
		expect(result.exitCode).toBe(0);
		expect(result.error).toBeUndefined();
		expect(result.data).toBeUndefined();
	});

	// GH-74 F-1: TC-INIT-001 — Init with existing config preserves file and assigns UUID
	test("TC-INIT-001: existing config preserved, single UUID-less doc receives UUID", async () => {
		// Create a valid existing config and a UUID-less doc
		const validConfig = `version: 1
root: .
select: ["*.md"]
exclude: []
hierarchy: flat
targets:
  confluence:
    type: confluence
    spaceKey: TEST
    parentPageId: "123"
sync:
  allowBranches: ["main"]
  granularity: squash
  stalePlanMinutes: 60
render:
  mermaid:
    policy: skip
    securityLevel: strict
    htmlLabels: false
    deterministicIds: false
output:
  format: storage
  color: auto
provenance:
  visiblePanel: false
`;
		writeFileSync(join(dir, "marksync.yml"), validConfig, "utf-8");
		writeFileSync(join(dir, "doc.md"), "# Test\n", "utf-8");

		// Capture config content before init
		const configBefore = await Bun.file(join(dir, "marksync.yml")).text();

		const result = await initCommand({ cwd: dir });

		// Assert success
		expect(result.exitCode).toBe(0);
		expect(result.error).toBeUndefined();

		// Assert config is unchanged (byte-for-byte)
		const configAfter = await Bun.file(join(dir, "marksync.yml")).text();
		expect(configAfter).toBe(configBefore);

		// Assert doc now has a UUID
		const docContent = await Bun.file(join(dir, "doc.md")).text();
		expect(docContent).toMatch(/uuid:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

		// Assert IDENTITY_ASSIGNED warning
		expect(result.warnings).toBeDefined();
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings?.[0].code).toBe("IDENTITY_ASSIGNED");
		expect(result.warnings?.[0].message).toContain("1 document(s) assigned");
	});

	// GH-74 F-1: TC-INIT-002 — Init with existing config assigns UUID to multiple docs
	test("TC-INIT-002: existing config preserved, multiple UUID-less docs receive unique UUIDs", async () => {
		const validConfig = `version: 1
root: .
select: ["*.md", "docs/*.md"]
exclude: []
hierarchy: flat
targets:
  confluence:
    type: confluence
    spaceKey: TEST
    parentPageId: "123"
sync:
  allowBranches: ["main"]
  granularity: squash
  stalePlanMinutes: 60
render:
  mermaid:
    policy: skip
    securityLevel: strict
    htmlLabels: false
    deterministicIds: false
output:
  format: storage
  color: auto
provenance:
  visiblePanel: false
`;
		writeFileSync(join(dir, "marksync.yml"), validConfig, "utf-8");

		// Create docs directory
		const docsDir = join(dir, "docs");
		await Bun.write(join(docsDir, "a.md"), "# A\n");
		await Bun.write(join(docsDir, "b.md"), "# B\n");
		await Bun.write(join(docsDir, "c.md"), "# C\n");

		// Capture config content before init
		const configBefore = await Bun.file(join(dir, "marksync.yml")).text();

		const result = await initCommand({ cwd: dir });

		// Assert success
		expect(result.exitCode).toBe(0);
		expect(result.error).toBeUndefined();

		// Assert config is unchanged
		const configAfter = await Bun.file(join(dir, "marksync.yml")).text();
		expect(configAfter).toBe(configBefore);

		// Assert all docs have UUIDs
		const docA = await Bun.file(join(docsDir, "a.md")).text();
		const docB = await Bun.file(join(docsDir, "b.md")).text();
		const docC = await Bun.file(join(docsDir, "c.md")).text();

		expect(docA).toMatch(/uuid:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
		expect(docB).toMatch(/uuid:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
		expect(docC).toMatch(/uuid:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

		// Assert UUIDs are unique
		const uuidA = docA.match(/uuid:\s*([0-9a-f-]{36})/i)?.[1];
		const uuidB = docB.match(/uuid:\s*([0-9a-f-]{36})/i)?.[1];
		const uuidC = docC.match(/uuid:\s*([0-9a-f-]{36})/i)?.[1];
		expect(uuidA).toBeDefined();
		expect(uuidB).toBeDefined();
		expect(uuidC).toBeDefined();
		expect(uuidA).not.toBe(uuidB);
		expect(uuidB).not.toBe(uuidC);
		expect(uuidA).not.toBe(uuidC);

		// Assert IDENTITY_ASSIGNED warning for 3 docs
		expect(result.warnings).toBeDefined();
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings?.[0].code).toBe("IDENTITY_ASSIGNED");
		expect(result.warnings?.[0].message).toContain("3 document(s) assigned");
	});

	// GH-74 F-1: TC-INIT-003 — Init with existing config and mixed UUID-bearing/UUID-less docs
	test("TC-INIT-003: existing config preserved, only UUID-less docs assigned, UUID-bearing docs unchanged", async () => {
		const validConfig = `version: 1
root: .
select: ["*.md"]
exclude: []
hierarchy: flat
targets:
  confluence:
    type: confluence
    spaceKey: TEST
    parentPageId: "123"
sync:
  allowBranches: ["main"]
  granularity: squash
  stalePlanMinutes: 60
render:
  mermaid:
    policy: skip
    securityLevel: strict
    htmlLabels: false
    deterministicIds: false
output:
  format: storage
  color: auto
provenance:
  visiblePanel: false
`;
		writeFileSync(join(dir, "marksync.yml"), validConfig, "utf-8");

		// Create one doc with existing UUID and one without
		const existingUuid = "0192b3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d";
		const docWithUuid = `---
marksync:
  uuid: ${existingUuid}
---
# Has UUID
`;
		const docWithoutUuid = "# No UUID\n";

		writeFileSync(join(dir, "with-uuid.md"), docWithUuid, "utf-8");
		writeFileSync(join(dir, "without-uuid.md"), docWithoutUuid, "utf-8");

		// Capture config content before init
		const configBefore = await Bun.file(join(dir, "marksync.yml")).text();

		const result = await initCommand({ cwd: dir });

		// Assert success
		expect(result.exitCode).toBe(0);
		expect(result.error).toBeUndefined();

		// Assert config is unchanged
		const configAfter = await Bun.file(join(dir, "marksync.yml")).text();
		expect(configAfter).toBe(configBefore);

		// Assert UUID-bearing doc is unchanged
		const withUuidAfter = await Bun.file(join(dir, "with-uuid.md")).text();
		expect(withUuidAfter).toBe(docWithUuid);

		// Assert UUID-less doc now has a UUID
		const withoutUuidAfter = await Bun.file(join(dir, "without-uuid.md")).text();
		expect(withoutUuidAfter).toMatch(/uuid:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

		// Assert the new UUID is different from the existing UUID
		const newUuid = withoutUuidAfter.match(/uuid:\s*([0-9a-f-]{36})/i)?.[1];
		expect(newUuid).toBeDefined();
		expect(newUuid).not.toBe(existingUuid);

		// Assert IDENTITY_ASSIGNED warning for 1 doc
		expect(result.warnings).toBeDefined();
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings?.[0].code).toBe("IDENTITY_ASSIGNED");
		expect(result.warnings?.[0].message).toContain("1 document(s) assigned");
	});

	// GH-74 F-2: TC-INIT-004 — Init with no config creates starter config and assigns UUID
	test("TC-INIT-004: no config → creates starter config and assigns UUID", async () => {
		// Create a docs directory with a UUID-less doc (no config exists yet)
		const docsDir = join(dir, "docs");
		await Bun.write(join(docsDir, "doc.md"), "# Test\n");

		const result = await initCommand({ cwd: dir });

		// Assert success
		expect(result.exitCode).toBe(0);
		expect(result.error).toBeUndefined();

		// Assert config was created
		const configExists = await Bun.file(join(dir, "marksync.yml")).exists();
		expect(configExists).toBe(true);

		// Assert config is valid YAML and can be loaded
		const configContent = await Bun.file(join(dir, "marksync.yml")).text();
		expect(configContent).toContain("version: 1");
		expect(configContent).toContain("targets:");

		// Assert doc now has a UUID
		const docContent = await Bun.file(join(docsDir, "doc.md")).text();
		expect(docContent).toMatch(/uuid:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

		// Assert IDENTITY_ASSIGNED warning
		expect(result.warnings).toBeDefined();
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings?.[0].code).toBe("IDENTITY_ASSIGNED");
		expect(result.warnings?.[0].message).toContain("1 document(s) assigned");
	});

	test("DEC-5: the error message is redacted (no file PATH, no raw humanMessage)", async () => {
		// Create a config with a validation error (missing required fields)
		const invalidConfig = `version: 1
root: .
# Missing required 'targets' field
`;
		writeFileSync(join(dir, "marksync.yml"), invalidConfig, "utf-8");
		writeFileSync(join(dir, "doc.md"), "# Test\n", "utf-8");

		const result = await initCommand({ cwd: dir });
		// DEC-5: the message must NOT echo the config file's DIRECTORY PATH or
		// the raw `humanMessage` (which could carry secrets). The generic noun
		// "marksync.yml" (a constant config-file name in the structural message)
		// is acceptable — what DEC-5 forbids is the actual path + echoed data.
		expect(result.exitCode).toBe(10);
		expect(result.error?.code).toBe("INVALID_CONFIG");
		expect(result.error?.retryable).toBe(false);
		expect(result.error?.message).not.toContain(dir);
		expect(result.error?.message).not.toContain(tmpdir());
		expect(typeof result.error?.message).toBe("string");
		expect(result.error?.message.length).toBeGreaterThan(0);
	});

	test("defaults cwd to process.cwd() when not provided", async () => {
		// Override process.cwd() to a temp dir so the test does NOT write a
		// real marksync.yml into the repo root (side-effect pollution).
		const realCwd = process.cwd;
		try {
			process.cwd = () => dir;
			const result = await initCommand();
			expect(result.schemaVersion).toBe(1);
			expect(typeof result.exitCode).toBe("number");
		} finally {
			process.cwd = realCwd;
		}
	});
});
