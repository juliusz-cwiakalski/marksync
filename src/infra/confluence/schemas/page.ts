// zod boundary schemas for the v2 page API responses (DEC-7). Adapter-internal —
// these shapes never cross the TargetSystem port.

import { z } from "zod";

/** The v2 page response (create/read/update). `body.storage.value` is present on a storage-format read. */
export const PageV2Response = z.object({
	id: z.string(),
	title: z.string(),
	status: z.string().optional(),
	version: z.object({
		number: z.number(),
		message: z.string().optional(),
	}),
	body: z
		.object({
			storage: z.object({ value: z.string() }).optional(),
		})
		.optional(),
});
export type PageV2Response = z.infer<typeof PageV2Response>;

/** The v2 409-conflict envelope (spike H5): `errors[0].code === "CONFLICT"`. */
export const Conflict409Envelope = z.object({
	errors: z.array(
		z.object({
			code: z.string(),
			title: z.string(),
			status: z.number().optional(),
			detail: z.unknown().nullable().optional(),
		}),
	),
});
export type Conflict409Envelope = z.infer<typeof Conflict409Envelope>;
