// zod boundary schemas for the v1 content-property API (GH-66). Adapter-internal.

import { z } from "zod";

/**
 * v1 content-property response. `value` is a string (spike H2). `version.number`
 * is required for optimistic concurrency on PUT-by-key; `version.when` is
 * returned by the API but unused here.
 */
export const PropertyV1Response = z.object({
	id: z.union([z.string(), z.number()]),
	key: z.string(),
	value: z.unknown(),
	version: z.object({
		number: z.number(),
		when: z.string().optional(),
	}),
});
export type PropertyV1Response = z.infer<typeof PropertyV1Response>;
