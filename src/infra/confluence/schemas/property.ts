// zod boundary schemas for the v2 content-property API (spike H2). Adapter-internal.

import { z } from "zod";

/** v2 content-property response (get/create/update). `value` is a string per spike H2. */
export const PropertyV2Response = z.object({
	key: z.string(),
	value: z.unknown(),
	version: z.object({ number: z.number() }).optional(),
});
export type PropertyV2Response = z.infer<typeof PropertyV2Response>;
