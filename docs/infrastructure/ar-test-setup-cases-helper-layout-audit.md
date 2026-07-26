# AR test-setup layout vs Rails `test/cases/helper.rb` (spike audit)

RFC 0064 (ar-test-infra-layout-fidelity), story
`spike-align-test-setup-with-cases-helper`. Question raised while reviewing
PR #4791: now that `packages/activerecord/src/test-setup-ar.ts` mirrors four
distinct `helper.rb` lines, should the AR test-setup files be reorganized under
a Rails-style `cases/` tree (e.g. `cases/helper.ts`), or does the
`test-setup-*` convention stay?

**Recommendation: rename to a Rails `cases/` + `support/` layout (option a).**
Plan and follow-up stories at the bottom.

> **Revision, 2026-07-26.** The first version of this audit recommended keeping
> `test-setup-*`. That was wrong on a fact and wrong on a weighting, and is
> corrected here — see [Why the first recommendation was
> wrong](#why-the-first-recommendation-was-wrong).

## What `helper.rb` actually does

`vendor/rails/activerecord/test/cases/helper.rb` is 107 lines and does seventeen
loosely related things. Mapped to trails:

| helper.rb responsibility                                         | trails location                                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `:3` `require "config"` — test DB config / connection env        | `test-helpers/test-connection-env.ts`, `test-helpers/test-database-config.ts`                                        |
| `:7–12` requires — library load                                  | ESM imports at each call site                                                                                        |
| `:14–16` PG `create_unlogged_tables = true`                      | `connection-adapters/postgresql-adapter.ts` (flag exists); **not** set suite-wide                                    |
| `:20` `Thread.abort_on_exception`                                | no analogue (single-threaded JS)                                                                                     |
| `:23` `deprecator.debug = true`                                  | no analogue                                                                                                          |
| `:27` `permanent_connection_checkout = :disallowed`              | `ar-config.ts:126` (flag exists); **not** set suite-wide                                                             |
| `:29` `delegate_base_methods = false`                            | `test-setup-ar.ts:39`                                                                                                |
| `:32` `Relation.remove_method(:klass)`                           | no analogue (no Ruby alias to un-define)                                                                             |
| `:35` `I18n.enforce_available_locales`                           | no analogue                                                                                                          |
| `:38` `QUOTED_TYPE`                                              | resolved per-site; see `test-helpers/models/comment.ts:122`                                                          |
| `:40` `automatically_invert_plural_associations`                 | `test-setup-ar.ts:42`                                                                                                |
| `:42` `raise_on_assign_to_attr_readonly`                         | `test-setup-ar.ts:47`                                                                                                |
| `:43` `belongs_to_required_validates_foreign_key = false`        | `ar-config.ts` / `trailtie.ts` defaults; **not** set suite-wide                                                      |
| `:45–46` register `abstract` / `fake` adapters                   | `connection-adapters.ts` resolve pre-warm in `test-setup-worker-db.ts:181-186`; the `fake` adapter is built per-test |
| `:48–95` `SQLSubscriber`, `InTimeZone`, `WaitForAsyncTestHelper` | `adapters/postgresql/test-helper.ts` (SQLSubscriber), `test-helpers/in-time-zone.ts`; no `waitForAsyncQuery`         |
| `:99–102` `Encryption.configure`                                 | `test-setup-ar.ts:55-59`                                                                                             |
| `:104–107` `extend_queries = true` + `install_support`           | `encryption/config.ts:22` defaults to `false`; **not** installed suite-wide                                          |

Plus responsibilities trails needs that `helper.rb` has no counterpart for,
because Rails' test runner is a single process with a single database:

- per-worker DB isolation slots (advisory lock / `GET_LOCK`) —
  `test-setup-worker-db.ts`
- canonical-schema template build + per-worker clone — vitest `globalSetup`
  (`test-helpers/template-global-setup.ts`), `test-helpers/canonical-schema.ts`
- per-worker `establishConnection` + `loadSchema`/`reconstructFromSchema` —
  `test-setup-dy.ts`
- MySQL unhandled-rejection shield — `test-setup-mysql.ts`
- opt-in DDL profiler — `test-setup-ddl-profile.ts`

So `helper.rb`'s content is a **strict subset** of what the trails setup files
do, spread across five files (plus `globalSetup`), three of which exist only
because of vitest's fork model. Of the 17 rows above, 4 have no analogue by
language (`Thread.abort_on_exception`, the deprecator, `remove_method`, I18n)
and 13 have a trails home; `test-setup-ar.ts` owns 4 of those 13.

The boot order these files run in, which is what actually constrains the layout:

| when                                       | file                                    | wired at               |
| ------------------------------------------ | --------------------------------------- | ---------------------- |
| once, main process, pre-fork               | `test-helpers/template-global-setup.ts` | `globalSetup`          |
| per worker, 1st setupFile                  | `test-setup-worker-db.ts`               | `vitest.config.ts:363` |
| per worker, 2nd                            | `test-setup-ar.ts`                      | `vitest.config.ts:364` |
| per worker, MySQL lane only                | `test-setup-mysql.ts`                   | `vitest.config.ts:366` |
| per worker, after the driver is registered | `test-setup-dy.ts`                      | `vitest.config.ts:368` |
| per worker, `DDL_PROFILE=1` only           | `test-setup-ddl-profile.ts`             | `vitest.config.ts:371` |

## Why the first recommendation was wrong

**The factual error.** v1 claimed the trails setup files have "no counterpart"
in Rails and that a `cases/` tree would be "a rename of 1 of 5 files, not a
consolidation." That is false. `vendor/rails/activerecord/test/support/`
contains ten files — `config.rb`, `connection.rb`, `connection_helper.rb`,
`load_schema_helper.rb`, `adapter_helper.rb`, `async_helper.rb`, `ddl_helper.rb`,
`schema_dumping_helper.rb`, `fake_adapter.rb`, `tools.rb` — plus
`test/config.rb`. Most of what our test-infra files do has a _named_ Rails home.
v1 only compared against `cases/helper.rb` and concluded from that narrow view
that nothing else mapped.

**The weighting error.** Three of v1's five arguments were convenience, not
fidelity: rename cost (93 references, lint globs, ratchet JSONs), consistency
with the sibling `test-setup-*` convention (a trails invention, not a Rails
one), and "the compare tooling doesn't map these files anyway." Fidelity is this
project's primary goal; those are costs to pay and mechanisms to update, not
reasons to keep a non-Rails name.

What survives from v1: the boot-order constraint is real, so the five setup
files cannot collapse into one. But Rails' test infra is not one file either —
it is `cases/helper.rb` plus ten `support/*.rb`. Multiple files is the faithful
shape; only our _names and directories_ are invented.

**The precedent already exists.** `test-helpers/` already contains
`connection-helper.ts` and `schema-dumping-helper.ts` — exact kebab-case
renderings of `support/connection_helper.rb` and `support/schema_dumping_helper.rb`.
Someone already started mirroring `support/` file-for-file; they just did it
inside a directory named `test-helpers/`. This plan finishes that work rather
than starting something new.

## Target layout

```
packages/activerecord/src/
  cases/
    helper.ts               <- test/cases/helper.rb
  support/
    config.ts               <- test/support/config.rb  (+ test/config.rb)
    connection.ts           <- test/support/connection.rb
    connection-helper.ts    <- test/support/connection_helper.rb    [name already matches]
    schema-dumping-helper.ts<- test/support/schema_dumping_helper.rb [name already matches]
    load-schema-helper.ts   <- test/support/load_schema_helper.rb
    adapter-helper.ts       <- test/support/adapter_helper.rb
    async-helper.ts         <- test/support/async_helper.rb
    ddl-helper.ts           <- test/support/ddl_helper.rb
    fake-adapter.ts         <- test/support/fake_adapter.rb
  test-setup-worker-db.ts   (no Rails counterpart — Rails is single-process)
  test-helpers/
    models/ fixtures/ test-schema.ts   (already mirror Rails; unchanged)
```

### Every current `test-helpers/` entry has a destination

`test-helpers/` is today a mashup of two different Rails trees: some of it
mirrors `test/support/*.rb`, and some of it mirrors the **`test/` root**
(`vendor/rails/activerecord/test/` contains `assets/`, `cases/`, `fixtures/`,
`migrations/`, `models/`, `schema/`, `support/`). The directory is **not**
deleted and **not** moved wholesale — it is partially drained. Disposition of
all 36 files and 4 subdirectories:

**A. Mirrors the Rails `test/` root — stays put, keeps its name** (already
faithful; `schema:compare` / `fixtures:compare` key off these paths):
`models/`, `fixtures/`, `migrations/`, `assets/`, `test-schema.ts`
(← `test/schema/schema.rb`).

**B. Moves to `support/` with a Rails name** (story 1 relocates; stories 3-5
rename): `connection-helper.ts` and `schema-dumping-helper.ts` (names already
correct), `test-connection-env.ts` + `test-database-config.ts` +
`arunit2-config.ts` → `config.ts`, `supports.ts` → `adapter-helper.ts`,
`canonical-schema.ts` + `schema-file-generator.ts` → `load-schema-helper.ts`,
`second-connection.ts` + `setup-second-pool.ts` + `setup-handler-suite.ts`
→ `connection.ts`.

**C. Moves to `support/`, keeps its invented name** — vitest-fork-model or
trails-harness infrastructure with no Rails counterpart, but still test support:
`ar-db-slots.ts`, `ar-db-forks-default.ts`, `sqlite-template.ts`,
`template-global-setup.ts`, `skip-global-reset.ts`, `ddl-profile.ts`,
`canonical-model-index.ts`, `canonical-model-index-encryption-setup.ts`,
`quote-regex.ts`, `with-db-warnings-action.ts`, `setup-adapter-suite.ts`,
`drop-all-tables.ts`, `seed-association-cache.ts`, `schema-types.ts`.
Each keeps its name because there is nothing to be faithful to — but it belongs
in the support tree, not a differently-named one.

**D. Destination unresolved — `disposition-remaining-test-helpers` decides**
(story 7). These are suspected of being _library_ code misfiled into test
infra, or of mapping somewhere other than `support/`, and each needs its Rails
counterpart confirmed before it moves:
`fixtures.ts`, `fixture-set.ts`, `define-fixtures.ts`, `fixtures-registry.ts`,
`use-fixtures.ts`, `with-transactional-fixtures.ts`, `use-transactional-tests.ts`
(Rails' equivalents are `lib/active_record/fixtures.rb`,
`lib/active_record/fixture_set/`, `lib/active_record/test_fixtures.rb` — **lib**,
not test support, and trails already has a top-level `src/test-fixtures.ts`);
`in-time-zone.ts` (Rails' `InTimeZone` is a module _inside_ `cases/helper.rb:66-79`,
so it may belong in `cases/helper.ts`); `protected-params.ts`;
`repair-validations.ts`; `rocket-tables.ts` (its own docstring notes that
`ActiveRecord::Migration::ForeignKeyTest` creates and drops `rockets` /
`astronauts` **inline**, `foreign_key_test.rb:178-194` — so the faithful home is
the test file that uses it, not a shared support helper; confirm before moving).

**Staleness warning.** This table was taken against this branch's base commit,
and `main` moves. `rocket-tables.ts` landed on `main` after the branch was cut
and is absent from the branch checkout — it appears above only via a
`git show origin/main` read. **Whichever story executes first must re-scan
`test-helpers/` against current `main`** and bucket anything new rather than
trusting this list verbatim; story 1's acceptance criteria carry that
instruction.

Story 1 moves only B and C; A stays; D waits for story 7.

## What does NOT move

- **`test-setup-worker-db.ts` and the template `globalSetup`.** Per-worker DB
  isolation via advisory locks exists because vitest forks; Rails' suite is one
  process against one database. No Rails name to adopt.
- **`test-helpers/models/`, `fixtures/`, `test-schema.ts`.** Already faithful to
  `test/models/`, `test/fixtures/`, `test/schema/schema.rb`, and already the
  keys `schema:compare` / `fixtures:compare` read. Moving them buys nothing and
  risks the compare manifests.
- **Test files themselves.** Rails puts tests in `test/cases/*_test.rb`; trails
  puts `*.test.ts` next to source by repo convention (CLAUDE.md). That is a
  settled, separate divergence — this plan does not reopen it, which is why
  `cases/` here holds only `helper.ts`.

## Follow-up stories

Filed under RFC 0064. Ordering matters, and per CLAUDE.md these ship one at a
time from `main` — no stacking. The directory rename goes first so later stories
edit files at their final paths.

1. `move-test-helpers-to-support-dir` — create `support/` and move **only
   buckets B and C** into it. `test-helpers/` survives, holding bucket A
   (`models/`, `fixtures/`, `migrations/`, `assets/`, `test-schema.ts`) and
   bucket D until story 7. This is explicitly **not** a whole-directory
   `git mv`. Includes the lint globs, ratchet JSON paths, and
   `vitest.config.ts` references for the moved files.
2. `rename-test-setup-ar-to-cases-helper` — `test-setup-ar.ts` → `cases/helper.ts`.
3. `support-config-and-connection` — `test-connection-env.ts`,
   `test-database-config.ts`, `arunit2-config.ts` → `support/config.ts`;
   the connection bootstrap in `test-setup-dy.ts` → `support/connection.ts`.
4. `support-adapter-helper` — `currentAdapter` / `inMemoryDb` and the
   `supports.ts` predicates → `support/adapter-helper.ts`, matching
   `adapter_helper.rb`'s method set.
5. `support-load-schema-helper` — `canonical-schema.ts` /
   `schema-file-generator.ts` → `support/load-schema-helper.ts`.
6. `port-missing-support-helpers` — `ddl_helper.rb` (`with_example_table`),
   `async_helper.rb` (`assert_async_equal`), `fake_adapter.rb`
   (`FakeActiveRecordAdapter`, which `helper.rb:46` registers). These have no
   trails file at all today.
7. `disposition-remaining-test-helpers` — resolve bucket D above: confirm each
   file's Rails counterpart and move it (or establish that it is library code
   that belongs outside the test tree entirely).

