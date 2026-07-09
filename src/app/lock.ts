// Lock loader + saver (ADR-0006 C-2). loadLock mirrors the GH-15 config-loader
// pattern (read -> yaml -> ajv -> Result); saveLock serializes line-oriented,
// UUID-ordered YAML and writes it atomically. mergeBindings is the deterministic
// union primitive. A missing lock is ok(empty) (DEC-5); only a present-but-
// invalid lock is err(CorruptLock).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { formatAjvErrors, mapAjvErrors } from "#app/config-errors";
import type { LockFile } from "#domain/config/lock-types";
import type { PageBinding } from "#domain/binding/page-binding";
import type { ConfigAjvError, LockError } from "#domain/errors";
import type { DocumentId } from "#domain/identity/document-id";
import { Result } from "#domain/result";
import { writeAtomic } from "#infra/lock/store";
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

/** The serialized entry = PageBinding minus `uuid` (uuid is the documents key). */
type SerializedEntry = Omit<PageBinding, "uuid">;

/** Project a PageBinding to its serialized form in a canonical field order. */
function toSerializedEntry(b: PageBinding): SerializedEntry {
	return {
		sourcePath: b.sourcePath,
		pageId: b.pageId,
		parentPageId: b.parentPageId,
		pageVersion: b.pageVersion,
		sourceCommit: b.sourceCommit,
		sourceContentHash: b.sourceContentHash,
		renderedBodyHash: b.renderedBodyHash,
		remoteBodyHash: b.remoteBodyHash,
		attachmentHashes: b.attachmentHashes,
		operationId: b.operationId,
		synchronizedAt: b.synchronizedAt,
		toolVersion: b.toolVersion,
	};
}

/**
 * Serialize a LockFile as line-oriented YAML with documents in sorted UUID order
 * (PD-1 / DEC-1) so two branches adding different-UUID docs land in distinct,
 * non-overlapping line regions and merge cleanly. The uuid is the key (not a
 * duplicated field); `lineWidth: 0` keeps each field on its own line.
 */
export function serializeLock(lock: LockFile): string {
	const targets: Record<
		string,
		{ documents: Record<string, SerializedEntry> }
	> = {};
	for (const targetId of Object.keys(lock.targets).sort()) {
		const target = lock.targets[targetId];
		if (!target) continue;
		const documents: Record<string, SerializedEntry> = {};
		for (const uuid of Object.keys(target.documents).sort()) {
			const binding = target.documents[uuid as DocumentId];
			if (!binding) continue;
			documents[uuid] = toSerializedEntry(binding);
		}
		targets[targetId] = { documents };
	}
	return stringifyYaml({ version: lock.version, targets }, { lineWidth: 0 });
}

/**
 * Atomically write `lock` to `<cwd>/marksync.lock.yml` (F-1 / F-3). Serializes
 * via {@link serializeLock} then hands off to the atomic store; the destination
 * is never partially written.
 */
export function saveLock(cwd: string, lock: LockFile): Result<void, LockError> {
	return writeAtomic(join(cwd, LOCK_FILENAME), serializeLock(lock));
}

/**
 * Merge two lock files into a union (PD-4 / DEC-4). Targets and documents are
 * unioned by key; on a UUID present in both, `b` wins (last-write-wins). Pure
 * and deterministic — the primitive E3-S6 wires into serialized apply; conflict
 * policy beyond last-write-wins belongs to E3-S7 / `repair-state`.
 */
export function mergeBindings(a: LockFile, b: LockFile): LockFile {
	const targets: LockFile["targets"] = {};
	const targetIds = new Set([
		...Object.keys(a.targets),
		...Object.keys(b.targets),
	]);
	for (const targetId of targetIds) {
		const aDocs = a.targets[targetId]?.documents ?? {};
		const bDocs = b.targets[targetId]?.documents ?? {};
		const documents: Record<DocumentId, PageBinding> = { ...aDocs };
		for (const [uuid, binding] of Object.entries(bDocs)) {
			documents[uuid as DocumentId] = binding;
		}
		targets[targetId] = { documents };
	}
	return { version: 1, targets };
}
