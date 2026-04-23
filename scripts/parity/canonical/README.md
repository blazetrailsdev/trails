# Canonical schema format

`schema.schema.json` is the JSON Schema (draft 2020-12) for the neutral
canonical representation used by the parity test suite. Both the Rails-side
and trails-side canonicalizers must produce output that validates against it.

`types.ts` contains the TypeScript types derived from the schema.

## Purpose

Neither `ActiveRecord::SchemaDumper` (Rails) nor `trails-schema-dump` (trails)
is "the truth." Both sides run a `canonicalize` step that lowers their native
output into this format. This decouples parity tests from the internal shape of
either dumper — a change to `dumpSchemaColumns` or `SchemaDumper` that doesn't
affect semantic meaning won't break the diff.

## Version policy (D9)

The current version is **1**. Bumping `version` requires a single PR that:

1. Updates `schema.schema.json`: change the `version` const, update `$id` to end in `/v2` (or `/v3` etc.), add/remove fields.
2. Updates `types.ts`.
3. Updates both canonicalizers:
   `scripts/parity/schema/ruby/canonicalize.rb` (added in PR4) and
   `scripts/parity/schema/node/canonicalize.ts` (added in PR3).
4. Updates or regenerates any checked-in baseline JSON files.

Never bump the version in a PR that also changes canonicalizer behavior — split
them so bisect remains useful.

## Ordering rules (D1)

- `tables` — sorted by `name` ASC.
- `columns` — **preserved declaration order** (order is semantic; affects
  `SELECT *` and row iteration).
- `indexes` — sorted by `name` ASC.
- `columns` within an index — preserved declaration order (semantic for
  composite indexes).

## Filtered entries (D2, D3)

The following are excluded from canonical output by both canonicalizers:

- Tables: `schema_migrations`, `ar_internal_metadata`.
- Indexes: any index whose name matches `/^sqlite_autoindex_/`.

Fixtures never declare these tables; the filter is belt-and-suspenders.

## Type alphabet (D4)

The `type` field on each column is a member of the closed enum in
`schema.schema.json#/$defs/CanonicalType`:

```
string · text · integer · bigint · float · decimal
datetime · date · time · boolean · binary · json
```

Canonicalizers **must throw** on any type not in this list, with a message
naming the table, column, and raw type string. Do not silently coerce or drop
unknown types — a thrown error surfaces a gap that needs an explicit decision.

## Deferred to v2+

- Foreign keys
- Check constraints
- Generated / virtual columns
- Default expressions (e.g. `CURRENT_TIMESTAMP`) — `default` is `null` in v1
  for expression defaults
- Collations
- Composite PK ordering guarantees beyond `[string, string, ...string[]]`
- SQLite `WITHOUT ROWID` tables
