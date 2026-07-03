# HABTM join-table preloader batch conflation — investigation

Story: `habtm-preloader-jointable-batch-conflation-investigation`
(RFC 0005-activerecord-gaps). Follow-up convergence:
`converge-habtm-jointable-preloader-batch-scheduling`.

## The question

PR #4468 converged the anonymous HABTM join-model source `belongsTo` name to
Rails (`singularize(assocName)` — `post`/`otherPost`/`specialPost` for
Category's `posts`/`otherPosts`/`specialPosts`, all `class_name: "Post"` on
`categories_posts`; see
`vendor/rails/activerecord/lib/active_record/associations/builder/has_and_belongs_to_many.rb:39-43`).

That exposed a preloader conflation. trails' `Preloader::Batch` groups
preloads by `LoaderQuery` — the same four fields Rails keys on
(`association_key_name`, `scope.table_name`, `connection_specification_name`,
`values_for_queries`;
`vendor/rails/activerecord/lib/active_record/associations/preloader/association.rb:17-26`).
For the three sibling HABTM **middle (through) loaders** those four fields are
byte-identical, so trails batches them into one query and instantiates every
`categories_posts` row as whichever anonymous join model wins the group
(`HABTM_Posts`). The through source preloader then preloads `otherPost` on
`HABTM_Posts` records — which don't declare it — raising `AssociationNotFound`.

PR #4468 added a trails-local guard: `LoaderQuery._joinModelDiscriminator`
appends the anonymous `HABTM_*` class name to the batch key. Rails has **no**
such discriminator, yet
`test_eager_with_multiple_associations_with_same_table_has_many_and_habtm`
(`vendor/rails/activerecord/test/cases/associations/eager_test.rb:1027`) passes.
Why?

## Method

Ran the Rails test under instrumentation (`ARCONN=sqlite3`, patched
`Preloader::Batch`/`LoaderQuery`/`Branch`) and the equivalent trails test
(`eager.test.ts`, "eager with multiple associations with same table has many
and habtm") with logging in `preloader/batch.ts`.

## Findings

### 1. Rails' `LoaderQuery` does NOT distinguish the three join models

The three HABTM middle loaders produce **identical** `LoaderQuery` keys in
Rails — same `association_key_name` (`category_id`), same `scope.table_name`
(`categories_posts`), same connection, empty `values_for_queries`, and even the
**same `hash` value** (`-4227892123328925730` for all three). If they ever
shared a grouping pass, Rails would conflate them exactly as trails does. So the
guard is **not** a stand-in for any Rails key-level mechanism — Rails carries no
class identity in the batch key.

### 2. Rails never co-groups them — every HABTM middle pass is isolated

Instrumenting `Preloader::Batch#call` shows that **every** batch pass that runs
a HABTM middle loader has `branches == 1` and exactly one runnable HABTM loader:

```
[PASS] branches=1 runnableLoaders=["HABTM_Posts"]        target=["HABTM_Posts"]
[PASS] branches=1 runnableLoaders=["HABTM_OtherPosts"]   target=["HABTM_OtherPosts"]
[PASS] branches=1 runnableLoaders=["HABTM_SpecialPosts"] target=["HABTM_SpecialPosts"]
```

Across the whole test there is **never** a pass whose runnable set contains two
HABTM middle loaders. Because each join-table row is thus instantiated only under
its own join model, `ThroughAssociation#source_preloaders` always preloads the
matching source `belongs_to` (`post` on `HABTM_Posts`, `otherPost` on
`HABTM_OtherPosts`) — no conflation is possible.

### 2a. Why `branches == 1` — the pinned root cause

The isolation is **not** a `Batch`/`Branch` scheduling subtlety (both trails and
Rails run the identical `batch.rb` algorithm). It is one level up, in the driver
that invokes the preloader. Rails'
`ActiveRecord::Relation#preload_associations`
(`vendor/rails/activerecord/lib/active_record/relation.rb:1321-1328`) runs **one
`Preloader.call` per top-level entry**:

```ruby
def preload_associations(records) # :nodoc:
  preload = preload_values
  preload += includes_values unless eager_loading?
  scope = strict_loading_value ? StrictLoadingScope : nil
  preload.each do |associations|
    ActiveRecord::Associations::Preloader.new(records: records, associations: associations, scope: scope).call
  end
end
```

So `includes(:posts, :other_posts, :special_posts)` fans out into **three
separate `Preloader.call` invocations** — three separate `Batch`es, each with a
single branch (`branches == 1`). The sibling HABTM through-associations are never
members of the same `Batch`, so their middle loaders can never reach the same
`group_and_load_similar` pass.

### 3. trails co-groups all three siblings in one pass

trails' driver does **not** fan out per entry. `Relation#_preloadAssociationsForRecords`
(`packages/activerecord/src/relation.ts:6169-6181`) passes the **whole list** to a
**single** `Preloader`:

```ts
const preloader = new Preloader({
  records: records as unknown as import("./base.js").Base[],
  associations: assocNames, // e.g. ["posts", "otherPosts", "specialPosts"]
  scope: this._isStrictLoading ? StrictLoadingScope : undefined,
});
await preloader.call();
```

So all three HABTM branches live in **one** `Batch`. Instrumenting
`preloader/batch.ts` confirms trails presents **all three** sibling middle loaders
to `_groupAndLoadSimilar` in a single pass:

```
[TRAILS-PASS] loaders=HABTM_Posts:categories_posts,HABTM_OtherPosts:categories_posts,HABTM_SpecialPosts:categories_posts futureTables={posts}
```

With identical `LoaderQuery.hashKey()` values, the three collapse into one group
→ one query → one join-model class for every row → `AssociationNotFound` when the
source preloader looks up the sibling's `belongsTo`.

## Verdict

The `_joinModelDiscriminator` guard is **(b): a trails-local compensation for a
preloader-driver divergence**, not a faithful stand-in for a Rails key mechanism
(a). Rails' `LoaderQuery` fields are provably identical across the three join
models (same `hash`); Rails avoids conflation purely because its
`Relation#preload_associations` runs **one `Preloader.call` per top-level
`includes`/`preload` entry**, so sibling same-table HABTM through-associations
are never in the same `Batch`. trails runs one `Preloader` for the whole entry
list, so they are — and their identical `LoaderQuery` keys then collapse them
into one query.

The guard achieves the correct **outcome** (each join model materializes its own
rows) by the only field that differs — the anonymous class name — but at the
wrong layer. The `Batch`/`Branch`/`LoaderQuery` code is already Rails-faithful;
the divergence is a single locus in the driver.

## Recommendation

- Keep the PR #4468 guard as an **interim** compensation (it is narrow — keyed
  only on anonymous `HABTM_*` join models — so it cannot perturb ordinary models
  or STI subclasses that legitimately share a table), with its comment updated
  to reference this investigation and classify it as a driver-divergence
  compensation rather than "mechanism not pinned".
- Do the real convergence under
  `converge-habtm-jointable-preloader-batch-scheduling`: converge
  `Relation#_preloadAssociationsForRecords` (`relation.ts:6169-6181`) to Rails'
  per-entry loop (`relation.rb:1325`) — iterate `assocNames` and build a fresh
  `Preloader` per entry — then drop the `HABTM_*` name-sniff. This is a small,
  Rails-faithful change, but it removes trails' current cross-entry batching
  (trails today co-batches same-table loaders across distinct top-level
  `includes` entries, which Rails does not), so it can shift query counts in
  `assertNoQueries`-style tests — hence it is scoped as its own story with a
  full preloader/eager-loading regression run rather than folded into #4468.
