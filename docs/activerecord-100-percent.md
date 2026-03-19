# ActiveRecord: Road to Feature Completeness

Current state: **52.2%** (4,374 OK / 8,385 Ruby tests). Additionally: 3,767 skipped stubs, 52 in wrong describe blocks, 244 with no TS equivalent.

## How coverage is measured

`npm run convention:compare` matches our test names against the Rails test suite. Test coverage is a trailing indicator — it goes up as a side effect of implementing features, not as a goal in itself.

## Two workstreams

These can be worked on in parallel — they touch different files.

---

### Workstream A: Associations & Querying

The goal is to make ActiveRecord associations work the way a Rails developer expects. Someone reading the Rails guides on associations should be able to write equivalent TypeScript.

#### A1: Through associations

Implement `has_many :through` so you can do things like:

```ts
// class Post extends Base { static { this.hasMany('tags', { through: 'taggings' }) } }
const tags = await post.tags;
Post.joins("tags").where({ tags: { name: "ruby" } });
```

Partially implemented in #128: through-aware `build`/`create` on `CollectionProxy`,
49 new passing tests covering basic through CRUD, polymorphic/STI through,
nested through chains, and collection proxy operations (push/delete/replace/setIds).

Further progress in #130: 6 more tests unskipped covering callback ordering,
scope filtering on targets, and error handling. Also adds error classes (`HasManyThroughCantAssociateThroughHasOneOrManyReflection`,
`HasManyThroughNestedAssociationsAreReadonly`, `HasOneThroughNestedAssociationsAreReadonly`,
`HasManyThroughOrderError`) — these aren't wired into CollectionProxy enforcement yet,
that should be a separate PR when the write protection logic is implemented.

Remaining ~97 skipped tests need:

- **SQL join generation** (~20): `joins`, `left_joins`, `inner_join`, `explicitly_joining_join_table`, `joining_has_many_through_*`
- **Scope merging on through** (~15): `source_scope`, `through_scope_with_includes/joins`, `unscope`, `default_scope_on_target`
- **Preload for nested through** (~25): all `*_preload` and `*_preload_via_joins` tests in nested-through
- **Counter caches** (6): `update_counter_caches_on_*`
- **Transactions** (2): `transaction_method_starts_transaction`, `through_model_to_create_transactions`
- **Write protection enforcement** (~3): wire `HasManyThroughNestedAssociationsAreReadonly` etc. into CollectionProxy to raise on nested through writes
- **Validation propagation** (3): `create_bang_should_raise`, `save_bang_should_raise`, `save_returns_falsy` when join record has errors
- **Distinct on through** (~2): distinct through source/through reflection
- **`_pushThrough` FK resolution**: currently uses convention-based `sourceFk`; should resolve the source association's configured `foreignKey` option to handle nonstandard FK columns correctly
- **Order preservation**: through loader uses WHERE IN which returns by PK order; true order preservation needs ORDER BY support

This is the biggest missing feature — it unlocks join models, nested through chains, and through-source reflection. Also covers `has_one :through`.

#### A2: Eager loading

Implement `includes`/`preload`/`eagerLoad` so N+1 queries can be avoided:

```ts
const posts = await Post.includes("comments", "author").all();
// comments and author are preloaded, no additional queries
```

Partially started in #114. Needs: preloader, batch loading, nested eager loading, polymorphic eager loading.

#### A3: Autosave associations

When you save a parent, its dirty children should be saved too:

```ts
const post = await Post.find(1);
post.comments[0].body = "updated";
await post.save(); // also saves the updated comment
```

Includes `markForDestruction`, validation propagation through nested models, and `accepts_nested_attributes_for`.

#### A4: HABTM

Implement `has_and_belongs_to_many` — the simpler many-to-many without an explicit join model:

```ts
// class Assembly extends Base { static { this.hasAndBelongsToMany('parts') } }
await assembly.parts; // queries through assemblies_parts join table
```

Join table management, bidirectional syncing.

#### A5: Scoping

Make `default_scope`, `unscoped`, and `scoping` work so queries are composable:

```ts
class PublishedPost extends Post {
  static {
    this.defaultScope((rel) => rel.where({ published: true }));
  }
}
PublishedPost.all(); // automatically filtered
PublishedPost.unscoped().all(); // bypasses default scope
```

#### A6: Where clause features

`where.not`, `or`, `and`, polymorphic where, range conditions:

```ts
Post.where.not({ status: "draft" });
Post.where({ status: "published" }).or(Post.where({ featured: true }));
Post.where({ created_at: [startDate, endDate] }); // BETWEEN
```

