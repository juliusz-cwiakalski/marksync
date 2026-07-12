// zod boundary schema for the v1 CQL search response (minimal). Adapter-internal.

import { z } from "zod";

/** v1 CQL search result (page discovery for `doctor`/discovery). */
export const SearchResponse = z.object({
	results: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
		}),
	),
});
export type SearchResponse = z.infer<typeof SearchResponse>;
