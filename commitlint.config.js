// commitlint.config.js — Conventional Commits enforcement (TDR-0008).
//
// Extends @commitlint/config-conventional — the standard preset (TDR-0008 C-1/C-4:
// "do not invent custom rules"). Override: header-max-length = 72 per
// typescript.md §"Git conventions" (the preset default is 100).
//
// Merge / revert / [skip ci] automated commits are exempt so they don't trigger
// confusing errors (C-4/C-5). commitlint's defaultIgnores (active) also covers
// merge/revert; these are explicit belt-and-suspenders for the agent-readable
// config.
//
// Imperative mood (typescript.md convention) is advisory: the conventional preset
// enforces subject-case: lowercase but not grammatical mood. Adding the Angular-
// preset-only subject-imperative-mood rule would violate TDR-0008's KISS / "no
// exotic extra rules" principle (C-4: low-friction); the imperative convention is
// documented in typescript.md and enforced in review, not mechanically.
export default {
	extends: ["@commitlint/config-conventional"],
	rules: {
		"header-max-length": [2, "always", 72],
	},
	ignores: [
		(commit) => commit.startsWith("Merge "),
		(commit) => commit.startsWith("Revert "),
		(commit) => commit.includes("[skip ci]"),
	],
};
