// Stateful mock Confluence HTTP server for CI e2e regression tests.
// Implements the corrected endpoint list from spec §8.1 (DEC-3) with realistic
// response envelopes, the exact parseConflict 409 shape, attachment dedup 400 path,
// in-memory state maps, a CapturedRequest[] recorder, and a per-scenario reset mechanism.
// Pattern mirrors tests/integration/confluence/confluence-target.test.ts.

interface CapturedRequest {
	host: string;
	path: string;
	method: string;
	authorization: string | null;
	text: string;
}

/** In-memory page state tracked by the mock. */
interface PageState {
	id: string;
	title: string;
	status: string;
	version: number;
	body?: string;
	parentId?: string;
	spaceId: string;
}

/** In-memory property state tracked by the mock (id is required by PropertyV1Response). */
interface PropertyState {
	id: string | number;
	key: string;
	value: string;
	version: number;
}

/** In-memory attachment state tracked by the mock. */
interface AttachmentState {
	id: string;
	title: string;
	version: number;
	hash: string; // For dedup precheck
}

/** Build a 409 conflict response matching parseConflict's VERSION_RE. */
function buildConflictBody(currentVersion: number, providedVersion: string): unknown {
	return {
		errors: [
			{
				code: "CONFLICT",
				title: `Version must be incremented when updating a page. Current Version: [${currentVersion}]. Provided version: [${providedVersion}]`,
			},
		],
	};
}

