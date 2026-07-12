// src/app/config-lock-mappers.ts
//
// Mapping functions for ConfigError and LockError → ResultError.
// These bridge the app layer error types to the presentation layer error contract.

import type { ConfigError, LockError } from "#domain/errors";
import type { ResultError } from "./cli-error-map";

/**
 * Map ConfigError to ResultError for CLI consumption.
 */
export function mapConfigError(err: ConfigError): ResultError {
	const count = err.ajvErrors.length;
	const noun = count === 1 ? "error" : "errors";
	return {
		code: "INVALID_CONFIG",
		retryable: false,
		message: `invalid marksync.yml: ${count} validation ${noun} detected; review the configuration against the schema`,
	};
}

/**
 * Map LockError to ResultError for CLI consumption.
 */
export function mapLockError(err: LockError): ResultError {
	if (err.kind === "CorruptLock") {
		const count = err.ajvErrors?.length ?? 0;
		if (count > 0) {
			const noun = count === 1 ? "error" : "errors";
			return {
				code: "CORRUPT_LOCK",
				retryable: false,
				message: `invalid marksync.lock.yml: ${count} validation ${noun} detected; regenerate the lock or run 'marksync repair-state'`,
			};
		}
		return {
			code: "CORRUPT_LOCK",
			retryable: false,
			message:
				"invalid marksync.lock.yml: parse error detected; regenerate the lock or run 'marksync repair-state'",
		};
	}
	// LockDirty and ConcurrentWrite
	return {
		code: err.kind === "LockDirty" ? "LOCK_DIRTY" : "CONCURRENT_WRITE",
		retryable: true,
		message:
			err.kind === "LockDirty"
				? "lock file is dirty: tracked state has uncommitted changes; run 'marksync repair-state'"
				: `concurrent write detected: another process is updating ${err.lockPath}`,
	};
}
