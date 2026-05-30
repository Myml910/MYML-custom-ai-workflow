# Hidden Internal References

This directory contains the local-only manifest template for the Hidden Internal Reference MVP.

The MVP is intentionally server-side only:

- Internal reference lookup is disabled by default.
- Internal reference images are loaded only inside the image worker runtime.
- Internal reference paths are not written to `generation_tasks.input`.
- Internal reference paths are not returned by task APIs.
- Internal reference paths are not added to chat history, Hermes payloads, canvas nodes, or task events.

## Environment

```env
INTERNAL_REFERENCE_LOOKUP_ENABLED=false
INTERNAL_REFERENCE_MANIFEST_PATH=server/internal-references/manifest.sample.json
INTERNAL_REFERENCE_ROOT=library/internal-references
INTERNAL_REFERENCE_MAX_IMAGES=2
```

`INTERNAL_REFERENCE_ROOT` is the only allowed root for local reference image files. Manifest entries are resolved under that root and path traversal is rejected.

## Manifest

`manifest.sample.json` is a schema example only. It does not contain real internal paths or real company image filenames. For local testing, place temporary files under `library/internal-references` and update a private, untracked manifest path through `INTERNAL_REFERENCE_MANIFEST_PATH`.

Each asset can include:

- `id`
- `projectCode`
- `designTaskId`
- `productType`
- `printMode`
- `themeTags`
- `styleTags`
- `colorTags`
- `filePath`
- `approvedStatus`
- `usabilityScore`

Only `approvedStatus: "approved"` assets are selectable.
