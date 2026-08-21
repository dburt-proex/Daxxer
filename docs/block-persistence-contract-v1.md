# Daxxer block persistence contract v1

Status: implementation contract for issue #11.

## Persistence authority

DaxxerOS Local is the source of truth. The desktop bridge accepts page `blocks`, `properties`, `views`, and `rows` and writes those authorized fields into YAML frontmatter. The Markdown body is a derived searchable projection, not the structured block authority.

The supplied local serializer uses `yaml.safe_load()` for metadata and `yaml.dump(..., sort_keys=False, allow_unicode=True)` for serialization. It does not whitelist per-block fields. The supplied `91_SCHEMAS/objects.yaml` page catalogue constrains page location/status/type but does not constrain nested block metadata.

### Bridge allowlist constraint

`daxxer.bridge.update_page()` copies only keys listed in `PAGE_UPDATE_FIELDS`. A new page-level key such as `contentSchemaVersion` would currently be ignored on update.

Therefore the v1 version marker lives **inside each block**, within the already-authorized `blocks` tree. This avoids requiring a DaxxerOS Local bridge change and guarantees the marker travels with the content it versions.

## Version marker

A v1 block carries:

```json
{
  "id": "stable-id",
  "type": "paragraph",
  "schemaVersion": 1,
  "text": "Plain text"
}
```

Absence of `schemaVersion` means legacy block schema v0.

A block declaring a version greater than the current supported version must fail visibly and must not be rewritten by the migration layer.

Each nested child carries its own marker after migration, so independently preserved/opaque subtrees remain diagnosable.

## Legacy block shape

Version 0 blocks use the existing shape:

```json
{
  "id": "stable-id",
  "type": "paragraph",
  "text": "Plain text",
  "children": []
}
```

Type-specific fields such as `checked`, `open`, `language`, and unknown future fields are preserved.

## v1 rich-text shape

v1 is deliberately additive. `text` remains the backward-compatible plain-text projection while `richText` carries inline formatting:

```json
{
  "id": "stable-id",
  "type": "paragraph",
  "schemaVersion": 1,
  "text": "Bold and link",
  "richText": [
    {"text": "Bold", "marks": {"bold": true}, "href": null},
    {"text": " and ", "marks": {}, "href": null},
    {"text": "link", "marks": {"italic": true}, "href": "https://example.com"}
  ]
}
```

Supported boolean marks in v1:
- `bold`
- `italic`
- `underline`
- `strike`
- `code`

Optional string marks:
- `color`
- `background`

Links use `href` on a segment.

Unknown segment fields are retained so future producers are not silently stripped.

## Nested children

Nested blocks remain recursive under `children` arrays. Migration walks the full tree and preserves IDs and unknown fields at every level. Each migrated child receives `schemaVersion: 1`.

## Migration

`Daxxer.BlockSchema.migratePage(page)` performs deterministic migration:

1. Every existing block is cloned without dropping unknown fields.
2. Missing block `schemaVersion` is interpreted as v0.
3. Legacy `text` is copied into a single unmarked `richText` segment.
4. Existing valid `richText` is normalized and its concatenated text becomes the `text` fallback.
5. Nested children are migrated recursively.
6. Each successfully processed block receives `schemaVersion: 1`.
7. Invalid or unsupported future block content returns explicit errors instead of being silently rewritten.

Migration is idempotent: migrating an already-normalized v1 tree produces the same structured result.

## Recovery / downgrade

`Daxxer.BlockSchema.downgradePage(page)` provides a deterministic recovery representation for the pre-v1 editor:

- derives plain `text` from `richText`;
- removes only `richText` and block `schemaVersion`;
- preserves block IDs, nesting, block types, type-specific fields, and unknown fields.

Because v1 is additive and `text` remains synchronized, downgrade preserves textual meaning and record identity even when inline formatting is no longer displayed by an old client.

DaxxerOS Local archive/restore remains independent of this migration and stores/restores the intact metadata/body record.

## Unsupported content rule

Unknown block types are not deleted or coerced. They remain in the page tree and produce a visible `unknown_block_type` warning. Invalid rich-text values or unsupported future block versions produce blocking errors.

Preserving opaque user data is safer than guessing how to transform it.

## Verification fixtures

`tests/block-schema.test.mjs` verifies:

- nested legacy tree migration without ID loss;
- block-local version markers on every migrated node;
- deterministic v1 normalization;
- unknown-field preservation;
- v1 -> legacy recovery while preserving IDs and meaning;
- unknown block-type visibility;
- future block-version fail-closed behavior;
- malformed rich-text fail-visible behavior.

## Persistence activation rule

The editor may only begin writing v1 `richText` after the schema module is loaded in the app and block persistence routes through `prepareForPersistence()` or an equivalent validated boundary. No page-level metadata addition is required from DaxxerOS Local.
