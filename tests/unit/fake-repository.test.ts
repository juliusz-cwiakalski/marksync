// tests/_helpers/fake-repository.test.ts
//
// FakeRepository stub coverage — exercises every Repository method and the
// exported glob helper so the in-memory fake clears the per-file coverage
// threshold (GH-23 MS2-E3-S6).

import { describe, expect, test } from "bun:test";
import {
	FakeRepository,
	matchesPattern,
} from "#tests/_helpers/fake-repository";

describe("FakeRepository — stub defaults for Repository methods", () => {
	test("constructor wires headSha/branch/subjects and round-trips files", () => {
		const repo = new FakeRepository({
			files: { "docs/a.md": "hello" },
			headSha: "deadbeef",
			branch: "feat/x",
			subjects: ["feat: a"],
		});
		expect(repo.headSha().value).toBe("deadbeef");
		expect(repo.currentBranch().value).toBe("feat/x");
		expect(repo.listCommitSubjects().value).toEqual(["feat: a"]);
		expect(repo.getFile("docs/a.md")).toEqual(
			new TextEncoder().encode("hello"),
		);
	});

	test("setFile / getFile round-trip arbitrary content; missing paths are undefined", () => {
		const repo = new FakeRepository();
		repo.setFile("x.md", "body");
		expect(repo.getFile("x.md")).toEqual(new TextEncoder().encode("body"));
		expect(repo.getFile("missing.md")).toBeUndefined();
	});

	test("setHeadSha / setBranch / setSubjects mutate the returned values", () => {
		const repo = new FakeRepository();
		repo.setHeadSha("abc123");
		repo.setBranch("main");
		repo.setSubjects(["s1", "s2"]);
		expect(repo.headSha().value).toBe("abc123");
		expect(repo.currentBranch().value).toBe("main");
		expect(repo.listCommitSubjects().value).toEqual(["s1", "s2"]);
	});

	test("readCommitted filters files by glob patterns", () => {
		const repo = new FakeRepository({
			files: {
				"docs/a.md": "a",
				"docs/b.txt": "b",
				"other/c.md": "c",
			},
		});
		const r = repo.readCommitted("HEAD", ["docs/*.md"]);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect([...r.value.keys()].sort()).toEqual(["docs/a.md"]);
		}
	});

	test("listCommitSubjects forwards an optional range unchanged", () => {
		const repo = new FakeRepository({ subjects: ["x"] });
		const r = repo.listCommitSubjects("HEAD~1..HEAD");
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value).toEqual(["x"]);
		}
	});
});

describe("matchesPattern — glob → regex translation", () => {
	test("single-segment wildcard matches by extension", () => {
		expect(matchesPattern("a.md", "*.md")).toBe(true);
		expect(matchesPattern("a.txt", "*.md")).toBe(false);
	});

	test("literal path matches exactly (escapes dots)", () => {
		expect(matchesPattern("docs/a.md", "docs/a.md")).toBe(true);
		expect(matchesPattern("docs/b.md", "docs/a.md")).toBe(false);
	});

	test("double-star matches across directories", () => {
		expect(matchesPattern("a/b.md", "**/*.md")).toBe(true);
		expect(matchesPattern("a/b.txt", "**/*.md")).toBe(false);
	});

	test("bare double-star matches anything (including empty)", () => {
		expect(matchesPattern("anything", "**")).toBe(true);
		expect(matchesPattern("", "**")).toBe(true);
	});
});
