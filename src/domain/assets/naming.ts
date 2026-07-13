// Domain asset filename helper (DEC-1). Produces `marksync-asset-<hash>.<ext>`
// from hash+mime, reconciled with the infra `attachmentFilename()` for all formats.

export function assetFilename(artifact: {
	hash: string;
	mime: string;
}): string {
	const ext = extFromMime(artifact.mime);
	return `marksync-asset-${artifact.hash}.${ext}`;
}

function extFromMime(mime: string): string {
	switch (mime) {
		case "image/svg+xml":
			return "svg";
		case "image/png":
			return "png";
		case "image/jpeg":
			return "jpg";
		case "image/gif":
			return "gif";
		case "image/webp":
			return "webp";
		default:
			return "bin";
	}
}
