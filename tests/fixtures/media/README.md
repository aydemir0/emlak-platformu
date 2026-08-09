# Media test fixtures

Phase 6 tests generate tiny deterministic JPEG/PNG/WebP and EXIF-orientation inputs in memory with Sharp. This avoids committing opaque user-derived binaries while still exercising real decoders, forged MIME rejection, edge/pixel limits, orientation normalization, WebP/AVIF output, and metadata removal.
