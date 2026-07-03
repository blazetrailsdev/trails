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
HABTM middle loaders. Rails fully resolves one HABTM through-chain
(middle `HABTM_Posts` → source `Post` → done) before the next HABTM's middle
load begins. Because each join-table row is thus instantiated only under its own
join model, `ThroughAssociation#source_preloaders` always preloads the matching
source `belongs_to` (`post` on `HABTM_Posts`, `otherPost` on `HABTM_OtherPosts`)
— no conflation is possible.

The isolation is a **scheduling** property, not a key property: it comes from
Rails processing each through-association's middle loaders one branch-subtree at
a time (`preloader/batch.rb` + `preloader/through_association.rb:70-80`), never
presenting sibling same-table middle loaders to `group_and_load_similar`
together.

### 3. trails co-groups all three siblings in one pass

The same instrumentation in `preloader/batch.ts` shows trails presenting **all
three** sibling middle loaders to `_groupAndLoadSimilar` in a single Batch pass:

```
[TRAILS-PASS] loaders=HABTM_Posts:categories_posts,HABTM_OtherPosts:categories_posts,HABTM_SpecialPosts:categories_posts futureTables={posts}
```

With identical `LoaderQuery.hashKey()` values, the three collapse into one group
→ one query → one join-model class for every row → `AssociationNotFound` when the
source preloader looks up the sibling's `belongsTo`.

## Verdict

The `_joinModelDiscriminator` guard is **(b): a trails-local compensation for a
Batch-scheduling divergence**, not a faithful stand-in for a Rails mechanism
(a). Rails' key fields are provably identical across the three join models
(same `hash`); Rails avoids conflation purely by never co-scheduling sibling
same-table through middle loaders. trails co-schedules them.

The guard achieves the correct **outcome** (each join model materializes its own
rows) by the only field that differs — the anonymous class name — but it does so
at the wrong layer. The Rails-faithful fix is to converge trails'
`Preloader::Batch`/`Branch` scheduling so sibling through-association middle
loaders sharing a join table are presented to `_groupAndLoadSimilar` one at a
time (Rails' observed `branches=1`-per-HABTM behavior), after which the
`HABTM_*` name-sniff can be dropped.

## Recommendation

- Keep the PR #4468 guard as an **interim** compensation (it is narrow — keyed
  only on anonymous `HABTM_*` join models — so it cannot perturb ordinary models
  or STI subclasses that legitimately share a table), with its comment updated
  to reference this investigation and classify it as a scheduling-divergence
  compensation rather than "mechanism not pinned".
- Do the real convergence under
  `converge-habtm-jointable-preloader-batch-scheduling`: match Rails' scheduler
  and drop the name-sniff. That change touches the core preloader scheduler
  (broad blast radius across all eager loading), so it is scoped as its own
  story rather than folded into #4468.
