# AR test-setup layout vs Rails `test/cases/helper.rb` (spike audit)

RFC 0064 (ar-test-infra-layout-fidelity), story
`spike-align-test-setup-with-cases-helper`. Question raised while reviewing
PR #4791: now that `packages/activerecord/src/test-setup-ar.ts` mirrors four
distinct `helper.rb` lines, should the AR test-setup files be reorganized under
a Rails-style `cases/` tree (e.g. `cases/helper.ts`), or does the
`test-setup-*` convention stay?

**Recommendation: keep as-is (option b).** Rationale below; this document
exists so the question is not re-litigated.

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

## Trade-offs

**Vitest `setupFiles` vs Rails `require`.** The `test-setup-*` files are not
libraries — they are _ordered side-effect entry points_ declared in
`vitest.config.ts:363-371`, and the order is load-bearing
(`test-setup-worker-db` claims the slot → `test-setup-ar` registers the driver
and flips config → `test-setup-dy` opens the connection and lays the schema).
Rails' `helper.rb` is `require`d by each test file, so it is a library and one
file is the natural shape. A `cases/helper.ts` name would suggest importable
setup that our files explicitly are not; `test-setup-*` names the mechanism
that actually runs them.

**Consolidation is not available.** The one-file-per-`helper.rb` shape only
works if the five files can merge, and they cannot: `globalSetup` runs in the
main process before forks, the other four run per-worker at three different
points in the boot order, and two are conditionally wired
(`test-setup-mysql.ts` on the MySQL lane, `test-setup-ddl-profile.ts` on
`DDL_PROFILE=1`). A `cases/helper.ts` would therefore be a rename of one of
five files, not a consolidation.

**Partial-mirror over-claim.** Per the table, `test-setup-ar.ts` owns 4 of the
13 `helper.rb` responsibilities that have a trails home. Naming it
`cases/helper.ts` invites a future agent to assume the other nine are there and
to stop checking — the exact failure mode the per-line
`// Mirror Rails activerecord/test/cases/helper.rb:NN` comments prevent. Those
comments already deliver the discoverability the rename is after, at the granularity where it matters (per setting, not per file), and
`pnpm rails:find` covers the reverse lookup.

**`test:compare` / `api:compare` gain nothing.** Both map _test cases_ and
_source_, not setup infra: `scripts/test-compare/` and `scripts/api-compare/`
have zero references to `test-setup*` or `helper.rb` outside one fixture
string in `extra-surface.test.ts:743`. `schema-compare` and `fixtures-compare`
key off `test-helpers/test-schema.ts`, `test-helpers/fixtures/`, and
`test-helpers/models/` — all unaffected by a setup-file rename. No parity
metric moves.

**Rename cost.** 93 `test-setup` references outside `vendor/` — 52 in
code/config, 41 in docs. The load-bearing ones:

- `vitest.config.ts` — 9 (5 setupFile paths + the arel one + prose).
- `eslint/no-raw-sql.mjs:42` — a hardcoded filename regex,
  `/(^|\/)test-setup-[^/]*\.ts$/`, exempting setup files from the raw-SQL ban.
- `eslint.config.mjs:484` — the `packages/activerecord/src/test-setup-*.ts` glob
  for the same exemption at config level.
- `eslint/no-explicit-any-src-exclude.json:194` and
  `eslint/rails-error-parity-exclude.json:115-116` — per-file ratchet entries
  keyed by path.
- `docs/infrastructure/browser-compat-plan.md:158` — the `**/test-*.ts`
  allow-list pattern planned for the `no-direct-process-env` rule.

The `test-setup-` **prefix** is what lets four separate lint mechanisms name
this set with one pattern each. A `cases/` tree replaces each with either a
second pattern or a directory-wide exemption wider than intended — and the
ratchet JSONs would need path rewrites that conflict with any sibling PR
touching them.

**Sibling consistency.** `packages/arel/src/test-setup-engine.ts`
(`vitest.config.ts:420`) follows the same convention for the non-AR `other`
project. Moving only AR's files under `cases/` splits a repo-wide convention
for one package. (Aside: `test-setup-ar.ts:3-4`'s header refers to "the sibling
`test-setup.ts`", which no longer exists — a stale comment, not a file.)

**Rails' own view.** `helper.rb:18` reads
`# TODO: Move all these random hacks into the ARTest namespace and into the support/ dir` —
Rails considers the single-file grab-bag a wart, not a layout to copy. Our
`test-helpers/` tree is already the `test/support/` analogue that TODO asks for.

## Decision

Keep the `test-setup-*` convention. Fidelity to Rails here lives in the
_settings applied and their values_, which the per-line mirror comments already
pin to `helper.rb:NN`, not in the filename. Do not re-open this without a new
argument that survives the five points above (nothing to consolidate,
over-claim risk, zero compare-tooling gain, four lint mechanisms keyed on the
`test-setup-` prefix, cross-package convention). What _would_ change the answer:
if vitest gained a single ordered-setup entry point so the five files could
genuinely merge into one, the one-file `helper.rb` shape becomes available and
the naming question is worth re-asking.

## Observations out of scope for this spike

Recorded here because the mapping surfaced them; they are _fidelity_ gaps, not
layout gaps, so they are out of RFC 0064's scope (whose non-goal is "no behavior
change to the test harness"). They are filed under **RFC 0071
ar-test-helper-suite-wide-config-fidelity** — four stories, currently draft
pending RFC acceptance:

- `helper.rb:27` `permanent_connection_checkout = :disallowed` — the flag
  exists (`ar-config.ts:126`) but the suite does not set it, so trails does not
  ban `Base.connection` in tests the way Rails does. 114 test files reference
  `Base.connection`, so this is scoped as an audit first, not a flip →
  `audit-permanent-connection-checkout-disallowed`.
- `helper.rb:104-107` `extend_queries = true` + the two `install_support`
  calls — `encryption/config.ts:22` defaults `extendQueries` to `false` and
  install is per-test, so deterministic-encryption query extension is not
  suite-wide as in Rails. `trailtie.ts` has no `extendQueries` handling at all,
  so the production-side `railtie.rb:351` arm is unported too →
  `encryption-extend-queries-suite-wide`.
- `helper.rb:43` `belongs_to_required_validates_foreign_key = false` —
  `ar-config.ts:213` / `trailtie.ts:139` default `true` →
  `belongs-to-required-validates-fk-false`.
- `helper.rb:14-16` PG `create_unlogged_tables = true` —
  `postgresql-adapter.ts:321` defaults `false`, so the PG lane pays full WAL
  cost on every table build → `pg-create-unlogged-tables-in-suite`.
