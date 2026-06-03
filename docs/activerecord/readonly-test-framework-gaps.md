# readonly.test.ts — deferred framework gaps

Surfaced while porting `readonly.test.ts` to a faithful, DDL-free mirror of Rails
`activerecord/test/cases/readonly_test.rb`. That PR replaced multiple bespoke
`defineSchema` blocks (with divergent `posts`/`users`/`products`/`items`/`devs`/
`ro_people` shapes) with a single handler-suite describe backed by canonical
`Developer`, `Person`, and `Post` fixtures — zero per-test DDL.

Each skip below names a real gap; closing it un-skips the listed test(s). These
are **separate implementation PRs** — they touch association collection proxy
infrastructure and shouldn't ride a test rewrite.

Ordered by yield (tests un-skipped per fix).

## Framework gaps (fixable)

| Gap                                                                                                                                                                                                                | Tests un-skipped                                                                                                                     | Notes                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Association collection proxy readonly propagation** — `post.comments` returns a proxy that must support `.any(&:readonly?)` and `.readonly(true).all(&:readonly?)` as a chainable relation                       | `has many find readonly` (1)                                                                                                         | Post already has `hasMany("comments")`; the proxy needs a chainable `.readonly(value)` accessor and `any()` / `all()` iterators.                                                                      |
| **has_many through collection readonly flag** — `post.people` (through readers) must return records NOT marked readonly; `posts(:welcome).people.find(id/first/last)` must also be non-readonly                    | `has many with through is not implicitly marked readonly`, `…while finding by id`, `…while finding first`, `…while finding last` (4) | Post already has `hasMany("people", { through: "readers" })`; the through-join path must not propagate the readonly flag to the loaded records.                                                       |
| **Association collection proxy method_missing delegation** — `developer.projects.allAsMethod().first()` and `project.comments.allAsMethod().first()` must surface class-method scopes through the collection proxy | `association collection method missing scoping not readonly` (1)                                                                     | `Project.allAsMethod()` and `Project.allAsScope()` are defined in the canonical Project model (project.ts:62–65); the collection proxy must delegate unknown method calls to the association's scope. |

## Intentional omissions

- **`assert_not dev.save` (inside `assert_nothing_raised`)** — Rails'
  `readonly_test.rb` has an `assert_nothing_raised { assert_not dev.save }` block
  that reflects a historical Rails behavior where `save` returned `false` for
  readonly records. In the current vendor/rails source, `save` rescues only
  `RecordInvalid` (not `ReadOnlyRecord`), so `save` on a readonly record raises
  `ReadOnlyRecord`. The port tests the current behavior (save raises) and omits
  the stale `assert_not dev.save` assertion.
