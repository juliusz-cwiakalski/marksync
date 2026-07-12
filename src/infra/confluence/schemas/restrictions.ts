// zod boundary schema for the v1 restrictions read (minimal). Adapter-internal.

import { z } from "zod";

/** v1 `GET /content/{id}/restriction` — the restrictions read. Minimal: any entry means restricted. */
export const RestrictionsResponse = z.object({
	results: z.array(
		z.object({
			operation: z.string().optional(),
			restrictions: z
				.object({
					user: z.array(z.unknown()).optional(),
					group: z.array(z.unknown()).optional(),
				})
				.optional(),
		}),
	),
});
export type RestrictionsResponse = z.infer<typeof RestrictionsResponse>;
