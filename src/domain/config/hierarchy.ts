// src/domain/config/hierarchy.ts
//
// Intended page-tree mirroring (GH-15 F-6 — Phase 7). A pure domain rule over
// paths + config: computes the INTENDED parent for each selected file under
// `root`. Structure only — no Confluence page-id resolution (NG-2); that happens
// at sync time (E3-S4/E3-S6).
//
// Domain tier: imports only `#domain/config/types`. No app/cli/infra, no I/O
// (typescript.md tier rules). Cross-OS note (MS-0002 targets Linux + Windows):
// backslash separators are normalized to forward slashes before computation.
//
// ## Hierarchy modes
//
// - `mirror` — the intended parent is the directory containing the file
//   (repo-relative, trailing slash): `docs/a/b.md` → `docs/a/`. A file directly
//   under `root` (e.g. `docs/index.md` with `root: docs/`) intends the root
//   directory itself as its parent; at sync time the root resolves to the
//   configured `targets.<id>.parentPageId` (the Confluence anchor — there is no
//   separate page for the root; it IS the anchor). This is the documented
//   delivery-time resolution of TC-HIER-003's "root-level parent" question.
// - `flat`  — every selected page lives under the single configured parent;
//   `intendedParent` returns `config.root` for all files (the anchor).

import type {
	HierarchyMode,
	IntendedHierarchy,
	IntendedNode,
	ProjectConfig,
} from "#domain/config/types";

/** Normalize a path to forward slashes (Windows compatibility). */
function toForwardSlashes(p: string): string {
	return p.replace(/\\/g, "/");
}

/** Collapse repeated slashes and strip redundant `./` segments. */
function canonicalize(p: string): string {
	let d = toForwardSlashes(p).replace(/\/+/g, "/");
	// strip leading "./" and interior "/./" segments.
	d = d.replace(/(?:^|\/)\.\//g, (m) => (m.startsWith("/") ? "/" : ""));
	// strip a trailing "/." if present.
	d = d.replace(/\/\.$/, "");
	return d;
}

/** Ensure a directory path ends with exactly one trailing slash. */
function withTrailingSlash(dir: string): string {
	if (dir === "") return dir;
	return dir.endsWith("/") ? dir : `${dir}/`;
}

/**
 * Compute the intended Confluence parent path for `filePath` under `config`.
 *
 * - `mirror`: the parent directory of the file (repo-relative, trailing slash).
 *   A file directly under `root` intends the root directory (which resolves to
 *   the configured `parentPageId` at sync time).
 * - `flat`: `config.root` for every file (single configured parent anchor).
 *
 * Pure: no I/O; the input path is canonicalized (backslashes → `/`, redundant
 * `./` and double slashes removed) so output is canonical (TC-HIER-005).
 */
export function intendedParent(
	config: ProjectConfig,
	filePath: string,
): string {
	const root = withTrailingSlash(canonicalize(config.root));

	if (config.hierarchy === "flat") {
		return root;
	}

	// mirror: derive the parent directory of the (canonicalized) file path.
	const normalized = canonicalize(filePath).replace(/\/+$/, "");
	const slash = normalized.lastIndexOf("/");
	const dir = slash <= 0 ? "" : withTrailingSlash(normalized.slice(0, slash));
	// A file with no parent directory (or directly at the repo root) intends
	// the configured root anchor.
	return dir === "" ? root : dir;
}

/**
 * Build the intended page-tree shape for a set of selected files (F-6). Returns
 * one {@link IntendedNode} per file (in input order). The hierarchy `mode` is
 * recorded so downstream resolution knows how to interpret the parents.
 */
export function buildIntendedHierarchy(
	config: ProjectConfig,
	selectedFiles: readonly string[],
): IntendedHierarchy {
	const nodes: IntendedNode[] = selectedFiles.map((filePath) => ({
		filePath,
		intendedParent: intendedParent(config, filePath),
	}));
	const mode: HierarchyMode = config.hierarchy;
	return { mode, nodes };
}
