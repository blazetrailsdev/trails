/**
 * The adapter members an arm-content cover can intercept to stop
 * `loadCanonicalSchema` from really laying its tables.
 *
 * `runTable` (canonical-schema.ts) does not call `adapter.createTable` — it
 * resolves a `SchemaStatements` companion through `adapter.schemaStatements()`
 * and lays every table through it, and that companion reaches the database via
 * `adapter.execute` after rendering DDL through `adapter.schemaCreation`.
 * Indexes go the same way (`emitTableIndexes` → `ss.addIndex` →
 * `adapter.execute`), and a `force:` create drops through `dropTable` first.
 * So a cover that intercepts any of these lays nothing, exactly as the
 * `createTable` cover that PR #5676 routed through `loadSchema` did — the
 * canonical half then queries tables that were never created and dies with
 * `relation "…" does not exist`, on the PG lane only.
 *
 * `createTable`, `dropTable` and `addIndex` stay in the set even though the
 * canonical half reaches past them: they are the emitters the *adapter-specific*
 * arm calls directly, and they are the shape every existing cover stubs.
 *
 * This list is the single source of truth for both mechanisms that key on it:
 * the runtime guard in `load-schema-helper.ts`, which imports it, and the
 * `blazetrails/no-load-schema-with-stubbed-ddl` ESLint rule, which reads the
 * array out of this file's text — it is a plain-Node module ESLint loads with no
 * TypeScript pipeline, so it cannot import this one. Keep the array a flat list
 * of double-quoted names; the rule throws rather than silently guarding nothing
 * if it parses none.
 *
 * The list is a trace of the lay path, so `stubbed-ddl-methods.test.ts` pins it
 * against that path: it drives `loadCanonicalSchema` through a recording proxy
 * and fails when the loader touches an adapter member that is neither in this
 * array nor in the test's justified non-emitting exempt list.
 */
export const STUBBED_DDL_METHODS: readonly string[] = [
  "createTable",
  "dropTable",
  "addIndex",
  "execute",
  "schemaCreation",
  "schemaStatements",
];