/** Factory returning a stateful mock Confluence server on an ephemeral port. */
export function createMockServer(): {
	origin: string;
	stop: () => void;
	captured: CapturedRequest[];
	reset: () => void;
	clearCaptured: () => void;
	getServerAttachments: (pageId: string) => { id: string; title: string; version: number; hash: string }[];
} {
	let nextPageId = 100;
	let nextPropertyId = 200;
	let nextAttachmentId = 300;

	// In-memory state maps
	const pages = new Map<string, PageState>();
	const properties = new Map<string, PropertyState>(); // key: "pageId::key"
	const attachments = new Map<string, AttachmentState[]>(); // key: pageId

	// Captured request log
	const captured: CapturedRequest[] = [];

	// Reset function to clear state and captured log
	function reset() {
		pages.clear();
		properties.clear();
		attachments.clear();
		captured.length = 0;
		nextPageId = 100;
		nextPropertyId = 200;
		nextAttachmentId = 300;
	}

	// Clear only the captured log (keep server state)
	function clearCaptured() {
		captured.length = 0;
	}

	const server = Bun.serve({
		port: 0,
		fetch: async (req) => {
			const url = new URL(req.url);
			const text = await req.text().catch(() => "");

			// Capture request
			captured.push({
				host: url.host,
				path: url.pathname,
				method: req.method,
				authorization: req.headers.get("Authorization"),
				text,
			});

			// Route request
			return route(req, url, text);
		},
	});

	async function route(req: Request, url: URL, text: string): Promise<Response> {
		const path = url.pathname;

		// Parse JSON body for POST/PUT requests (skip multipart: attachment
		// uploads use FormData and are parsed by the attachment handler below).
		let body: unknown;
		const isMultipart = (req.headers.get("Content-Type") || "").startsWith("multipart/form-data");
		if ((req.method === "POST" || req.method === "PUT") && !isMultipart) {
			try {
				body = text ? JSON.parse(text) : undefined;
			} catch {
				return new Response("Invalid JSON", { status: 400 });
			}
		}

		// ===== CREDENTIAL VALIDATION (not on e2e critical path per DEC-1) =====
		if (req.method === "GET" && path === "/wiki/api/v2/user/by-me") {
			return json(200, {
				accountId: "5e7e5e5e5e5e5e5e5e5e5e5e",
				displayName: "Mock User",
			});
		}

		// ===== V2 PAGES ENDPOINTS =====
		if (req.method === "POST" && path === "/wiki/api/v2/pages") {
			const parsed = body as { spaceId?: string; title?: string; parentId?: string; body?: { representation?: string; value?: string } };
			const pageId = `${nextPageId++}`;
			const page: PageState = {
				id: pageId,
				title: parsed.title ?? "Untitled",
				status: "current",
				version: 1,
				body: parsed.body?.value,
				parentId: parsed.parentId,
				spaceId: parsed.spaceId ?? "TEST",
			};
			pages.set(pageId, page);
			return json(200, {
				id: pageId,
				title: page.title,
				status: page.status,
				version: { number: page.version, message: "Initial version" },
				body: page.body ? { storage: { value: page.body } } : undefined,
			});
		}

		if (req.method === "GET" && path.match(/^\/wiki\/api\/v2\/pages\/(\d+)$/)) {
			const match = path.match(/^\/wiki\/api\/v2\/pages\/(\d+)$/);
			const pageId = match?.[1];
			if (!pageId) return new Response(null, { status: 404 });

			const page = pages.get(pageId);
			if (!page) return new Response(null, { status: 404 });

			// Check for body-format query param
			const bodyFormat = url.searchParams.get("body-format");
			if (bodyFormat === "storage") {
				return json(200, {
					id: page.id,
					title: page.title,
					status: page.status,
					version: { number: page.version, message: "prev" },
					body: page.body ? { storage: { value: page.body } } : undefined,
				});
			}

			return json(200, {
				id: page.id,
				title: page.title,
				status: page.status,
				version: { number: page.version, message: "prev" },
			});
		}

		if (req.method === "PUT" && path.match(/^\/wiki\/api\/v2\/pages\/(\d+)$/)) {
			const match = path.match(/^\/wiki\/api\/v2\/pages\/(\d+)$/);
			const pageId = match?.[1];
			if (!pageId) return new Response(null, { status: 404 });

			const page = pages.get(pageId);
			if (!page) return new Response(null, { status: 404 });

			const parsed = body as { id?: string; title?: string; body?: { representation?: string; value?: string }; version?: { number?: number } };
			const providedVersion = parsed.version?.number;

			// Confluence v2 expects the INCREMENTED version (current + 1) on PUT,
			// mirroring the real "Version must be incremented" 409 semantics that
			// PageService.update sends (version.number = baseVersion + 1). A
			// providedVersion that is not exactly current+1 is stale → 409.
			if (providedVersion !== undefined && providedVersion !== page.version + 1) {
				return json(409, buildConflictBody(page.version, String(providedVersion)));
			}

			// Update page
			page.title = parsed.title ?? page.title;
			page.body = parsed.body?.value;
			page.version += 1;

			return json(200, {
				id: page.id,
				title: page.title,
				status: page.status,
				version: { number: page.version, message: "Updated" },
				body: page.body ? { storage: { value: page.body } } : undefined,
			});
		}

		// ===== V1 CONTENT-PROPERTY ENDPOINTS (not jsongraphs per DEC-3) =====
		if (req.method === "GET" && path.match(/^\/wiki\/rest\/api\/content\/(\d+)\/property\/([^/]+)$/)) {
			const match = path.match(/^\/wiki\/rest\/api\/content\/(\d+)\/property\/([^/]+)$/);
			const pageId = match?.[1];
			const key = match ? decodeURIComponent(match[2]) : undefined;
			if (!pageId || !key) return new Response(null, { status: 404 });

			const propKey = `${pageId}::${key}`;
			const prop = properties.get(propKey);
			if (!prop) return new Response(null, { status: 404 });

			return json(200, {
				id: prop.id,
				key: prop.key,
				value: prop.value,
				version: { number: prop.version, when: "2026-07-15T00:00:00.000Z" },
			});
		}

		if (req.method === "POST" && path.match(/^\/wiki\/rest\/api\/content\/(\d+)\/property$/)) {
			const match = path.match(/^\/wiki\/rest\/api\/content\/(\d+)\/property$/);
			const pageId = match?.[1];
			if (!pageId) return new Response(null, { status: 404 });

			const parsed = body as { key?: string; value?: string };
			const key = parsed.key;
			const value = parsed.value;
			if (!key || value === undefined) return new Response(null, { status: 400 });

			const propKey = `${pageId}::${key}`;
			const existing = properties.get(propKey);

			if (existing) {
				// Key exists → 409 (triggers adapter's GET-version → PUT-incremented flow)
				return json(409, { errors: [{ code: "CONFLICT" }] });
			}

			// Create new property
			const propId = nextPropertyId++;
			const prop: PropertyState = {
				id: propId,
				key,
				value: String(value),
				version: 1,
			};
			properties.set(propKey, prop);

			return json(200, {
				id: prop.id,
				key: prop.key,
				value: prop.value,
				version: { number: prop.version, when: "2026-07-15T00:00:00.000Z" },
			});
		}

		if (req.method === "PUT" && path.match(/^\/wiki\/rest\/api\/content\/(\d+)\/property\/([^/]+)$/)) {
			const match = path.match(/^\/wiki\/rest\/api\/content\/(\d+)\/property\/([^/]+)$/);
			const pageId = match?.[1];
			const key = match ? decodeURIComponent(match[2]) : undefined;
			if (!pageId || !key) return new Response(null, { status: 404 });

			const propKey = `${pageId}::${key}`;
			const prop = properties.get(propKey);
			if (!prop) return new Response(null, { status: 404 });

			const parsed = body as { key?: string; value?: string; version?: { number?: number } };
			const providedVersion = parsed.version?.number;

			// v1 content-property PUT expects the incremented version (current + 1),
			// matching PropertyService.updateByKey (version.number = currentVersion + 1).
			if (providedVersion !== undefined && providedVersion !== prop.version + 1) {
				return json(409, { errors: [{ code: "CONFLICT" }] });
			}

			// Update property
			prop.key = parsed.key ?? prop.key;
			prop.value = parsed.value !== undefined ? String(parsed.value) : prop.value;
			prop.version += 1;

			return json(200, {
				id: prop.id,
				key: prop.key,
				value: prop.value,
				version: { number: prop.version, when: "2026-07-15T00:00:00.000Z" },
			});
		}

		// ===== V1 ATTACHMENTS ENDPOINTS =====
		if (req.method === "POST" && path.match(/^\/wiki\/rest\/api\/content\/(\d+)\/child\/attachment$/)) {
			const match = path.match(/^\/wiki\/rest\/api\/content\/(\d+)\/child\/attachment$/);
			const pageId = match?.[1];
			if (!pageId) return new Response(null, { status: 404 });

			// Parse multipart form data for file upload
			const contentType = req.headers.get("Content-Type") || "";
			if (!contentType.startsWith("multipart/form-data")) {
				return new Response("Expected multipart/form-data", { status: 400 });
			}

			// Extract filename from Content-Disposition header
			// For simplicity in the mock, we'll extract the hash from the filename
			// Real Confluence hash-naming: "marksync-mermaid-<hash>.svg" or "marksync-asset-<hash>.<ext>"
			const boundary = contentType.split("boundary=")[1];
			const parts = text.split(`--${boundary}`);
			let filename = "";
			for (const part of parts) {
				if (part.includes("Content-Disposition")) {
					const filenameMatch = part.match(/filename="([^"]+)"/);
					if (filenameMatch) {
						filename = filenameMatch[1];
						break;
					}
				}
			}

			if (!filename) return new Response("No file uploaded", { status: 400 });

			// Extract hash from filename for dedup check
			const hashMatch = filename.match(/marksync-(mermaid|asset)-([a-f0-9]+)/);
			const hash = hashMatch ? hashMatch[2] : filename;

			// Check for duplicate filename (defensive fallback — pipeline prechecks via GET list)
			const pageAttachments = attachments.get(pageId) ?? [];
			const duplicate = pageAttachments.find((a) => a.title === filename);
			if (duplicate) {
				return json(400, {
					message: "Cannot add a new attachment with same file name",
				});
			}

			// Create attachment
			const attachment: AttachmentState = {
				id: `${nextAttachmentId++}`,
				title: filename,
				version: 1,
				hash,
			};
			pageAttachments.push(attachment);
			attachments.set(pageId, pageAttachments);

			// Return GH-71 shape: { results: [...] }-wrapped response
			return json(200, {
				results: [
					{
						id: attachment.id,
						title: attachment.title,
						version: { number: attachment.version },
					},
				],
			});
		}

		if (req.method === "GET" && path.match(/^\/wiki\/rest\/api\/content\/(\d+)\/child\/attachment$/)) {
			const match = path.match(/^\/wiki\/rest\/api\/content\/(\d+)\/child\/attachment$/);
			const pageId = match?.[1];
			if (!pageId) return new Response(null, { status: 404 });

			const pageAttachments = attachments.get(pageId) ?? [];
			return json(200, {
				results: pageAttachments.map((a) => ({
					id: a.id,
					title: a.title,
					version: { number: a.version },
				})),
			});
		}

		// ===== OFF-CRITICAL-PATH STUBS =====
		if (req.method === "GET" && path.startsWith("/wiki/rest/api/search")) {
			return json(200, { results: [] });
		}

		if (req.method === "GET" && path.match(/^\/wiki\/rest\/api\/content\/(\d+)\/restriction$/)) {
			// Default: not restricted (empty results)
			return json(200, { results: [] });
		}

		// ===== OBSOLETE ENDPOINTS (NOT IMPLEMENTED per DEC-3) =====
		if (path.includes("/api/jsongraphs/")) {
			return new Response(null, { status: 404 });
		}

		// Default: 404 for unhandled paths
		return new Response(null, { status: 404 });
	}

	return {
		origin: `http://localhost:${server.port}`,
		stop: () => server.stop(true),
		captured,
		reset,
		clearCaptured,
		getServerAttachments: (pageId: string) =>
			(attachments.get(pageId) ?? []).map((a) => ({ id: a.id, title: a.title, version: a.version, hash: a.hash })),
	};
}

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}