---

### Workstream B: Core ORM & Infrastructure

The goal is to make ActiveRecord work as a real ORM — connecting to databases, managing schemas, caching queries, and handling the lifecycle of records.

#### B1: Base class features

The core `Base` class needs attribute API completions, type casting, STI (single table inheritance), abstract classes, and configuration:

```ts
class Animal extends Base {}
class Dog extends Animal {} // STI: stored in animals table with type='Dog'
```

#### B2: PostgreSQL types

Implement PG-specific types so you can store and query rich data:

```ts
// Range columns
Post.where({ published_during: new Range(startDate, endDate) });
// Array columns
Post.where("tags @> ARRAY[?]", ["ruby"]);
// HStore columns
Post.where("metadata -> 'color' = ?", "red");
```

Requires `PG_TEST_URL` for integration tests.

#### B3: PostgreSQL adapter & schema

Schema introspection, DDL generation, and adapter-specific features so migrations and schema dumps work against real Postgres.

#### B4: Fixtures

Implement fixture loading so tests can use declarative test data:

```ts
// test/fixtures/posts.yml equivalent
const post = fixtures("posts", "first");
```

YAML parsing, caching, transactional fixtures for test isolation.

#### B5: Query cache

Cache repeated queries within a request/block so the same SELECT doesn't hit the DB twice:

```ts
await QueryCache.run(async () => {
  await Post.find(1); // hits DB
  await Post.find(1); // served from cache
});
```

#### B6: Schema & migrations

DDL generation so you can define schema changes in code:

```ts
class CreatePosts extends Migration {
  async change() {
    await this.createTable("posts", (t) => {
      t.string("title");
      t.text("body");
      t.timestamps();
    });
  }
}
```

Schema dumper, migrator, database tasks.

Implemented in #143: SchemaDumper foundation, `ifNotExists`/`ifExists` migration options,
table name length validation, MigrationContext schema introspection (`tables`/`columns`/`indexes`).
19 tests unskipped.

Remaining follow-ups from review:

- **Adapter-specific existence checks**: `tableExists()` and `columnExists()` use SQLite-specific queries; need adapter-aware implementations for Postgres/MySQL
- **Adapter-specific identifier length**: Hard-coded to 64 (Rails default); PostgreSQL limit is 63. Should use adapter-provided `maxIdentifierLength`
- **SchemaDumper force:cascade**: Emit `force: :cascade` on `createTable` for idempotent schema loads
- **SchemaDumper prefix/suffix**: `tableNamePrefix`/`tableNameSuffix` filtering for dump-to-file workflow
- **SchemaDumper roundtrip**: Validate dumped schema can execute against MigrationContext and reproduce original structure
- **Migration version tracking**: `schema_migrations` table, version ordering, `dump_schema_information`
- **File-system migration discovery**: Loading migration files from a directory
- **Advisory locking, multi-database, database task runners**

#### B7: Encryption

Encrypted attributes so sensitive data is encrypted at rest:

```ts
class User extends Base {
  static {
    this.encryptsAttribute("email", { deterministic: true });
  }
}
await User.findBy({ email: "dean@example.com" }); // queries encrypted column
```

#### B8: Connections

Connection pooling, multi-database support, and adapter resolution:

```ts
Base.establishConnection({ adapter: 'postgresql', database: 'myapp' });
Base.connectedTo({ role: 'reading' }, async () => { ... });
```

#### B9: Reflection & insert-all

The reflection API lets you introspect associations and columns at runtime. Insert-all/upsert for bulk operations:

```ts
Post.reflectOnAssociation("comments"); // => HasManyReflection
Post.insertAll([{ title: "A" }, { title: "B" }]); // single INSERT
Post.upsertAll([{ id: 1, title: "Updated" }]); // INSERT ... ON CONFLICT
```

#### B10: Locking, strict loading, and remaining features

Optimistic locking (`lock_version`), pessimistic locking (`lock!`), strict loading modes, counter caches, collection cache keys, instrumentation, and other smaller features.

---

### Wrong describes (52 remaining)

Fix alongside whichever PR touches the relevant file:

- nested-attributes.test.ts (18) — A3
- PostgreSQL adapter files (26 across ~12 files) — B2/B3
- scoping/relation-scoping.test.ts (1) — A5
- associations/nested-error.test.ts (3) — A3

---

## Tracking

```bash
npm run convention:compare -- --package activerecord
```
