// loadLock — the committed shared-base loader (ADR-0006 C-2). Mirrors the
// GH-15 config-loader pattern: read -> yaml parse -> ajv (allErrors+verbose)
// -> Result<LockFile, LockError>. A missing lock is ok(empty) (DEC-5); only a
// present-but-invalid lock is err(CorruptLock).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import { parse as parseYaml } from "yaml";
import { formatAjvErrors, mapAjvErrors } from "#app/config-errors";
import type { LockFile } from "#domain/config/lock-types";
import type { PageBinding } from "#domain/binding/page-binding";
import type { ConfigAjvError, LockError } from "#domain/errors";
import type { DocumentId } from "#domain/identity/document-id";
import { Result } from "#domain/result";
import lockSchema from "../domain/config/lock-schema.json" with {
	type: "json",
};

const LOCK_FILENAME = "marksync.lock.yml";

/**
 * Compiled once (module singleton). `allErrors` collects every violation;
 * `verbose` exposes the offending value so the formatter can build
 * expected-vs-actual messages.
 */
const validateLock = new Ajv({ allErrors: true, verbose: true }).compile(
	lockSchema,
);

/** Build a CorruptLock; `ajvErrors` is omitted (absent) for a parse failure. */
function corruptLock(
	path: string,
	ajvErrors: ConfigAjvError[] | undefined,
	humanMessage: string,
): LockError {
	return {
		kind: "CorruptLock",
		path,
		...(ajvErrors ? { ajvErrors } : {}),
		humanMessage,
	};
}

/**
 * Load and validate `marksync.lock.yml` from `cwd`.
 *
 * - file absent -> `ok({ version: 1, targets: {} })` (DEC-5: a fresh corpus has
 *   no base yet; absence is the initial state, not an error);
 * - YAML parse failure / non-object root -> `err(CorruptLock)`;
 * - ajv failure -> `err(CorruptLock)` with structured `ajvErrors` + an
 *   AI-readable `humanMessage`;
 * - valid -> `ok(LockFile)` with each binding's `uuid` injected from its key.
 */
export function loadLock(cwd: string): Result<LockFile, LockError> {
	const path = join(cwd, LOCK_FILENAME);

	let rawText: string;
	try {
		rawText = readFileSync(path, "utf-8");
	} catch (e) {
		const err = e as NodeJS.ErrnoException;
		if (err.code === "ENOENT") {
			return Result.ok({ version: 1, targets: {} });
		}
		return Result.err(
			corruptLock(path, undefined, `cannot read ${path}: ${err.message}`),
		);
	}

	let parsed: unknown;
	try {
		parsed = parseYaml(rawText);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return Result.err(
			corruptLock(
				path,
				undefined,
				`invalid YAML in ${path}: ${msg}. Suggested fix: check indentation, quoting, and that the document is valid YAML.`,
			),
		);
	}

	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		const got =
			parsed === null
				? "null"
				: Array.isArray(parsed)
					? "array"
					: typeof parsed;
		return Result.err(
			corruptLock(
				path,
				undefined,
				`marksync.lock.yml must contain a YAML object at the top level (got ${got}). Suggested fix: ensure the root is a mapping with 'version' and 'targets'.`,
			),
		);
	}

	if (!validateLock(parsed)) {
		const ajvErrors = validateLock.errors ?? [];
		return Result.err(
			corruptLock(
				path,
				mapAjvErrors(ajvErrors),
				formatAjvErrors(ajvErrors, LOCK_FILENAME),
			),
		);
	}

	return Result.ok(coerceLockFile(parsed));
}

/**
 * Inject each document's `uuid` from its map key (the schema validates the entry
 * without uuid — the uuid IS the key) and brand it as a DocumentId. The brand
 * is erased at runtime; ajv has already validated the 12 entry fields.
 */
function coerceLockFile(parsed: unknown): LockFile {
	const raw = parsed as {
		version: 1;
		targets: Record<
			string,
			{ documents: Record<string, Omit<PageBinding, "uuid">> }
		>;
	};
	const targets: LockFile["targets"] = {};
	for (const [targetId, target] of Object.entries(raw.targets)) {
		const documents: Record<DocumentId, PageBinding> = {};
		for (const [uuid, entry] of Object.entries(target.documents)) {
			const branded = uuid as DocumentId;
			documents[branded] = { ...entry, uuid: branded };
		}
		targets[targetId] = { documents };
	}
	return { version: 1, targets };
}
