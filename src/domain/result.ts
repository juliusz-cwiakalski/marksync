// src/domain/result.ts
//
// The Result<T, E> type — MarkSync's primary error channel for expected
// failures (domain logic, use cases). Functions return Result instead of
// throwing for expected cases (drift, conflict, missing page); `throw` is
// reserved for invariant violations (typescript.md §"Error handling",
// blueprint §2). The union below is copied VERBATIM from blueprint §2 /
// typescript.md.

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Constructor namespace for {@link Result}. Produces the two union arms without
 * callers hand-writing object literals. The {@link Result} type itself is the
 * verbatim blueprint contract; these constructors are additive ergonomics that
 * preserve that exact shape (they return `{ ok: true, value }` /
 * `{ ok: false, error }`).
 */
export namespace Result {
	export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
	export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
}
