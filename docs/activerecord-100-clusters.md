# ActiveRecord post-100% — Cluster details

**Companion to [`activerecord-100-plan.md`](activerecord-100-plan.md).** That doc is the live tracker (in-flight PRs, followups, story count). **This doc holds the per-cluster slot detail** — slot descriptions, LOC sizing, audit attribution, cross-cluster overlap notes.

A "cluster" here is a set of related work-PR slots that share an audit source, a file area, or a Rails-source surface. Each cluster has 1–11 slots; PRs target ~250 LOC each.

When picking a slot to spawn:

1. Check `activerecord-100-plan.md`'s In flight + Story count to see what's already moving and what's queued.
2. Find the matching cluster in this doc for slot details, sequencing, and overlap notes.
3. Read the relevant `audit-*` reference in the slot description; the audit ran with full Rails-source context and its inventory is the source of truth for the gap shape.

---

## Associations-autosave cluster — all 4 slots closed (#1558, #1574, #1577, #1584)

i18n tests un-skipped nominally — full I18n backend port still required for real translation pipeline.

**Followups (~480 LOC) — small bundle (~50 LOC) shippable as one PR:**

- ~1 LOC (F) — `_AUTOSAVE_AROUND_SAVE_KEY` guard in `addAutosaveAssociationCallbacks` should be `Object.prototype.hasOwnProperty.call(model, _AUTOSAVE_AROUND_SAVE_KEY)`.
- ~10 LOC (C) — `defineAutosaveValidationCallbacks` should call `model.validate(validationName)` + `model.afterValidation(_ensureNoDuplicateErrors)`. Un-skips `cyclic autosaves do not add multiple validations`.
- ~10 LOC (C) — `_autosaveBelongsTo` should guard on `isStaleTarget()` (Rails `autosave_association.rb:538`).
- ~10 LOC (C) — `_autosaveBelongsTo` FK→null on `self` before destroying associated record on `marked_for_destruction` (Rails lines 544-547).
- ~15 LOC (C) — `autosaveHasOne` should use `changedForAutosave()` (already implemented) instead of `childRecord.changed`.

**Followups — separate PRs:**

- ~20 LOC (E) — `queryConstraintsList` returns `ctor.primaryKey` as a string array when `_queryConstraintsList` is unset but `ctor.primaryKey` is composite. Eliminates scalar-fallback workaround in `autosaveHasOne`.
- ~20 LOC (D) — Populate `nestedAttributesTarget` from `assignNestedAttributes` so `:nested_attributes_order` becomes functional (dead code in `nested-error.ts:48-52`).
- ~30 LOC (E) — Un-skip CPK `assign ids with belongs to cpk model` + companion: CPK-aware `setIds` (composite ID tuple support).
- ~40 LOC (D) — Remove `!isNewRecord && !changed` short-circuit in `validateAssociations` + add Rails `associated_errors` filter. Unchanged children with cached NestedErrors don't re-propagate today.
- ~50–80 LOC (E) — Un-skip 4 polymorphic-inverse tests: polymorphic inverse-of swap detection in `has-one-association.ts` + auto-detected `inverseOf`.
- ~80 LOC (D, gated on I18n full-message customize) — Rewrite the two "indexed errors should be properly translated" tests against a real I18n backend.
- ~150 LOC (D) — Collapse `validateAssociations` and per-reflection `validate*Association` callbacks into a single `add_autosave_association_callbacks` dispatch. Resolves structural duplication.

**Pre-existing divergences (notes, no action):**

- `_validateAssociationsFn` runs after `validationsIsValid` restores `_validationContext`; Rails runs inside `run_validations!` while context is live.
- `autosaveHasOne` uses `computePrimaryKey.call(record, reflection ?? assoc)`; Rails calls `compute_primary_key(reflection, record)`. Fallback critical for unnormalized `assoc.options`.
- `saveHasOneAssociation` relies on `defineNonCyclicMethod`'s `_alreadyCalled` instead of Rails' `record.autosaving_belongs_to_for?(inverse_association)`.
- `AssociationBuilderExtension` only fires for `autosave: true`; Rails fires for every association. Cyclic dedup needs manual call when `autosave` is not set.

## Associations-reflection cluster — Slot D + E closed (#1571, #1582); Slot C partial (#1580)

31 empty-stub tests with generic boilerplate annotation. **Impl is fundamentally complete**; gaps are fixture plumbing + test-body writing + 3 fixture-model gaps.

1. **Slot C residual** (~150 LOC) — Remaining Hotel/Department/Chef/CakeDesigner/DrinkDesigner fixture + `reflect on missing source association raise exception` un-skip.

3 const_missing/NameError tests → unported-list candidates (Ruby-only language semantics).

**Followups (~110 LOC bundle):**

- ~30–50 LOC (D) — HABTM builder registers a `HasAndBelongsToManyReflection`; Rails registers a `ThroughReflection`. Fix `has-and-belongs-to-many.ts:195–220` `_build`. Removes the `isNested()` workaround and may unblock through-chain tests.
- ~10 LOC (E) — Sweep remaining `resolveModel(className)` call-sites to use `resolveAssocClass(record, assocName, className)`: `loadHasOneThrough` fallback, `loadHabtm`, `processDependentAssociations` (×2), `updateCounterCaches` (×2), `buildHasOne`, `buildBelongsTo`.
- ~20 LOC (E) — `associations/builder/belongs-to.ts` counter-cache wiring (~line 95) uses raw `resolveModel(targetClassName)` — convert too.
- ~30 LOC (E) — Deeply nested through-association resolution in `CollectionProxy._buildThroughScope` (through-a-through chains beyond one level). Not exercised by tests today.
- Pre-existing deviation — `MacroReflection.computeClass` error message uses our format vs Rails' `Missing model class X for the Owner#assoc association.`

