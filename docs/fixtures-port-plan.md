# Fixtures port plan

> **Status (2026-05-23):**
>
> **Fixtures port — complete.** All 122 Rails fixtures translated (PRs 0–6b + 0.5a–h + 0.75 + 4-late, merged 2026-05-20…21). `pnpm fixtures:compare` reports 0 MISSING/DIFF (PR 7 closed all gaps; MISSING/DIFF remain soft-fail, runtime errors hard-fail). Proof-of-concept fixture consumption merged (PR 8 / #2318). Schema port live in `setup-adapter-suite.ts`.
>
> **Test-models port — in progress.** 182/215 Rails test model files
> ported (as of 2026-05-23). `pnpm fixtures:compare --models --incomplete`
> lists all gaps. `--models` pass remains soft-fail until PR 9 (hard-fail
> flip) ships; that PR is gated on 100% coverage. PRs 10–22 merged;
> PR 23 (+ toy/zine additions) is the final batch (33 remaining).

Port Rails `activerecord/test/models/*.rb` files to TS so that ported
AR tests can import the canonical model classes instead of inlining
`defineSchema()`. See the status block above for current counts.

## Why

1. **Provide model definitions for ported tests.** Every fixture-driven
   Rails test file imports models like `Author`, `Post`, `Developer`.
   Without TS counterparts those tests can't be ported.
2. **Kill the inline-DDL hazard.** `defineSchema()` calls inside `it()`
   bodies leak DDL under PG/MySQL. Canonical models from this port
   remove the surface entirely.
3. **Mechanical parity.** Models mirror Rails' associations, validations,
   and scopes so ported tests work without modification.

## Current state

182/215 model files ported across PRs 1a–22. The 33 remaining are tracked
by `pnpm fixtures:compare --models --incomplete`. Translation rules below;
PR 23 is the final batch (includes toy.rb + zine.rb added 2026-05-23).

## Translation rules

Each `*.rb` becomes one TS file under
`packages/activerecord/src/test-helpers/models/`, kebab-cased.
Subdir layout is preserved (`cpk/book.rb` → `models/cpk/book.ts`).

- **Class body**: use a `static { ... }` block with `this.hasMany(...)`,
  `this.belongsTo(...)`, `this.validates(...)`, `this.scope(...)`, etc.
  Match Rails' declaration order.
- **STI**: set `this.inheritanceColumn = "..."` inside the `static` block.
- **Encrypted attributes**: call `this.encrypts(...)` inside the `static` block.
- **No inline `defineSchema()`** — canonical schema is loaded by
  `setup-adapter-suite.ts` (PR 0.5).
- **No comments** describing what a line does; only add comments for
  non-obvious invariants.

## Verification

```
pnpm fixtures:compare --models            # full models list (fixtures output unchanged)
pnpm fixtures:compare --models --incomplete  # only MISSING/DIFF models (fixtures output unchanged)
```

MISSING/DIFF soft-fail until PR 9 flips to hard-fail (runtime errors and script failures still exit non-zero).

---

## Batch plan — PRs 10–23

LOC estimates use Ruby source lines × 1.5 for TS (imports + static block
overhead). Ceiling waivers are called out per batch.

---

### PR 10 — `post.rb` _(300-LOC ceiling waived)_

~650 TS LOC. `post.rb` is 434 Ruby lines with 76 associations and 17
scopes — the largest and most association-dense model in the Rails test
suite. Standalone PR; splitting doesn't help because associations
cross-reference one another within the file.

Files: `post.rb`

---

### PR 11 — `author.rb` _(300-LOC ceiling waived)_

~480 TS LOC. `author.rb` is 320 Ruby lines with 135 associations —
second largest, cross-references `Post`, `Book`, `Category`, etc. Port
after PR 10 so Post is already available.

Files: `author.rb`

---

### PR 12 — `developer.rb` _(300-LOC ceiling waived)_

~575 TS LOC. `developer.rb` is 382 Ruby lines with 24 associations.
Standalone for the same reason as Post.

Files: `developer.rb`

---

### PR 13 — company cluster _(300-LOC ceiling waived)_

~510 TS LOC total.

| File                   | Ruby L | TS est |
| ---------------------- | ------ | ------ |
| `company.rb`           | 240    | ~360   |
| `company_in_module.rb` | 99     | ~150   |

`company_in_module.rb` defines the same model under a module namespace —
port alongside `company.rb` since they share the schema.

---

### PR 14 — person / reply / bulb _(300-LOC ceiling waived)_

~440 TS LOC total.

| File        | Ruby L | TS est |
| ----------- | ------ | ------ |
| `person.rb` | 150    | ~225   |
| `reply.rb`  | 79     | ~120   |
| `bulb.rb`   | 61     | ~92    |

`reply.rb` extends `Topic` (already ported); `person.rb` and `bulb.rb`
are standalone.

---

### PR 15 — eye / human / face / project / car / account _(300-LOC ceiling waived)_

~375 TS LOC total.

| File         | Ruby L | TS est |
| ------------ | ------ | ------ |
| `eye.rb`     | 105    | ~158   |
| `human.rb`   | 39     | ~58    |
| `face.rb`    | 17     | ~26    |
| `project.rb` | 43     | ~64    |
| `car.rb`     | 37     | ~56    |
| `account.rb` | 46     | ~69    |

`eye.rb` is large due to polymorphic helper setup; the rest are
association-rich but compact.

---

### PR 16 — customer / contact / organization cluster (~300 LOC)

~300 TS LOC total.

| File                  | Ruby L | TS est |
| --------------------- | ------ | ------ |
| `customer.rb`         | 87     | ~130   |
| `contact.rb`          | 43     | ~65    |
| `contract.rb`         | 42     | ~63    |
| `customer_carrier.rb` | 16     | ~24    |
| `organization.rb`     | 16     | ~24    |

---

### PR 17 — user / shop / hotel / job / room / misc (~280 LOC)

~280 TS LOC total.

| File                            | Ruby L | TS est |
| ------------------------------- | ------ | ------ |
| `user.rb`                       | 38     | ~57    |
| `user_with_invalid_relation.rb` | 28     | ~42    |
| `shop.rb`                       | 19     | ~28    |
| `shop_account.rb`               | 8      | ~12    |
| `hotel.rb`                      | 15     | ~22    |
| `job.rb`                        | 9      | ~14    |
| `room.rb`                       | 9      | ~14    |
| `drink_designer.rb`             | 21     | ~32    |
| `cake_designer.rb`              | 5      | ~8     |
| `publication.rb`                | 16     | ~24    |
| `interest.rb`                   | 16     | ~24    |

---

### PR 18 — encrypted models + UUID models (~270 LOC)

~270 TS LOC total.

| File                         | Ruby L | TS est |
| ---------------------------- | ------ | ------ |
| `book_encrypted.rb`          | 106    | ~160   |
| `author_encrypted.rb`        | 16     | ~24    |
| `post_encrypted.rb`          | 15     | ~22    |
| `traffic_light_encrypted.rb` | 21     | ~32    |
| `post_with_prefetched_pk.rb` | 15     | ~22    |
| `uuid_comment.rb`            | 5      | ~8     |
| `uuid_entry.rb`              | 5      | ~8     |
| `uuid_item.rb`               | 8      | ~12    |
| `uuid_message.rb`            | 5      | ~8     |

`book_encrypted.rb` carries most of the LOC; encrypted attrs require
`this.encrypts(...)` calls. UUID models are tiny but grouped here
since they touch the same OID/type infrastructure.

---

### PR 19 — destroy-async + DL-keyed + related (~290 LOC)

~290 TS LOC total.

| File                                  | Ruby L | TS est |
| ------------------------------------- | ------ | ------ |
| `destroy_async_parent.rb`             | 15     | ~22    |
| `destroy_async_parent_soft_delete.rb` | 20     | ~30    |
| `essay_destroy_async.rb`              | 13     | ~20    |
| `dl_keyed_belongs_to.rb`              | 13     | ~20    |
| `dl_keyed_belongs_to_soft_delete.rb`  | 19     | ~28    |
| `dl_keyed_has_many.rb`                | 5      | ~8     |
| `dl_keyed_has_many_through.rb`        | 5      | ~8     |
| `dl_keyed_has_one.rb`                 | 5      | ~8     |
| `dl_keyed_join.rb`                    | 10     | ~15    |
| `tyre.rb`                             | 13     | ~20    |
| `doubloon.rb`                         | 14     | ~21    |
| `tuning_peg.rb`                       | 6      | ~9     |
| `attachment.rb`                       | 7      | ~11    |
| `branch.rb`                           | 11     | ~17    |
| `entry.rb`                            | 10     | ~15    |
| `lesson.rb`                           | 13     | ~20    |
| `line_item.rb`                        | 11     | ~17    |
| `shipping_line.rb`                    | 11     | ~17    |

---

### PR 20 — CPK subdir models _(300-LOC ceiling waived)_

~340 TS LOC total. All `cpk/` subdir models; port together since the
CPK pattern (`@primaryKey = ["a", "b"]`) is consistent and agents
writing any one need the others for cross-references.

| File                           | Ruby L | TS est |
| ------------------------------ | ------ | ------ |
| `cpk/order.rb`                 | 55     | ~82    |
| `cpk/book.rb`                  | 50     | ~75    |
| `cpk/author.rb`                | 9      | ~14    |
| `cpk/book_destroy_async.rb`    | 9      | ~14    |
| `cpk/car.rb`                   | 9      | ~14    |
| `cpk/car_review.rb`            | 9      | ~14    |
| `cpk/chapter.rb`               | 12     | ~18    |
| `cpk/chapter_destroy_async.rb` | 10     | ~15    |
| `cpk/comment.rb`               | 9      | ~14    |
| `cpk/order_agreement.rb`       | 10     | ~15    |
| `cpk/order_tag.rb`             | 10     | ~15    |
| `cpk/post.rb`                  | 8      | ~12    |
| `cpk/review.rb`                | 9      | ~14    |
| `cpk/tag.rb`                   | 10     | ~15    |

---

### PR 21 — sharded / admin / publisher / autoloadable subdirs _(300-LOC ceiling waived)_

~345 TS LOC total. All remaining subdir models. `admin/user.rb` and
`admin/user_json.rb` are the largest here.

| File                                 | Ruby L | TS est |
| ------------------------------------ | ------ | ------ |
| `sharded/blog.rb`                    | 12     | ~18    |
| `sharded/blog_post.rb`               | 17     | ~26    |
| `sharded/blog_post_destroy_async.rb` | 14     | ~21    |
| `sharded/blog_post_tag.rb`           | 11     | ~17    |
| `sharded/blog_post_with_revision.rb` | 11     | ~17    |
| `sharded/comment.rb`                 | 12     | ~18    |
| `sharded/comment_destroy_async.rb`   | 12     | ~18    |
| `sharded/tag.rb`                     | 11     | ~17    |
| `admin/account.rb`                   | 5      | ~8     |
| `admin/randomly_named_c1.rb`         | 9      | ~14    |
| `admin/user.rb`                      | 49     | ~74    |
| `admin/user_json.rb`                 | 48     | ~72    |
| `publisher/article.rb`               | 6      | ~9     |
| `publisher/magazine.rb`              | 5      | ~8     |
| `autoloadable/extra_firm.rb`         | 4      | ~6     |

---

### PR 22 — misc small models batch 1 (~285 LOC)

~285 TS LOC total. Association- and scope-bearing small models.

| File                                   | Ruby L | TS est |
| -------------------------------------- | ------ | ------ |
| `comment_overlapping_counter_cache.rb` | 15     | ~22    |
| `friendship.rb`                        | 11     | ~17    |
| `molecule.rb`                          | 8      | ~12    |
| `editor.rb`                            | 8      | ~12    |
| `editorship.rb`                        | 6      | ~9     |
| `invoice.rb`                           | 7      | ~11    |
| `matey.rb`                             | 6      | ~9     |
| `family.rb`                            | 6      | ~9     |
| `family_tree.rb`                       | 6      | ~9     |
| `section.rb`                           | 6      | ~9     |
| `seminar.rb`                           | 6      | ~9     |
| `session.rb`                           | 6      | ~9     |
| `student.rb`                           | 6      | ~9     |
| `department.rb`                        | 6      | ~9     |
| `professor.rb`                         | 7      | ~11    |
| `recipe.rb`                            | 5      | ~8     |
| `recipient.rb`                         | 5      | ~8     |
| `mentor.rb`                            | 5      | ~8     |
| `message.rb`                           | 6      | ~9     |
| `image.rb`                             | 5      | ~8     |
| `translation.rb`                       | 9      | ~14    |
| `treaty.rb`                            | 5      | ~8     |
| `country.rb`                           | 5      | ~8     |
| `engine.rb`                            | 5      | ~8     |
| `electron.rb`                          | 7      | ~11    |

---

### PR 23 — misc small models batch 2 (~284 LOC)

~284 TS LOC total. No-association or minimal models; many are stubs for
edge-case tests. `notification.rb` already ported; `toy.rb` and `zine.rb`
added 2026-05-23 (not in original plan). Covers all 33 remaining MISSING
models after PRs 10–22.

| File                                      | Ruby L | TS est |
| ----------------------------------------- | ------ | ------ |
| `numeric_data.rb`                         | 12     | ~18    |
| `boolean.rb`                              | 7      | ~11    |
| `auto_id.rb`                              | 6      | ~9     |
| `non_primary_key.rb`                      | 4      | ~6     |
| `pk_autopopulated_by_a_trigger_record.rb` | 5      | ~8     |
| `measurement.rb`                          | 4      | ~6     |
| `without_table.rb`                        | 5      | ~8     |
| `too_long_table_name.rb`                  | 5      | ~8     |
| `raises_argument_error.rb`                | 5      | ~8     |
| `raises_no_method_error.rb`               | 5      | ~8     |
| `invokes_an_undefined_method.rb`          | 5      | ~8     |
| `column.rb`                               | 5      | ~8     |
| `column_name.rb`                          | 5      | ~8     |
| `record.rb`                               | 4      | ~6     |
| `default.rb`                              | 4      | ~6     |
| `guid.rb`                                 | 4      | ~6     |
| `carrier.rb`                              | 4      | ~6     |
| `discount.rb`                             | 4      | ~6     |
| `cart.rb`                                 | 5      | ~8     |
| `event.rb`                                | 5      | ~8     |
| `keyboard.rb`                             | 5      | ~8     |
| `possession.rb`                           | 5      | ~8     |
| `task.rb`                                 | 7      | ~11    |
| `strict_zine.rb`                          | 7      | ~11    |
| `zine.rb`                                 | 6      | ~10    |
| `toy.rb`                                  | 8      | ~12    |
| `frog.rb`                                 | 8      | ~12    |
| `hardback.rb`                             | 7      | ~11    |
| `chat_message.rb`                         | 8      | ~12    |
| `order.rb`                                | 6      | ~9     |
| `liquid.rb`                               | 6      | ~9     |
| `guitar.rb`                               | 6      | ~9     |
| `personal_legacy_thing.rb`                | 6      | ~9     |

---

### Post-merge follow-ups (Copilot review findings from PRs 13–22)

These are bugs in already-merged model files. Fix alongside or just before PR 9.

**CPK order associations — missing `primaryKey: "id"` (#2340 / PR 20)**
`CpkOrder`, `CpkOrderAgreement`, `CpkOrderTag`, and `CpkOrderWithPrimaryKeyAssociatedBook`
all have associations where a composite-PK owner joins via a scalar FK (`order_id`)
without specifying `primaryKey: "id"`. Without it the runtime will raise
`CompositePrimaryKeyMismatchError` on load. Add `primaryKey: "id"` to each:

- `cpk/order.ts` — `hasMany("orderAgreements")`, `hasMany("orderTags")`, `CpkOrderWithPrimaryKeyAssociatedBook.hasOne("book")`
- `cpk/order-agreement.ts` — `belongsTo("order")`
- `cpk/order-tag.ts` — `belongsTo("order")`

**Company association redefinition (#2339 / PR 13)**
`company.ts` declares `hasOne("account")` on `Company`; subclasses like `Firm` and
`Agency` re-declare associations with the same name. Association lookup currently
picks the first definition, so subclass overrides are silently ignored. This is a
runtime behavior gap; track separately — fixing it may require changes to
`associations.ts` lookup logic.

**WebTopic tableName (#2342 / PR 14)**
`WebTopic` in `topic.ts` inherits `Base` and will infer table name `"web_topics"`,
but the schema has a `"topics"` table. Add `static _tableName = "topics"` (or extend
`Topic`) to `WebTopic`.

**Eye.ts duplicate callbacks (#2343 / PR 15)**
`eye.ts` registers `afterCreate`/`afterUpdate`/`afterSave` callbacks twice. Remove
the duplicate block.

**Account.ts hard-coded class reference (#2343 / PR 15)**
`Account.destroyedAccountIds()` and its callback hard-code `Account._destroyedAccountIds`
instead of `this._destroyedAccountIds`. Change to `this` so subclass overrides work.

**destroy() override type mismatch (#2338 / PR 22)**
`destroy-async-parent-soft-delete.ts` and `dl-keyed-belongs-to-soft-delete.ts` override
`destroy()` synchronously, returning `boolean | Promise<boolean>` instead of `Promise<this | false>`.
Make each override `async`, `await` the inner `update`/`runCallbacks` calls, and return
`this` on success or `false` on failure so callers that `await record.destroy()` work correctly.

**invoice.ts beforeSave lazy-load (#2329 / PR 16)**
`invoice.ts` sums `lineItems.map(...)` in a `beforeSave` callback without awaiting the
association load. If `lineItems` hasn't been eager-loaded, `balance` silently computes as 0.
Make the callback `async` and `await this.lineItems.load()` (or `await this.lineItems`)
before summing.

---

### PR 9 (final) — flip `models:compare` to hard-fail

~30 TS LOC. Gated on 100% coverage from PRs 10–23 (PR 23 covers the final 33 models). Three changes that
must land together:

1. Flip `runModelsPass` in `scripts/fixtures-compare/compare.ts` to exit
   non-zero when `missing > 0 || diff > 0`.
2. Remove `vendor/rails/activerecord/test/models/` exclusion from
   `scripts/api-compare/unported-files.ts` (if present at merge time).
3. Verify CI job invokes `--models` and fails the build on non-zero exit.

Run `pnpm fixtures:compare --models` before opening; it must show
`missing=0 diff=0`.

---

## Decisions

1. **Always mirror Rails ids.** Every TS fixture row carries the explicit
   `id: N` from the Rails YAML. CRC32-default via `fixtureId()` is dropped
   for ported fixtures — Rails parity wins. `fixtureId()` stays for
   ad-hoc test-only fixtures not mirroring a Rails YAML.

2. **Schema port is complete (PR 0.5).** `test-schema.ts` is loaded by
   `setup-adapter-suite.ts`. No per-model mini-schemas in ported files.

3. **ERB → `adapterName` helper.** `adapterName(adapter)` is in
   `define-fixtures.ts`. Compare script renders Rails ERB with stub
   bindings. ERB allow-list (`mixins`, `paragraphs`, `citations`) is in
   `compare.ts`.

4. **CI strictness: `--models` soft until PR 9, then hard-fail.** The
   `--incomplete` flag (`pnpm fixtures:compare --models --incomplete`)
   shows only gaps, making it actionable during the port without
   changing exit behavior.
