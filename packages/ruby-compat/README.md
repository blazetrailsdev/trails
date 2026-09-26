# @blazetrails/ruby-compat

Ruby core and stdlib primitives that trails calls but Rails does not define.

Rails is written against Ruby. A port of Rails therefore needs pieces of Ruby
itself — `Object#blank?`'s notion of whitespace, `String#succ`'s carry,
`Hash#fetch`'s stored-`nil` semantics, `Rational` canonicalization — and those
pieces have no Rails counterpart to mirror. Historically they accumulated inside
`@blazetrails/activesupport`, which inverted the real dependency: ActiveSupport
is a Rails gem that _uses_ Ruby, not the place Ruby lives. This package is where
they belong instead.

Its upstream is [ruby/ruby](https://github.com/ruby/ruby), vendored at
`vendor/ruby/` (RFC 0129). Read the C or the Ruby there before writing anything
here, the same way every other package reads `vendor/rails/` first.

## What is here

Every export, with the call site that justifies it (rule 1).

| export                  | MRI anchor                                       | call sites                                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `regexpEscape`          | `re.c:4144` `rb_reg_s_quote`                     | `activerecord/src/support/quote-regex.ts`, `run-token.ts`, `trailties/src/generators/trails-actions.ts`                                                                                                                                                                                    |
| `Range`                 | `range.c:31` `rb_cRange`                         | `activesupport/src/core-ext/range/*.ts`, `activemodel/src/validations/{clusivity,length,numericality}.ts`                                                                                                                                                                                  |
| `rbEqual`               | `object.c:147` `rb_equal`                        | `ruby-compat/src/range.ts` (`Range#==`)                                                                                                                                                                                                                                                    |
| `succ`                  | `string.c:4868` `rb_str_succ`                    | `ruby-compat/src/range.ts` (string ranges), `arel`                                                                                                                                                                                                                                         |
| `Rational`              | `rational.c:481` `nurat_s_canonicalize_internal` | `activemodel/src/type/{decimal,date-time}.ts`, `type/helpers/time-value.ts`, `activesupport/src/{time-with-zone.ts,core-ext/date-time/calculations.ts,message-pack/extensions.ts}`, `activerecord/src/connection-adapters/{mysql/quoting.ts,abstract/sql-datetime.ts}`, `date/src/date.ts` |
| `rational`              | `rational.c:2691` `nurat_s_convert`              | `activesupport/src/core-ext/date-time/calculations.ts:274,290,306` (`end_of_day` / `end_of_hour` / `end_of_minute`), `message-pack/extensions.ts` (`read_rational`)                                                                                                                        |
| `ZeroDivisionError`     | `numeric.c:206` `rb_num_zerodiv`                 | `activesupport/src/message-pack/extensions.ts` (`readRational` raises it on a zero denominator)                                                                                                                                                                                            |
| `Enumerator`            | `enumerator.c:411` `enumerator_init`             | `activesupport/src/hash-with-indifferent-access.ts` (`select` / `reject` block-less arm)                                                                                                                                                                                                   |
| `toEnum`                | `enumerator.c:383` `obj_to_enum`                 | `activesupport/src/hash-with-indifferent-access.ts` (`to_enum(:select)`, `to_enum(:reject)`)                                                                                                                                                                                               |
| `isSymbol`              | `symbol.c:954` `rb_sym2str`                      | `i18n/src/backend/{base,fallbacks,simple,key-value}.ts`, `activemodel/src/validations/numericality.ts`                                                                                                                                                                                     |
| `symbolToS`             | `symbol.c:954` `rb_sym2str`                      | `i18n/src/backend/base.ts:242,444`                                                                                                                                                                                                                                                         |
| `Location`              | `vm_backtrace.c:1345` `rb_cBacktraceLocation`    | `actionpack/src/action-dispatch/middleware/exception-wrapper.ts` (`build_backtrace`'s `loc.label`, `SourceMapLocation#spot`)                                                                                                                                                               |
| `excBacktraceLocations` | `error.c:1789` `exc_backtrace_locations`         | `actionview/src/template/error.ts` (`Template::Error#backtrace_locations`), `exception-wrapper.ts` (`build_backtrace`)                                                                                                                                                                     |

## The contract

Four rules govern this package. Rules 2 and 3 are mechanically enforced, rule 4
is structural, and rule 1 is enforced by review until its gate lands (see
below).

### 1. Only what trails actually calls

No member exists here without a real call site elsewhere in this repo. This is
not a general-purpose Ruby runtime, and it is not a place to port a method
because its siblings are already here — `String#succ` earns its keep because
`arel` calls it; `String#squeeze` does not, until something calls it.

Today this rule is enforced by review, not by a gate: the question a reviewer
asks of a new export is "where is the call site", the answer must be a file and
a line, and it goes in the table above. Mechanical enforcement is
`ruby-compat-rule-1-call-site-gate`.

The extra-surface counter does NOT enforce it, although earlier revisions of
this README said it did. `ruby-compat` is in `GATED_PACKAGES`
(`scripts/api-compare/extra-surface-mark.ts`) with its mark committed in
`extra-surface-mark.json`, and `pnpm parity:api:extra:gate` fails on any
increase in either dimension. But the counter subtracts every member carrying a
`@noRailsEquivalent` receipt, and rule 2 requires that receipt on every export,
so a correctly receipted member — speculative or not — never reaches it.

### Growing the package: the receipt is the protocol

For a Rails package extra surface is debt and only-shrink is the whole point.
Here it is inventory: every move story adds MRI surface. The two do not
conflict, because growth here is **mark-neutral**:

- A member that arrives with its rule 2 receipt is subtracted from `novel` AND
  `total`, whether its name is novel or collides with a Rails method in some
  other `.rb` and would score moved. Adding it moves neither number.
- A member that arrives WITHOUT its receipt raises `total` (and, if novel,
  trips the `novel === 0` pin), and the gate turns red. The fix is the
  receipt, never a bigger mark.

So there is no raise path, and none is needed: the mark stays only-shrink
(`parity:api:extra:tighten` writes it DOWN) with **no reseed**, exactly as for
every other gated package. The `total` it holds today is the residue of members
that never got their receipt, a rule 2 violation burnt down by
`receipt-ruby-compat-moved-residue`.

### 2. Every export carries BOTH a `vendor/ruby` citation and a receipt

Each exported member needs two things in its JSDoc:

- a `vendor/ruby/<file>:<line>` citation naming the MRI source it mirrors, and
- a `@noRailsEquivalent PERMANENT` receipt.

Both, always. They answer different questions and neither substitutes for the
other:

- The **citation** is the fidelity anchor. It says _this behavior is Ruby's, and
  here is where to check it_. Without it a Ruby primitive degrades into a
  hand-rolled utility, and the next contributor has no way to tell a faithful
  `succ` from an approximation of one. It is the `vendor/rails` citation every
  other package writes, pointed at the other upstream.
- The **receipt** is the parity bookkeeping. `@noRailsEquivalent` is what marks
  a public name that has no Ruby-_Rails_ counterpart, and every name here is one
  — that is the definition of this package. `PERMANENT` is the correct
  permanence: these members will never converge onto a Rails method, because
  there is no Rails method to converge onto. A `CONVERGEABLE <story-id>` receipt
  here is a category error, not a smaller version of the same claim.

So a citation without a receipt fails the extra-surface tooling, and a receipt
without a citation passes the tooling while losing the only record of what the
code is supposed to do. Write both.

Both are enforced by `blazetrails/ruby-compat-needs-mri-citation`
(`eslint/ruby-compat-needs-mri-citation.mjs`), which RESOLVES the citation
rather than pattern-matching it: the file has to exist under `vendor/ruby/` at
the pinned SHA and the line has to be within it. The vendor tree is fetched
rather than committed, so the rule skips where it is absent — the
`rails-comparison` CI job, which fetches it, is the enforcing run. The reverse
direction is covered too: this package is in the RFC 0121
`unbacked-internal-needs-receipt` enrollment set, because every member here is
absent from the rails-private manifest by construction.

And a primitive lives here ONCE.
`blazetrails/no-ruby-compat-reimplementation` fails a function or class declared
outside this package whose name is a ruby-compat export, or a registered alias
of one (`escapeRegExp` for `Regexp.escape`, a local `fetch(hash, key, default)`
over a `Record` for `Hash#fetch`, ...). Today's copies each hold one row in
`eslint/no-ruby-compat-reimplementation-exclude.json`, which is only-shrink: a
row is deleted by the move story that converges it, and a new row is never the
remedy for new code.

That is enforced, not merely conventional.
`eslint/no-ruby-compat-reimplementation-mark.mjs` gates the register against the
committed high-water mark in
`eslint/no-ruby-compat-reimplementation-mark.json` — the way
`extra-surface-mark.json` gates extra surface — and fails when the array holds
more rows than the mark, or is not sorted (an appended row reads correctly to
the rule, so nothing else says where it belongs). Its `tighten` path writes the
mark DOWN as the move stories delete rows; there is no reseed.

### 3. `parity:api` never enrolls this package — permanently

`parity:api`'s package list is derived from `vendor/sources.ts` via
`apiComparePackages()` (`scripts/api-compare/config.ts`), and its population is
Rails gems. `ruby-compat` has no gem counterpart there and never will: it is a
port of Ruby, and Rails-parity comparison over it is meaningless — there is
nothing on the other side to compare against.

This is not a deferral awaiting a story, and it is not a `SKIP_GROUPS` entry
with a burndown behind it. Do not add `ruby-compat` to `vendor/sources.ts`, to
`PACKAGES`, or to `PACKAGES_OUTSIDE_MANIFEST` — the last of those subtracts a
package from the `unbacked-internal-needs-receipt` rule, and this package wants
that rule at full strength (rule 2 requires the receipt unconditionally).

What it IS in is `TS_ONLY_PACKAGES` (same file) — the packages the TypeScript
extractor walks and the Rails comparison never scores. That is the whole of the
enrollment rule 1 relies on: the TS manifest has to carry the package for the
extra-surface counter to see it, while the Rails-parity population stays a list
of gems.

### 4. It is a leaf: no workspace dependencies

`ruby-compat` depends on nothing in this workspace, and everything may depend on
it. In particular it must never depend on `@blazetrails/activesupport` — that
edge is the exact inversion the package exists to remove, and re-adding it would
put the cycle back.

`package.json` has no `dependencies` block. Keep it that way; if a primitive
here appears to need a trails module, the primitive is not a Ruby primitive.
