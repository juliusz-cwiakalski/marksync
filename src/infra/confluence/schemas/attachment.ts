// zod boundary schemas for the v1 attachment API (spike H4). Adapter-internal.

import { z } from "zod";

const AttachmentResult = z.object({
	id: z.string(),
	title: z.string(),
	status: z.string().optional(),
	version: z.object({ number: z.number() }).optional(),
	metadata: z
		.object({
			mediaType: z.string().optional(),
		})
		.optional(),
});

/** v1 attachment list response (`GET /content/{id}/child/attachment`). */
export const AttachmentListResponse = z.object({
	results: z.array(AttachmentResult),
});
export type AttachmentListResponse = z.infer<typeof AttachmentListResponse>;

/** v1 attachment create response (single result). */
export const AttachmentCreateResponse = z.object({
	...AttachmentResult.shape,
});
export type AttachmentCreateResponse = z.infer<typeof AttachmentCreateResponse>;
