// src/shared/redact.ts
//
// Canonical redaction layer (GH-16 D-4 / F-4 / INV-SEC-1 / NFR-SEC-2 /
// ADR-0011 C-5) — the SINGLE source of truth for credential-scrubbing patterns.
// Imported by BOTH the presentation chokepoint (`src/cli/output/redact.ts`, which
// the OutputService applies to every serialized output byte) and the infra
// transport (`src/infra/confluence/client.ts`, which redacts request/response
// log lines). One pattern set means no drift: the infra transport can never leak
// a shape the presentation layer would catch (GH-21 review iter-2 closed the
// prior ad-hoc mirror that had already dropped the `env-token` arm).
//
// `src/shared/` is a pure utility namespace: this module imports NO tier
// (typescript.md §"Shared tier note" / TDR-0006) — pure regex + string logic,
// so every tier may import it (dep-cruiser permits domain/app/infra/cli → shared).
//
// DEC-4 (authoritative — spec §15 / chg-GH-16-test-plan TC-RED-007): redaction
// is applied to the SERIALIZED output STRING (the JSON string AND the human
// string), NOT the typed object. This is the load-bearing design choice: a
// token nested inside an arbitrary `data` field — exposed only AFTER
// `JSON.stringify` (e.g. a credential embedded inside a Markdown `pageBody`
// string) — is still caught, because the regexes run over the whole rendered
// string. There is intentionally NO deep-walking `redactJson(value)`: walking
// the typed object would MISS substrings that only appear post-serialization,
// which is exactly the class of leak DEC-4 exists to prevent. Redact the string.
//
// RSK-1 / R1 — over-redaction guard (CEO-recorded): patterns are deliberately
// SPECIFIC. Each requires a credential-specific discriminator — a scheme prefix
// (`gh[opsur]_`, `ATATT`/`ATSTS`, `Bearer `/`Basic `, an `Authorization:`
// header, a `MARKSYNC_*_TOKEN=` assignment whose value is strictly longer than
// 20 chars, or an email `@domain.tld` shape). NONE of them is a bare
// "long alphanumeric/hex" catch-all, so a legitimate 40-char hex Git SHA
// survives redaction unmodified (TC-RED-006 / AC-F4-2). The guard is STRUCTURAL
// — no negative-lookahead is needed: a hex SHA simply does not begin with any of
// these discriminators, and none of the value classes is `0-9a-f`-only.

/** A redactable substring kind (emitted in the `[REDACTED:<kind>]` sentinel). */
export type RedactionKind =
	| "authorization"
	| "bearer"
	| "github-token"
	| "atlassian-token"
	| "env-token"
	| "email";

/**
 * A redaction pattern: a global regex plus the `kind` label emitted in the
 * `[REDACTED:<kind>]` sentinel. Patterns MUST carry the `g` flag so a single
 * `String.replace` pass scrubs every occurrence in the string.
 */
export interface RedactionPattern {
	readonly kind: RedactionKind;
	readonly pattern: RegExp;
}

/**
 * The built-in pattern set (spec F-4 / DEC-4). Ordered so the most specific
 * contexts are scrubbed first (`Authorization:` header before a bare
 * `Bearer …`): once a region is replaced it no longer matches later patterns.
 *
 * Value character classes deliberately EXCLUDE `"` and whitespace so the
 * matchers never consume JSON structural quotes or human string delimiters —
 * redacting a JSON string value cannot invalidate the surrounding JSON. The
 * hyphen is placed last in each class so it is treated as a literal (never a
 * range operator) without escaping.
 */
export const DEFAULT_PATTERNS: readonly RedactionPattern[] = [
	{
		kind: "authorization",
		// `Authorization: <scheme> <token>` — any scheme (Bearer/Basic/Token/…).
		pattern: /Authorization:\s*[A-Za-z]+\s+[A-Za-z0-9._+/=-]+/g,
	},
	{
		kind: "bearer",
		// Standalone `Bearer <token>` / `Basic <token>` (no `Authorization:` prefix).
		pattern: /\b(?:Bearer|Basic)\s+[A-Za-z0-9._+/=-]+/g,
	},
	{
		kind: "github-token",
		// GitHub tokens `gho_` / `ghp_` / `ghs_` / `ghu_` / `ghr_` — the
		// `gh[opsur]_` prefix is the discriminator (a hex SHA never starts with it).
		pattern: /\bgh[opsur]_[A-Za-z0-9]{16,}/g,
	},
	{
		kind: "atlassian-token",
		// Atlassian API tokens `ATATT…` / `ATSTS…` (Atlassian secure-token shape).
		pattern: /\bAT(?:ATT|STS)[A-Za-z0-9_-]{8,}/g,
	},
	{
		kind: "env-token",
		// `MARKSYNC_*_TOKEN=<value>` env-style assignment whose value is strictly
		// longer than 20 chars (story R1 — short dummy values are left alone). The
		// `MARKSYNC_…_TOKEN` prefix + separator is the discriminator.
		pattern: /\bMARKSYNC_[A-Z0-9_]*_TOKEN\s*[:=]\s*[A-Za-z0-9._+/=-]{21,}/g,
	},
	{
		kind: "email",
		// `<local>@<domain>.<tld>` email addresses (no `@` in a hex SHA).
		pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
	},
];

/**
 * A configurable redactor. Holds an ordered list of patterns and applies them
 * in sequence to the serialized output string, replacing each match with the
 * `[REDACTED:<kind>]` sentinel. Construct with custom patterns for tests or
 * specialized scrubbing, or use the module-level `DEFAULT_REDACTOR` /
 * `redactString` convenience for the standard built-in set.
 *
 * `String.prototype.replace` with a global regex always starts from index 0
 * (no `lastIndex` carry-over), so a single `Redactor` instance is safe to reuse
 * across many `redactString` calls.
 */
export class Redactor {
	private readonly patterns: readonly RedactionPattern[];

	constructor(patterns: readonly RedactionPattern[] = DEFAULT_PATTERNS) {
		this.patterns = patterns;
	}

	/**
	 * Redact every credential-shaped substring in `input`, replacing each with a
	 * `[REDACTED:<kind>]` sentinel. DEC-4: call this on the SERIALIZED output
	 * string (post-`JSON.stringify` for JSON, post-render for human), not on the
	 * typed object — so a token nested anywhere inside `data` is still caught.
	 */
	redactString(input: string): string {
		let out = input;
		for (const { kind, pattern } of this.patterns) {
			out = out.replace(pattern, `[REDACTED:${kind}]`);
		}
		return out;
	}
}

/** The default redactor with the built-in pattern set (spec F-4). */
export const DEFAULT_REDACTOR = new Redactor();

/**
 * Redact `input` using the default pattern set. Module-level convenience over
 * `DEFAULT_REDACTOR.redactString` — the function the OutputService chokepoint
 * applies to every rendered output string (DEC-4 / INV-SEC-1), and the
 * ConfluenceClient applies to every transport log line.
 */
export function redactString(input: string): string {
	return DEFAULT_REDACTOR.redactString(input);
}

/**
 * Construct a redactor with a custom pattern list (e.g. tests with an extra
 * pattern, or a specialized scrubbing policy). Defaults to the built-in set.
 */
export function createRedactor(
	patterns: readonly RedactionPattern[] = DEFAULT_PATTERNS,
): Redactor {
	return new Redactor(patterns);
}