## MySQL schema cluster (~200 LOC, Slot C remaining)

Slots A+B (#1468) closed. Real behavior gaps + one option drop covered; fixture/test-helper gaps remain.

- **Slot C** (~200 LOC) — MySQL fixture/test-helper infrastructure: `posts`, `key_tests`, `lessons_students`/`topics`/`students` fixtures + subclassing `Base` with qualified `db.table` table_name. Uses the TS-native fixture infra (`defineFixtures`/`useFixtures`).

## PG interval cluster (~50 LOC followup; Slot B partial)

Slot B AVG aggregate typecast closed (#1567 verbose-format Interval serialize + AVG dispatch). Interval schema-default extraction still skipped — `pg_get_expr` returns interval defaults as bare numeric (`94670856`) regardless of `intervalstyle = iso_8601` SET (only affects SELECT output, not pg_attrdef text).

**Slot B followup (~50 LOC):**

- ~50 LOC — `splitPgDefault` cast-aware numeric→Duration: detect interval-typed bare numerics from `pg_get_expr` and pass to verbose-format-aware deserialize; matching `Interval.castValue`/`serialize` for seconds → ISO 8601 round-trip. Unblocks the `interval.test.ts > schema dump with default value` test re-skipped in #1567.

## PG long-tail cluster — all slots closed (#1498, #1508, #1515, #1543, #1553, #1562, #1585)

Slot D was a no-op (Rails geometric types are all `SpecializedString`; pass-through helpers already cover the surface).

Money slot (#1508) left 3 BLOCKED tests pointing at generic Relation gaps (not money-specific): `sum`/`pluck` typecast on SQL expressions + `updateAll` BigDecimal serialize. Fold into Relation cluster work.

**Followups (~390 LOC):**

- ~5 LOC (H) — Generalize `PostgreSQLAdapter.nativeType("datetime")` (~line 4066) to delegate to `this.nativeDatabaseTypes()["datetime"]` instead of `=== "timestamptz"` special-case. Closes divergence for custom `datetimeType`; private map duplicates `nativeDatabaseTypes()` and can drift.
- ~10 LOC (E) — `schema load scoped to schemas` un-skip (needs `schema-cache.ts` clear).
- ~20 LOC (E) — `schema dump scoped to schemas` un-skip: `enumTypes()` returns schema-qualified names for non-public schemas.
- ~20 LOC (F) — Wire `type_for_attribute(column).deserialize(value)` for returned column values; today raw number is written back (benign for integer IDENTITY).
- ~30 LOC (E) — Audit `pgColumn` usages (`bit`, `bitVarying`, `xml`, `hstore`, `inet`, `cidr`, `macaddr`, `ltree`, `tsvector`, `tsrange`, etc.) for `col.type ≠ SQL type` gap in `toSql()`. Override `toSql()` in `PgTableDefinition` or change `pgColumn` to store SQL type directly. Pre-existing; surfaced by Slot E.
- ~50 LOC (F) — PG-specific `fills auto populated columns on creation` test for single-PK IDENTITY (Rails `persistence_test.rb:87`).
- ~100–150 LOC (G) — IPv6 canonicalization in `parseIpAddr`: lowercase hex + RFC 5952 compression so `isChanged`/`serialize` match Ruby's `IPAddr#eql?`. Today preserves caller's text; spurious dirty marks possible on manually-constructed IPv6. PG normalizes on round-trip so DB-backed attributes unaffected. Inline expander/compressor required (no `node:net` — blocked by browser-compat).
- ~150 LOC (F) — Implement `Model._returningColumnsForInsert(connection)` mirroring Rails `model_schema.rb`. Calls `connection.returnValueAfterInsert?(col)` per column (needs `Column#autoPopulated?` + `AbstractAdapter#returnValueAfterInsert?`). Passes explicit `returning:` to `execInsert`. Fixes composite-PK IDENTITY columns not named `id` and handles `DEFAULT gen_random_uuid()`. Today `executeMutation` hardcodes `RETURNING id`. Remove `_performInsert` comment in `base.ts` once landed.

**Notes:**

- 3 stub tests in `cidr.test.ts` (`cidr column`, `cidr type cast`, `cidr invalid`) have no Rails source backing. Find counterparts or delete.
- Possible missing file: `adapters/postgresql/inet.test.ts` mirroring Rails' `inet_test.rb` (today inet is folded into `network.test.ts`).
- `type-registry.ts` now maps `inet`/`cidr` → `IPAddr`; any DX type tests asserting `string` need updates.
- `castValue` returns `null` for non-String/non-nil/non-IPAddr inputs (Rails passes through). Type-system constraint (`IPAddr | null` return).

## PG UUID residual cluster (~250 LOC, Slot B remaining)

- **Slot B** (~250 LOC) — Associations + UUID FK binding.

Plus: 1 test references "migration framework" gap — leave skipped with sharpened annotation.

## MySQL table-options cluster — both slots closed (#1535, #1565)

**Followups (~100 LOC bundle):**

- ~5 LOC — `extractSchemaQualifiedName` equivalent so `tableComment()` (and other `information_schema` queries) handle `schema.table` names. Pre-existing gap.
- ~10 LOC — `TableDefinition` constructor: treat `primaryKey === false` same as `id: false`; treat `primaryKey: "name"` as custom PK column name. `abstract/schema-definitions.ts`.
- ~15 LOC — `MigrationContext.createTable` `_columnMeta` composite-PK tracking: mark each column listed in `options?.primaryKey` (array form) as `primaryKey: true` in `meta`. SchemaDumper reading in-memory MigrationContext source won't detect composite PKs today.
- ~15 LOC — `tableCollationCache` lazy population via `SHOW TABLE STATUS LIKE ...` (Rails' `schema_collation` path). Low priority — only matters for tables with implicit collation.
- ~25 LOC — Composite PK column order divergence: `schema-dumper.ts:emitTable` uses declaration order from `SHOW FULL FIELDS`; Rails uses `@connection.primary_key(table)` (`seq_in_index` order). Override in `mysql/schema-dumper.ts`.
- ~30 LOC — Override `createTableDefinition` in `AbstractMysqlAdapter` to return a `MySQL::TableDefinition` (charset/collation in constructor). Both DDL paths produce the same output via `toSql()` today, but cleaner.

## MySQL charset-collation cluster — Slot A in flight (#1591), Slot B + B-followups closed (#1533, #1568)

1. **Slot A** (~120–180 LOC, in flight #1591) — `createTable` `id` hash form `{ type, collation, ... }` + `ColumnOptions.charset` + "add column with charset and collation" test. Bundles ~15 LOC `mysql/schema-definitions.ts` stubs (`validColumnDefinitionOptions`, `aliasedTypes`, `integerLikePrimaryKeyType`).
2. **Slot C** (~15 LOC, optional) — BLOCKED annotation cleanup.

**Followup carry-over (~150 LOC):**

- ~150 LOC — Targeted SQL-fragment unit tests for the 4 #1568 helpers (DROP-vs-SET default fragment, undefined→null normalization at both sites, NULL-backfill UPDATE shape, comment-clearing). `abstract-mysql-adapter.test.ts` is live-DB only.

Adjacent gap: `abstract-mysql-adapter.ts` `buildCreateIndexDefinition` is also a stub returning `{}`. Not part of charset-collation but worth knowing for whoever picks up Slot A or B-followup.

## Relation cluster — Slots A, B, C, D, E, G closed; F dropped; H remains

302 skipped tests across ~14 relation-area files. Closed: A (#1511), B (#1537), C (#1542), D (#1541), E (#1575), G (#1588). Slot F (load_async scheduling) dropped — sources unported; 28 affected tests permanent-skipped.

1. **Slot H** (~220 LOC) — Relation misc small-surface bundle.

**Followups (~430 LOC across closed slots):**

Test-body bundle (~155 LOC, mostly fixture/port work):

- ~30 LOC (E) — Port `find in batches should not error if config overridden` + `should error on config specified to error` test bodies.
- ~50–80 LOC (G) — Un-skip `registering new handlers for joins`: scoped association where-clause expansion should propagate custom handlers into the lambda's evaluation context.
- ~50 LOC (E) — Port 7 remaining test bodies: Subscriber fixture, PostWithDefaultScope, `assertQueriesMatch` infra, table-alias path.
- ~100 LOC (B) — Polymorphic test bodies for 7 wired-but-skipped tests in `where.test.ts` (~lines 1014–1073, 1962). Fixture work, not impl.

Core gaps bundle (~145 LOC, smaller fidelity fixes):

- ~5 LOC (C) — Tighten `isPolymorphicClause` parameter type + fallback when `whereValuesHash` is absent.
- ~10 LOC (E) — Add `this.attribute("id", "integer")` to CPK test models to fix `id` hydration; un-skips 2 CPK start/finish tests.
- ~10 LOC (E) — `inBatches` should branch on `this._loaded` and call `_batchOnLoadedRelation`; helper exists, unwired.
- ~10 LOC (E) — `cursor` uniqueness validation: `ensureValidOptionsForBatchingBang` needs schema-cache access for PK/unique-index check.
- ~10 LOC (E) — `inBatches({ load: true })` should set batch order on yielded `batchRel`.
- ~10 LOC (D) — `defaultScopeOverride` detection for static-method form (no test coverage today).
- ~15 LOC (C) — `whereAssociated`/`whereMissing` for composite PKs (currently throws in `_resolveAssociationTarget`).
- ~15 LOC (E) — Implement `remaining` limit cap in `batchOnUnloadedRelation` (pass `limitValue` through); `.limit(N).inBatches(...)` returns too many today.
- ~20 LOC (C) — Enum/scoped association support in `whereAssociated`/`whereMissing` for 10 remaining enum tests.
- ~20 LOC (D) — Wire `buildDefaultConstraint` into `_deleteRecord`/`_updateRecord` so `allQueries: true` adds WHERE on writes (defined-but-never-called today).
- ~30 LOC (E) — Implement `useRanges` range-optimization (Rails `WHERE id >= x AND id <= y` mode); re-expose the option.

Larger refactors:

- ~30 LOC (B) — CPK `AssociationQueryValue.queries()` Relation path still throws. Pragmatic deviation: subquery approach (same as non-CPK Relations).

**Pre-existing deviations (notes):**

- `where({assocName: {...}})` produces `"pbTopic2"."title"` (SQL alias from `associatedTable(key)`) instead of Rails' `"topics"."title"`. Alias correct for joined queries, wrong for standalone where.
- `Base.predicateBuilder` (via `core.ts`) creates bare `PredicateBuilder(table)` without `_tableContext`. Direct `Model.predicateBuilder.buildFromHash(...)` misses associated-table expansion. Fix: `core.ts predicateBuilder()` should call `pb.setTableContext(new TableMetadata(this, this.arelTable))`.
- `exceptPredicates` filters at column-level (`"table.column"` string match); Rails filters at table-level. Functionally equivalent for common cases; Rails also filters stray `IS NOT NULL` predicates.
- `deriveFkQueryConstraints` raises `ConfigurationError` (Rails raises `ArgumentError`); conscious divergence.
- EachTest2 CPK placeholder stubs pass trivially without exercising behavior — needs sharpened annotations.

## Associations-core cluster — A, B, C, D closed; E remains

Closed: A (#1538), B (#1557), C (#1566), D (#1590). 49 original placeholder stubs in `associations.test.ts`. Many remain — categorized below for routing.

**Remaining 35 skipped tests in `associations.test.ts` (post-#1590):**

- 5 — autosave (save-on-parent-saves-children, composite-FK autosave)
- 4 — `inverseOf` population on collection load
- 14 — preloader grouping (same-scope batching) → Slot A territory
- 8 — `queryConstraints` feature
- 4 — not applicable in JS (`inspect`/`pretty_print`, Mocha stub infra) → permanent-skip candidates

**Followups (~390 LOC across closed slots):**

Test-body bundle (~70 LOC):

- ~20 LOC (C) — 2 "extensions" test bodies in `eager.test.ts` (extensions + instance dependent scope). Infra in place; needs models + assertions.
- ~30 LOC (B) — "preloads model with query_constraints by explicitly configured fk and pk" test body. Likely works; needs inline fixture.
- ~20 LOC (D, gated on query-cache landing) — Update `reload with query cache` test bodies.

Smaller fidelity (~50 LOC bundle):

- ~5 LOC (A) — Add connection/adapter identity to `LoaderQuery.hashKey()` for multi-DB grouping isolation.
- ~40 LOC (D) — Upgrade remaining size/empty stubs in `has-many-associations.test.ts` (lines ~1691–1791).

Larger refactors:

- ~30–50 LOC (B) — `AssociationQueryValue.convertToId` array-PK branch: handle composite `primaryKey` when value is a record instance. Currently throws. Unblocks 2 "querying by whole/single associated records" tests.
- ~50–80 LOC (B) — Polymorphic belongs_to `query_constraints`: WHERE clause must add owner's shared key alongside scalar `parent_id` in `loadBelongsTo` polymorphic path.
- ~80–120 LOC (B) — Fixture-dependent composite-FK autosave/through tests (append/assign composite has-many w/ autosave; nullify composite has-many-through).
- ~80–120 LOC (C) — Implement `Relation#includes!`/`Relation#references!` infra for Rails-faithful `through_scope` path. Today source-layer filtering compensates (semantically correct, all tests pass) but diverges for through-gated records with multiple source children.

**Pre-existing notes:**

- `_valuesForQueries()` falls back to `JSON.stringify(scope.valuesForQueries())` — stable for simple scopes; not yet stress-tested for complex predicates.
- `has-many-association.ts` `deleteRecords` uses `reflection.klass.composite_query_constraints_list`; our `compositeQueryConstraintsList` wiring may differ.
- `isNone()` delegates to `count() === 0`; Rails `empty?` checks `target.empty?` first (avoids query if unsaved in-memory records exist).

**Remaining 35 skipped tests in `associations.test.ts` (categorized for routing):**

- 5 tests — autosave (save-on-parent-saves-children, composite-FK autosave)
- 4 tests — `inverseOf` population on collection load
- 14 tests — preloader grouping (same-scope batching) → Slot A territory
- 8 tests — `queryConstraints` feature
- 4 tests — not applicable in JS (`inspect`/`pretty_print`, Mocha stub infra) → permanent-skip candidates

3. **Slot E** (~30 LOC, optional) — Annotation re-keying.

## Associations has-many-through cluster — Slot A + B closed (#1573, #1593); C, D, E remain

33 skipped across 3 files — most are empty placeholders awaiting Rails-mirrored bodies. Production code surface (`has-many-through-association.ts`, `through-association.ts`, `disable-joins-association-scope.ts`) is structurally complete.

1. **Slot C** (~220 LOC) — Autosave-through propagation + Marshal exclusion.
2. **Slot D** (~270 LOC) — Nested-through preloader + STI + joins/includes.
3. **Slot E** (~260 LOC) — Nested-through advanced (distinct/repeated table/polymorphic-with-scope/source-reset/autosave-skip).

Note: audit worktree didn't have rails source populated (historical path was `scripts/api-compare/.rails-source/`; now `vendor/rails/`) → slots sized by test-name-family inference rather than line-by-line Rails read. Workers picking these up should re-validate against `vendor/rails/` once spawned (run `pnpm vendor:fetch` to populate).

**Followups (~140 LOC across A+B):**

- ~30–50 LOC (A) — `foreignKey` option on `has_many :through` is ignored in `ThroughReflection.joinPrimaryKey` (`reflection.ts:1205`). Rails uses `delegate_reflection` exclusively; ours falls back to it only when sourceReflection is missing. Fix so `delegateReflection.foreignKey` wins when set.
- ~30 LOC (B) — Regular (JOIN-based) `djMembersOrdered` / `djMembersDouble` produce wrong/unordered results when chaining `.where()` or `.reorder()`. Add assertions once `_buildThroughScope` is fixed.
- ~80–120 LOC (B) — Fix `CollectionProxy._buildThroughScope()` for nested-through associations (where `through` target is itself a through). Today applies WHERE on intermediate through model directly, which lacks the FK column. Option B (preferred): initialize CollectionProxy seed from `DisableJoinsAssociationScope` (deferred DJAR) so `.where()` chaining produces correct DJAS-based SQL. Tests 2–11 use `djasScope()` workaround; `.where()` on a CollectionProxy for nested-through DJ still fails at runtime for users.

**Notes:**

- No `assert_queries_count` equivalent → disable-joins efficiency guarantees aren't tested.
- `QueryMethodsHost._reordering` is `boolean` but only set to `true` in `reorderBang`. Consider resetting to `false` in `orderBang` for completeness.

## Associations-HABTM cluster (~1690 LOC across 9 slots, from audit-associations-habtm)

**Important: ~160 of 168 BLOCKED tests are NOT HABTM-specific** — they exercise general associations machinery (`CollectionProxy` mutation, `*_ids` reader/writer, association scope chain composition, eager loading, polymorphic-through, STI-through, etc.). **Significant overlap with audit-associations-core cluster.** The HABTM builder itself is structurally complete.

1. **Slot A** (~260 LOC) — HABTM CollectionProxy mutation (`<<`, `push`, `delete`, `clear`, `concat`, `replace`) + `AssociationTypeMismatch`.
2. **Slot B** (~140 LOC) — `*_ids` reader/writer + ids cache invalidation.
3. **Slot C** (~250 LOC) — Association scope chain composition for HABTM (where/order/select/group/having/unscope).
4. **Slot D** (~150 LOC) — Association options: `validate:`, `readonly:`, `extend:`.
5. **Slot E** (~280 LOC, biggest payoff) — Polymorphic + STI through.
6. **Slot F** (~200 LOC) — Eager loading through HABTM (`includes`/`preload`/`eager_load`).
7. **Slot G** (~120 LOC) — Counter-cache install on `belongs_to` + through.
8. **Slot H** (~140 LOC, low priority) — HABTM builder polish.
9. **Slot I** (~150 LOC) — `build`/`create` on HABTM with scope-attr inheritance.

**Annotation drift sweep needed first** — ~160 of these are mis-tagged as `BLOCKED: habtm` when the real cause is general-associations machinery.

## Migration cluster — Slots B, C, E closed (#1505, #1554, #1569); D, F remain

1. **Slot D** (~250 LOC) — Multi-DB `MigrationContext` factory. 7 un-skips.
2. **Slot F** (~180 LOC, in flight #1598) — Bulk-alter recorder round-trip + `change-column` test reorg. 6 un-skips.

**Followups (~200 LOC bundle across B/C/E):**

Small fidelity bundle (~50 LOC):

- ~5 LOC (C) — `MigrationProxy` interface: add `scope?: string` field (Rails `MigrationProxy = Struct.new(:name, :version, :filename, :scope)`). Unblocks Slot D engine-migration support.
- ~5 LOC (B) — `TableDefinition.toSql()` default switch reject empty/whitespace column types upfront (silent pass-through today).
- ~10 LOC (E) — Document `InternalMetadata#tableExists()` short-circuit deviation with `@internal`: returns `false` when `_enabled` is false even if physical table exists (Rails always queries `pool.schema_cache.data_source_exists?`).
- ~10 LOC (B) — Forward `currentDatabase()` + advisory-lock helpers from `SchemaAdapter` to inner adapter in test-adapter.ts. Unblocks advisory-lock test.
- ~20 LOC (B/C) — Unify `MigrationContext.tableNamePrefix`/`tableNameSuffix` two-sources-of-truth (instance fields vs `_arConfig` registry).

Larger items (each its own PR):

- ~20 LOC (E) — `MigrationContext.fromPath(dir)` factory wrapping `migrationFiles` + `parseMigrationFilename` + camelize → `MigrationProxy[]` (mirrors Rails `MigrationContext#migrations`).
- ~30 LOC (B) — CTAS `_introspectColumns` returns name-only; `_columnMeta` stored as `{type:"string"}` for any CREATE TABLE AS column. Wrong type metadata downstream of any CTAS.
- ~30 LOC (E) — `migrationsStatus()` should emit `{status:"up", version, name:"********** NO FILE **********"}` entries for schema_migrations versions absent from `this._migrations`. Unblocks "migrations status in subdirectories".
- ~50 LOC (B) — Extend prefix/suffix regression coverage to `removeColumn`, `add/removeIndex`, `add/removeForeignKey`, `add/removeCheckConstraint`, `add/removeReference`, `create/dropJoinTable`, `changeColumn*`, `renameIndex`, inspection helpers, comment helpers.

**Note:** `base.ts` now has top-level side-effect import of `migration.ts` via `registerMigrationArConfig`. Tree-shaking impact for browser bundles probably nil (Base loads most of migration.ts transitively) but worth re-verifying in BC plan revisit.

## Connection-pool cluster — all slots closed (#1556, #1570, #1587)

Slot D was 2 notification un-skips. Gap 8 (process-fork lifecycle) was a phantom — `connection_pool_test.rb` has no fork/PID test.

**Slot C-b deferred un-skips (~265 LOC + ~55 LOC shard-keys):**

- ~20 LOC — `retrieves proper connection with nested connected to`: nested shard switching via `connectsTo` pools.
- ~20 LOC — `loading relations with multi db connections`: multi-db.test.ts (AR model + lazy Relation across roles).
- ~25 LOC — `calling connected to on a non existent shard raises` ×3: needs `connectsTo` + `connectionPool()` error path.
- ~25 LOC — `shard-keys.test.ts` 3 unblocked (`connects to sets shard keys`, `for descendents`, `sharded?`).
- ~30 LOC — `connectedToAllShards()` ×3 (needs real pools).
- ~30 LOC — `establish connection using 3 levels config` (sharding file): `shards:` form + pool-name assertions.
- ~35 LOC — `establish connection using 3 levels config with shards and replica`: 4-pool variant.
- ~40 LOC — `same shards across clusters`: multi-class per-shard DB isolation with real DDL/DML.
- ~40 LOC — `sharding separation`: per-shard `:memory:` isolation with DDL/DML.
- 3 GVL-blocked thread tests → permanent-skip candidates for `unported-files.ts`.

**Smaller fidelity bundle (~40 LOC across B + C):**

- ~3 LOC (C) — `connectingTo` shard default should use `this.defaultShard()` instead of hardcoded `"default"`. Affects classes with non-default first shard from `connectsTo`.
- ~5 LOC (B) — Friendlier error when `Base.configurations` is non-standard object without `toH`: today silently resolves to empty configs then `AdapterNotSpecified`.
- ~10 LOC (B) — Track `defaultShard` on the class inside `connectsTo` (`self.default_shard = shards.keys.first`). Today `currentShard` falls back to `"default"`; matches Rails only when first shard key is `"default"`.
- ~15 LOC (B) — `connectsTo` should call Rails' `resolve_config_for_connection(database_key)` to set `_connectionSpecificationName` as a side effect. No current test exercises it.
- ~2 LOC (C) — `isPreventingWrites()` class-name string match can drift if class is renamed but pool registered under different owner-name. Very low practical risk.

## MySQL active-schema cluster (~680 LOC across 3 remaining slots, from audit-mysql-active-schema)

**Supersedes the previous Schema-cluster Slot G estimate.** Slot A closed (SQL-capture test infra + first un-skips). Remaining:

1. **Slot B** (~220 LOC) — MySQL DDL SQL parity (`dropTable` comma form, `createDatabase`/`recreateDatabase`, `indexAlgorithm` validator).
2. **Slot C** (~260 LOC) — `addIndex` MySQL output shape + inline `t.index` in `create_table`.
3. **Slot D** (~200 LOC) — Bulk change-table ALTER coalescing + timestamp tests.

## MySQL mysql2-adapter cluster (~700 LOC across 3 slots, from audit-mysql-mysql2-adapter)

9 BLOCKED tests in `adapters/mysql2/mysql2-adapter.test.ts`. Three slots:

1. **Slot A — `databaseExists` static + `exec_query(prepare:)` + DML-tolerant execQuery** (~220 LOC). Test-only "fake_connection" path that lets `Mysql2Adapter` instantiate without a live driver underpins several tests.
2. **Slot B — Translate-exception depth: timeout + statement-timeout** (~200 LOC). `read_timeout` → `AdapterTimeout`, `ER_FILSORT_ABORT` / `ER_QUERY_TIMEOUT` → `StatementTimeout`.
3. **Slot C — Timezone re-sync + db_warnings_action + test-helper infra** (~280 LOC). `query_options[:database_timezone]` plumbing + `with_db_warnings_action`.

## PG virtual-column cluster (~250 LOC, Slot B remaining)

- **Slot B** (~250 LOC) — Live-PG round-trip harness + un-skip 5 Rails-mirrored tests. `defineSchema`-less `create_table`; `change_table { |t| t.virtual ... }`; `buildFixtureSql` virtual-column filter.

---

## PG-schema audit cluster (closed)

Slots A (#1504 indexes() opclass + nulls order), B (#1458 INHERITS + #1469 comment/partition), C (#1469 schema-qualified createJoinTable), and Slot A followup (`indexes()` INCLUDE column filtering via `ix.indnkeyatts`) all closed. The 3 `SchemaIndexNullsNotDistinctTest` tests, `setSchemaSearchPath` unquoted-`$user` rejection, and Thing1..5 / Song-Album fixture-model gaps were resolved by prior Slot H-b work (#1592 / #1618).

## Unknown-triage cluster (~640 LOC, from audit-unknown-triage)

Re-categorization of all 89 `BLOCKED: unknown` annotations. **Single foundational annotation-refresh PR** unblocks downstream slot-sizing:

1. **Slot A — Annotation refresh** (~200 LOC, comment-only). Re-tag all 89 annotations into the controlled vocabulary, moving the Ruby-only language-semantics ones (`modules.test.ts` x7, `mixin.test.ts` x2, `base.test.ts` x1 — `Module#prepend`, `singleton_class`, `Module#ancestors`, constant-path lookup) to `PERMANENT-SKIP` form in `unported-files.ts`.
2. **Slot B — `insert-all.test.ts` investigation + un-skip** (~250 LOC). **64 of the 89 have stale "`MemoryAdapter accepts any attrs"` comments** that mislead the audit — there is no `MemoryAdapter`; the test setup uses `SchemaAdapter` wrapping a real driver. `InsertAll` impl is at 100% per. Real work: scrub stale comments (largely done), investigate what's actually skipped, rewrite test bodies to assert against real-adapter behavior.
3. **Slot C — SignedId real-feature gaps** (~140 LOC).
4. **Slot D — Callbacks `afterCommit` refinements** (~50 LOC).
5. **Deferred** — Misc small feature closes (~80 LOC); timezone-aware attribute methods (~150 LOC).

## STI annotation drift (~20 LOC, tests-only)

audit-STI found **no STI implementation gap**. All 6 `BLOCKED: STI` tests are mis-labeled — real causes are missing fixture scopes, UUID PK + touch on polymorphic delegated_type, and PG `CREATE TABLE … INHERITS` schema-dump . Single tests-only PR re-annotates the 6 tests under correct categories.

## Schema cluster — Slots D, E, F closed; Slot H partial (#1467, #1546, #1564, #1576); H-b + I + J + K remain

1. **Slot H-b** (~310 LOC, 13 un-skips, in flight as Slot-H followup #1592 closed partial; rest remain) — `where/pluck/classes with qualified schema name` (~200 LOC Thing1..5 AR models), `sequence schema caching` SchemaThing (~50 LOC), `habtm table name with schema` Song/Album (~30 LOC), `schema change with prepared stmt` (~20 LOC), `Active Record basics` dot-in-schema (~10 LOC). Recommended: shared `defineSchema`-based fixture file (pattern in `active-schema.test.ts`).
2. **Slot I** (~250 LOC, exploratory) — PG partitioning + inheritance introspection in dumper. 6 un-skips.
3. **Slot J** (~120 LOC) — `Schema.define` with `tableNamePrefix` + bulk-change timestamps default + SchemaCache portable bits. 5 un-skips.
4. **Slot K** — Annotation normalization across all 128 BLOCKED annotations. Lands AFTER H-b/I/J.

**Followups (~285 LOC across closed slots):**

- ~10 LOC (H) — `SchemaDumper.dump(adapter)` static method instantiates base class, not `PgSchemaDumper`. Make `dump(adapter)` dispatch through `adapter.createSchemaDumper()` when available.
- ~15 LOC (F) — Wire `changeColumn` through `changeColumnForAlter` → `SchemaCreation#accept` (Rails routing). Today functionally equivalent; future SchemaCreation visitor extensions mirror manually otherwise.
- ~20 LOC (E) — `schema load scoped to schemas` un-skip: needs `schema-cache.ts#clear` invalidation.
- ~50 LOC (E) — `schema dump scoped to schemas` un-skip in enum.test.ts: `enumTypes()` schema-scoped filtering + `with_test_schema` infra.
- ~50–200 LOC (E) — `dumping schemas` / `dump foreign key targeting different schema` / `Active Record basics` (SchemaWithDotsTest) — root-caused to incomplete `schema.ts`. Fold into a schema-dumper-specific slot.

## PG-adapter cluster — Slot A closed (#1545, #1567); Slot E optional

1. **Slot E** (optional, ~120 LOC) — Prepared-statements introspection. 3 un-skips.

**Followups (~40 LOC):**

- ~10 LOC — Promote `_instrumentedQueryOnClient` to a named internal helper and dedupe with `execQuery`'s inner lambda. Cosmetic.
- ~30 LOC — Unify `execInsert` paths: abstract default (`abstract/database-statements.ts:1375`) bypasses `sqlForInsert` entirely; a separate standalone `execInsert` function (line 390) does the right thing but isn't wired. Wire it in (or rewrite the default to call `sqlForInsert` first). Then the PG-specific `pk === false` scaffolding (#1567) can be removed.

## Transactions cluster — Slot B + C closed (#1572); D remains; E deferred

1. **Slot D** (~80 LOC) — Wire isolation tests through PG-adapter Slot D's `secondConnection` helper. 4–6 un-skips.
2. **Slot E** (deferred) — Autosave + nested_attributes (depends on `accepts_nested_attributes_for`).

**Followups (~55 LOC):**

- ~10 LOC — Un-skip `test_read_attribute_with_custom_primary_key_after_rollback` + `test_write_attribute_with_custom_primary_key_after_rollback` (same Movie fixture).
- ~10 LOC — Un-skip `restore previously new record after double save`: `_startTransactionState` snapshot is re-taken per wTRS call, so second save's `afterRollback` overwrites the correct restore. Fix capture timing.
- ~15 LOC — Un-skip `test_assign_custom_primary_key_after_rollback` (Movie create → tx update PK → rollback). Unblocked by wTRS fix.
- ~20 LOC — Deeper `update should rollback on failure!` fidelity: needs `update()` to call property setters (not just `writeAttribute`) so `replyIds: []` collection-clear works inline. Pre-existing: Rails `assign_attributes` calls setters; our writeAttribute loop doesn't.

## `NotImplementedError` elimination initiative — guardrail shipped (#1523)

**Goal: zero unjustified `NotImplementedError` throws when AR is "done."** PR #1523 annotated every throw site with `// @nie disposition=... rails=... cluster=...` and added the `blazetrails/nie-requires-annotation` ESLint rule. The annotations are now the **source of truth**; the 2026-05-11 audit numbers are superseded.

**Corrected disposition tally (per #1523 per-site verification):** 34 sites total.

- **port-real**: 23 — Rails has a real implementation; ours is a stub.
- **keep-as-strategy-hook**: 11 — Rails also raises (abstract method); we match its behavior. (Up from the original 8; #1523 found Rails has real impls for `rawExecute`, `appendCallbacks`, `lookupCastType`, SQLite3 `arelVisitor`.)
- **remove-from-class**: 0 — none. (Was 7 in the original audit; reclassified after Rails-source verification.)

**Sweeps A–G obsoleted.** The 23 port-real sites are concentrated in clusters that have their own slots — `mysql-mysql2-adapter` (4), `mysql-charset-collation` (3), `pg-long-tail` (3), `relation` (3), plus 10 in abstract/non-cluster files. The port-real work folds into existing cluster slots; no dedicated Sweep PRs needed. Track via `grep "@nie disposition=port-real" packages/activerecord/src/` — the count should decrease as cluster work lands.

**Followups from #1523:**

- ~30 LOC — `rails=file:line` annotations on the 30 sites that carry only file paths (the 4 corrected during verification have line numbers; the rest don't). Mechanical follow-up; speeds eventual port-real work.
- ~5 LOC — Extend the ESLint rule to other Rails-mirroring packages (actionpack, actionview, activemodel, activesupport, arel). None currently has NIE throws; deferred until one shows up.
- Optional — companion warn-rule on `disposition=TODO` so unclassified throws can't sit indefinitely.

## Single-slot items

These don't merit their own multi-slot cluster section.

### autosaveBelongsTo dead-code removal (~5 LOC, from #1555)

After #1555 moved belongs_to autosave into the `before_save` chain via `defineNonCyclicMethod`, the standalone `autosaveBelongsTo` function in `packages/activerecord/src/autosave-association.ts:375` and its `_autosavingRecords` add/delete calls are unreferenced. Delete the function body; keep the `_autosavingRecords` WeakSet (still used by `autosaveChildren`). Bundle into next fidelity sweep.

### MySQL onUpdate followups closed (#1402, follow-up bundle)

- `onUpdate` abstract leakage closed in #1402 — `onUpdate` moved off abstract `ColumnOptions` onto `MysqlAddColumnOptions` in mysql/schema-creation.ts.
- Function-default detection in `renameColumnForAlter` widened — non-DEFAULT_GENERATED defaults outside `RENAME_FUNC_DEFAULT_RE` now route through `defaultType(createTableInfo, columnName)`, mirroring Rails' `new_column_from_field` broader detection.

### Unported-list additions (~30 LOC bundled, 1 PR)

Mechanical: add these to `scripts/api-compare/unported-files.ts` as `PERMANENT-SKIP`. Each was identified by an audit; none reflect a real feature gap.

- `sqlite3-adapter.test.ts` — `read_uncommitted` cross-connection test (better-sqlite3 single-process model).
- `sqlite3-adapter.test.ts` — `loadExtension` / `supports_extensions` (driver doesn't expose).
- `modules.test.ts` (×7), `mixin.test.ts` (×2), `base.test.ts` (×1) — Ruby `Module#prepend` / `singleton_class` / `Module#ancestors` / constant-path-lookup semantics.

Most of this landed; remainder is the residual cleanup pass.

### AR query-parity residual — datetime precision (ar-01 / ar-52 / ar-65)

One gap tracked in [`scripts/parity/canonical/query-known-gaps.json`](../scripts/parity/canonical/query-known-gaps.json) (four gaps closed/#856/#863/#899).

**Goal:** `Order.where(created_at: oneWeekAgo..now).toSql()` emits second-precision SQL matching Rails' `quoted_date` (no fractional seconds for unscaled DATETIME columns).

**Current behaviour** (when frozen-at has non-zero ms, e.g. `175ms`):

```sql
... WHERE "orders"."created_at" BETWEEN '2026-04-18 17:53:16.175000' AND '2026-04-25 17:53:16.175000'
```

**Expected (Rails):**

```sql
... WHERE "orders"."created_at" BETWEEN '2026-04-18 17:53:16' AND '2026-04-25 17:53:16'
```

**Root cause.** Trails inlines dates from `Quoted` nodes with full precision. added bind extraction for `compileWithBinds`, but `toSql()` still inlines. The gap flakes (closes when frozen-at lands on a whole second).

**Options:**

- **Option A (BindParam-first, ~80 LOC):** In `predicate-builder/basic-object-handler.ts` + `range-handler.ts`, wrap Date values in `new Nodes.BindParam(queryAttribute)` instead of `Quoted`. Add a `quotedDateForBind` branch in `visitBindParam` that truncates to seconds. Don't change `visitQuoted` (INSERT precision preserved).
- **Option B (parity-runner side):**'s `paramSql` + binds comparison would close this in the diff layer without trails code changes — runner compares binds as ISO 8601 cross-side.

**Risk:** Medium — touches every WHERE clause in the suite. Must keep INSERT microsecond precision and numeric/string predicates unchanged. Files touched (Option A): `predicate-builder/basic-object-handler.ts`, `predicate-builder/range-handler.ts`, `arel/src/visitors/to-sql.ts#visitBindParam`, plus `scripts/parity/fixtures/ar-01/`, `ar-52/`, `ar-65/`.

---

## See also

- [`activerecord-100-plan.md`](activerecord-100-plan.md) — live tracker: in-flight PRs, post-merge fidelity followups, doc-hygiene, story count, guardrails.
- [`test-compare-100-plan.md`](test-compare-100-plan.md) — strategy + workflow + BLOCKED vocab reference.
- [`scripts/api-compare/unported-files.ts`](../scripts/api-compare/unported-files.ts) — canonical not-portable list.
