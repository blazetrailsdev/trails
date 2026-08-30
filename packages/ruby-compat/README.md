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

## The contract

Four rules govern this package. They are not review preferences; three of the
four are mechanically enforced, and the fourth is structural.

### 1. Only what trails actually calls

No member exists here without a real call site elsewhere in this repo. This is
not a general-purpose Ruby runtime, and it is not a place to port a method
because its siblings are already here — `String#succ` earns its keep because
`arel` calls it; `String#squeeze` does not, until something calls it.

This is enforced by `pnpm parity:api:extra`, not by review. Every public name in
this package is extra surface by construction (see rule 2), so the extra-surface
report lists the entire package; the question a reviewer asks of a new row is
"where is the call site", and the answer must be a file and a line.

The counter behind that report is a gate. `ruby-compat` is in `GATED_PACKAGES`
(`scripts/api-compare/extra-surface-mark.ts`) with its mark committed in
`extra-surface-mark.json`, and `pnpm parity:api:extra:gate` fails on **any**
increase in either dimension. So a speculative member — an MRI method ported
because its siblings are here, or "we'll need it soon" — does not reach review
as a judgement call: it raises `novel`, and CI turns red. The mark is only-shrink
(`parity:api:extra:tighten` writes it DOWN) and **there is no reseed**.

The way past the gate is therefore never a bigger mark in a PR that is about
something else. A later need is a **later story filed against RFC 0129**, naming
the call site that motivates it, and the mark moves in that story's reviewed
diff — never as a drive-by addition to a move PR.

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
