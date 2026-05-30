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
INTERNAL_REFERENCE_USE_IMAGE_INPUT=false
INTERNAL_REFERENCE_IMAGE_MODEL_ID=custom-image-t8-nano-banana-3-1-flash-edit
```

`INTERNAL_REFERENCE_ROOT` is the only allowed root for local reference image files. Manifest entries are resolved under that root and path traversal is rejected.

`INTERNAL_REFERENCE_USE_IMAGE_INPUT` controls whether matched hidden references may be attached to an image-to-image / edits model at worker runtime. Keep it `false` unless running a local hidden-reference test. When enabled, `INTERNAL_REFERENCE_IMAGE_MODEL_ID` must point at a model that supports `image-to-image` / `multi-image`; hidden reference images are still never written to task input, API responses, chat history, or canvas node metadata.

When image input is enabled and the worker switches to an edit-capable model, the provider prompt is rebuilt as a carrier-preserving edit prompt. The internal reference image is treated as the edit target / product-fit template: the carrier structure, mockup, layout, print area, proportions, lighting, and framing should stay stable while only the printed artwork and theme content are replaced. This prompt is sent only to the provider and contains no internal file path, filename, data URI, or manifest asset identifier.

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