## Observations out of scope for this spike

The mapping also surfaced four `helper.rb` settings that trails has a flag for
but never applies suite-wide. Those are _fidelity_ gaps, not layout gaps, so
they were filed separately under **RFC 0071
ar-test-helper-suite-wide-config-fidelity**. As of 2026-07-26 they are already
resolved or superseded:

- `helper.rb:104-107` `extend_queries = true` + the two `install_support` calls
  (`encryption/config.ts:22` defaulted `false`; `trailtie.ts` had no
  `extendQueries` handling, so the production `railtie.rb:351` arm was unported
  too) — **done**, `encryption-extend-queries-suite-wide`.
- `helper.rb:43` `belongs_to_required_validates_foreign_key = false`
  (`ar-config.ts:213` / `trailtie.ts:139` defaulted `true`) — **done**,
  `belongs-to-required-validates-fk-false`.
- `helper.rb:14-16` PG `create_unlogged_tables = true`
  (`postgresql-adapter.ts:321` defaults `false`) — closed,
  `pg-create-unlogged-tables-in-suite`.
- `helper.rb:27` `permanent_connection_checkout = :disallowed` — owned by
  **RFC 0073 permanent-connection-checkout-disallowed**, which has 11 stories
  and a completed measurement. Note that RFC's finding before touching this:
  the `Base.connection` textual grep this audit originally cited (114 files) is
  the wrong instrument — instrumenting the gate found 2077 hits, 1983 of them
  (95.5%) from a single line, `use-fixtures.ts:610`, that the grep does not
  match. The duplicate RFC 0071 story was closed as superseded.
