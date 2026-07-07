// src/shared/glob.ts
//
// Zero-dependency glob matcher (DEC-5 — resolves GH-15 DoR iter-1 Finding 3 /
// RSK-6 / spec OQ-2 matcher-library sub-question).
//
// `picomatch` (or any third-party glob library) is deliberately NOT used: this
// hand-rolled matcher preserves the spec's NFR-7 runtime-dependency envelope
// (`yaml` + `ajv` only), so no allowed-dependency list extension and no TDR are
// required. `src/shared/` is a pure utility namespace (string/path logic only;
// it imports no tier — see typescript.md §"Shared tier note").
//
// ## Semantics (standard micromatch-style)
//
// Patterns are translated to regular expressions and matched against path
// strings as supplied (forward-slash separators, repo-relative). There is **no**
// leading-slash special-casing and **no** filesystem access: a pattern is pure
// text-matching over whatever the caller passes. This is the contract
// `selectFiles` (app tier) relies on — paths are repo-relative entries from the
// Git adapter (E3-S3), and `select`/`exclude` globs match those entries
// verbatim (GH-15 OQ-2 anchoring resolution: patterns match the supplied path
// entries directly; `root` is used by the hierarchy step, not by selection).
//
// Wildcards:
//   - `**` — matches any number of path segments (including zero) when it
//     occupies a full segment. `docs/**/*.md` matches `docs/a.md`,
//     `docs/a/b.md`, `docs/a/b/c.md`. A trailing/standalone `**` matches any
//     suffix across separators.
//   - `*`  — matches any run of characters except the path separator `/`.
//   - `?`  — matches exactly one character except `/`.
//
// Everything else is a literal (regex-special characters are escaped).

/** Characters that are special in a regular expression and need escaping. */
const REGEX_SPECIAL = new Set([
	".",
	"+",
	"(",
	")",
	"[",
	"]",
	"{",
	"}",
	"^",
	"$",
	"|",
	"\\",
	"-",
]);

function escapeLiteral(ch: string): string {
	return REGEX_SPECIAL.has(ch) ? `\\${ch}` : ch;
}

/**
 * Compile a micromatch-style glob into a anchored `RegExp` (anchored to the
 * whole string via `^…$` so partial matches do not leak).
 */
export function globToRegExp(pattern: string): RegExp {
	let src = "^";
	for (let i = 0; i < pattern.length; ) {
		// `charAt` returns `string` (never `undefined`), satisfying
		// `noUncheckedIndexedAccess` — the loop guard keeps us in bounds.
		const ch = pattern.charAt(i);
		if (ch === "*") {
			// Detect a run of one or more `*`.
			let stars = 0;
			while (pattern.charAt(i) === "*") {
				stars++;
				i++;
			}
			const next = pattern.charAt(i);
			if (stars >= 2) {
				// `**` — recurse across directories.
				if (next === "/") {
					// `**/` matches zero or more leading path segments, so
					// `a/**/b` matches both `a/b` and `a/x/y/b`.
					src += "(?:.*/)?";
					i++; // consume the separating `/`
				} else {
					// `**` at end or before a non-separator char: match any
					// suffix including separators.
					src += ".*";
				}
			} else {
				// Single `*` — any run within one segment (no `/`).
				src += "[^/]*";
			}
		} else if (ch === "?") {
			src += "[^/]";
			i++;
		} else {
			src += escapeLiteral(ch);
			i++;
		}
	}
	src += "$";
	return new RegExp(src);
}

/**
 * Test whether `path` matches the glob `pattern`. Pure: no I/O, no caching of
 * external state (the compiled RegExp is local to the call).
 */
export function matchGlob(pattern: string, path: string): boolean {
	return globToRegExp(pattern).test(path);
}

/**
 * Return the subset of `paths` that match `pattern`. Order of the input is
 * preserved (selection de-dup/sort is the caller's concern — see
 * `selectFiles`).
 */
export function filterByGlob(
	pattern: string,
	paths: readonly string[],
): string[] {
	const re = globToRegExp(pattern);
	return paths.filter((p) => re.test(p));
}
