# DidYouMean port plan

Port Ruby's `DidYouMean::SpellChecker` (with `Jaro`, `JaroWinkler`, and
`Levenshtein`) into trails so that the half-dozen Rails call sites that
currently stub a custom Levenshtein helper — or skip the feature entirely —
can share one faithful implementation.

Reference Ruby source (stdlib 3.3):

- `did_you_mean/spell_checker.rb`
- `did_you_mean/jaro_winkler.rb`
- `did_you_mean/levenshtein.rb`

Mirrored upstream: <https://github.com/ruby/did_you_mean>.

### Licensing / attribution

`did_you_mean` is MIT-licensed; `levenshtein.rb` further attributes the
algorithm to the Text gem ("Copyright (c) 2006-2013 Paul Battley, Michael
Neumann, Tim Fletcher"). Trails' `packages/*/src` is MIT (see
`LICENSES.md`), so the licenses are compatible. PR 1 must:

- Add a top-of-file attribution comment in `levenshtein.ts` and
  `jaro-winkler.ts` naming `ruby/did_you_mean` (and Text-gem authors for
  Levenshtein) as the upstream source.
- Add a new `packages/did-you-mean/NOTICE` file with the upstream MIT
  license text and the Text-gem copyright line. (`LICENSES.md` today
  has no third-party-notices section — don't try to "extend" one that
  doesn't exist; either create a NOTICE per-package, or add a new
  "Third-party code" section to `LICENSES.md` if that's the route the
  reviewer prefers. Default to the per-package NOTICE so future
  vendored ports follow the same pattern.)

## Package home

Land it as a **top-level package, `@blazetrails/did-you-mean`**, mirroring
how `@blazetrails/globalid` is structured. Rationale:

- DidYouMean is Ruby stdlib, not part of any Rails package — Rails just
  consumes it. Modelling it as its own workspace package matches the
  upstream boundary (separate gem / stdlib library), the same reasoning
  that put globalid in its own package rather than folding it into
  activerecord or activesupport.
- All current call sites live in different packages (actionpack,
  activerecord, actionview, railties). A standalone package with zero
  trails deps is the cleanest thing for all of them to depend on; no
  cross-package coupling sneaks in via activesupport.
- It is not part of the Rails `api:compare` surface — `extract-ruby-api.rb`
  doesn't scan `did_you_mean/*`. The file layout is ours to design; no
  Rails-mirror obligation. We just need to keep the public type signature
  close to Ruby's so caller ports are mechanical.

Files:

- `packages/did-you-mean/package.json` (`"name": "@blazetrails/did-you-mean"`,
  no trails workspace deps, modelled on `packages/globalid/package.json`)
- `packages/did-you-mean/src/levenshtein.ts`
- `packages/did-you-mean/src/jaro-winkler.ts`
- `packages/did-you-mean/src/spell-checker.ts`
- `packages/did-you-mean/src/index.ts` (re-exports)
- `packages/did-you-mean/tsconfig.json` (modelled on globalid's, but with
  the `references: [{ path: "../activesupport" }]` entry removed — this
  package has no workspace deps)
- co-located `*.test.ts` files

The barrel exports `SpellChecker`, `jaroDistance`, `jaroWinklerDistance`,
and `levenshteinDistance`. Consumer packages add
`"@blazetrails/did-you-mean": "workspace:*"` to their `dependencies`.

## Survey of Rails usage

From `grep -rn DidYouMean vendor/rails`:

| Call site (vendor/rails path)                                                                                                                                                                           | What it suggests          | trails status today                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actionpack/lib/abstract_controller/base.rb` — `ActionNotFound#corrections`                                                                                                                             | controller action names   | `packages/actionpack/src/abstract-controller/base.ts:26` — `ActionNotFound` has no `corrections`                                                                      |
| `actionpack/lib/action_controller/metal/exceptions.rb` — `UrlGenerationError#corrections`                                                                                                               | route name dictionary     | `packages/actionpack/src/action-controller/metal/exceptions.ts:59` ships a substring-match suggestion (not SpellChecker) — should be replaced with `SpellChecker`     |
| `actionpack/lib/action_controller/metal/strong_parameters.rb` — `ParameterMissing#corrections`                                                                                                          | permitted-keys dictionary | `strong-parameters.ts:23-31` ships an inline Levenshtein ≤2 helper on `ParameterMissing` — should be replaced by `SpellChecker`                                       |
| `activerecord/lib/active_record/associations/errors.rb` — `AssociationNotFoundError#corrections`, `InverseOfAssociationNotFoundError#corrections`, `HasManyThroughAssociationNotFoundError#corrections` | reflection names          | `packages/activerecord/src/associations.ts` + `reflection.ts` use an ad-hoc `levenshtein()` with `≤3` threshold (only covers two of the three error types faithfully) |
| `actionview/lib/action_view/template/error.rb` — `Template::Error#corrections` (uses raw `DidYouMean::Jaro.distance`)                                                                                   | template virtual paths    | not yet ported — needs `Jaro.distance` exported, not just `SpellChecker`                                                                                              |
| `railties/lib/rails/command.rb` — command suggestion                                                                                                                                                    | registered command names  | `@blazetrails/trailties` exists but command-suggestion behaviour not yet ported                                                                                       |
| `railties/lib/rails/test_unit/runner.rb` — `InvalidTestError`                                                                                                                                           | test paths                | `@blazetrails/trailties` exists but test-runner not yet ported                                                                                                        |
| `guides/rails_guides/generator.rb`                                                                                                                                                                      | guide anchors             | n/a (not a Rails runtime concern)                                                                                                                                     |

So the consumers we actually need to wire up after the port lands:

1. **AbstractController::ActionNotFound#corrections** (the motivating case)
2. **ParameterMissing#corrections** (replaces existing inline Levenshtein)
3. **AssociationNotFoundError / InverseOfAssociationNotFoundError / HasManyThroughAssociationNotFoundError `#corrections`** (replaces existing `levenshtein()` ad-hoc helpers in `associations.ts` and `reflection.ts`)
4. **Template::Error#corrections** (needs `jaroDistance` exported)
5. **UrlGenerationError#corrections** (replaces the existing substring-match suggestion in `exceptions.ts:59` with a `SpellChecker` call against `namedRoutes.helperNames`)

Each becomes its own follow-up PR after the port.

## Algorithm spec

Transcribed from the Ruby sources cited above. Implement exactly — no
"clean-up" liberties; the thresholds and the tie-breaking order are
observable behaviour that downstream tests will pin.

### `SpellChecker#correct(input)`

1. `normalize(s)` = `s.toString().toLowerCase().replaceAll("@", "")`.
2. `normalizedInput = normalize(input)`.
3. `threshold = normalizedInput.length > 3 ? 0.834 : 0.77`.
4. `words` = dictionary entries whose `jaroWinklerDistance(normalize(word), normalizedInput) >= threshold`.
5. Reject entries equal to the raw input (`String(input) === String(word)`).
6. Sort `words` by `jaroWinklerDistance(String(word), normalizedInput)` **descending**. Ruby does `sort_by` ascending then `reverse!`; that ordering is stable in Ruby, and we have to mimic it. `Array.prototype.sort` is stable per ECMAScript 2019 (Node ≥12), so a descending comparator that returns 0 for ties is sufficient in practice — but to make the determinism explicit and engine-independent in the test record, decorate-sort-undecorate: map each word to `{word, index, score}`, sort by `score` descending with `index` ascending as an explicit tiebreaker, then unmap. That makes the dictionary-order guarantee load-bearing in the code, not in a footnote about V8 internals.
7. `mistypeThreshold = Math.ceil(normalizedInput.length * 0.25)`.
8. `corrections` = `words` where `levenshteinDistance(normalize(word), normalizedInput) <= mistypeThreshold`.
9. If `corrections` is empty, reassign it to the misspell fallback:
   `corrections = words.filter(word => { const w = normalize(word); const len = Math.min(normalizedInput.length, w.length); return levenshteinDistance(w, normalizedInput) < len; }).slice(0, 1);`.
10. Return `corrections`.

Notes:

- Step 4 compares the **normalized** word to the normalized input.
- Step 6 sorts by `jaroWinklerDistance(originalWord, normalizedInput)` —
  the un-normalized word against the normalized input. That asymmetry is in
  Ruby and matters for case-sensitive ranking; preserve it.
- Step 5 compares raw input to raw word (string equality on the original
  values, not normalized) — `"FOO"` against `["foo"]` still returns `["foo"]`.

### `Jaro.distance(str1, str2)`

- Swap so `str1` is the shorter (or equal-length) string.
- Match window `range = floor(length2 / 2) - 1`, clamped at 0.
- Walk codepoints (use `Array.from(str)` or a spread — `str.length` in JS
  counts UTF-16 code units; codepoints matter for emoji / supplementary
  planes). For each position in `str1`, look in `[i-range, i+range]` of
  `str2` for the first unflagged match and set the matching bits in
  `flags1`/`flags2`. (Ruby uses bigints as bitfields; in TS use `bigint` or
  `Uint8Array` indexed by `j`.)
- `m` = matches; `t` = transpositions / 2.
- Return `m === 0 ? 0 : (m/length1 + m/length2 + (m - t)/m) / 3`.

### `JaroWinkler.distance(str1, str2)`

- `j = Jaro.distance(str1, str2)`.
- If `j > 0.7`, let `prefixLength` = the number of leading codepoints
  `str1` and `str2` share, capped at 4. Return
  `j + prefixLength * 0.1 * (1 - j)`. Otherwise return `j`.

### `Levenshtein.distance(str1, str2)`

- Standard two-row DP from the Text gem, transcribed verbatim. Iterate over
  codepoints, not UTF-16 units, so non-BMP characters cost 1 edit (matches
  Ruby `String#codepoints`).

## TypeScript API design

```ts
// did-you-mean/spell-checker.ts
export interface SpellCheckerOptions {
  dictionary: ReadonlyArray<string>;
}

export class SpellChecker {
  constructor(options: SpellCheckerOptions);
  correct(input: string): string[];
}

// did-you-mean/jaro-winkler.ts
export function jaroDistance(a: string, b: string): number;
export function jaroWinklerDistance(a: string, b: string): number;

// did-you-mean/levenshtein.ts
export function levenshteinDistance(a: string, b: string): number;
```

Caller shape mirrors Ruby:

```ts
// Ruby: DidYouMean::SpellChecker.new(dictionary: maybe_these).correct(name)
new SpellChecker({ dictionary: maybeThese }).correct(name);
```

`dictionary` is positional-in-Ruby-as-kwarg; using an options object keeps
the named-argument feel and leaves room for any future `separator:` /
`augment:` options Ruby may add.

We do **not** port `DidYouMean::Correctable` (the Ruby mixin that adds
`#corrections` and `#original_message`). In JS, error subclasses just add a
`corrections` getter directly — no mixin needed. See "AbstractController
follow-up wiring" below.

## Edge cases (must be in tests)

- Empty dictionary → `[]`.
- Dictionary contains only the exact input → `[]` (rejected by step 5).
- `input` length ≤ 3 uses the looser 0.77 threshold (e.g. `correct("fo")`
  against `["foo"]` returns `["foo"]`).
- `input` length > 3 uses the stricter 0.834 threshold.
- Case insensitivity via `normalize`: `correct("FOO")` against `["foo"]` →
  `["foo"]`; original casing of dictionary entries is preserved in output.
- `@`-stripping: `correct("@foo")` against `["foo"]` → `["foo"]` (used by
  Rails for instance-variable suggestions; harmless for our call sites).
- "No Jaro candidates" path: nothing meets the JW threshold → return `[]`
  without falling through to the misspell fallback (the fallback only fires
  when JW found candidates but Levenshtein filtered them all out).
- Non-ASCII: `correct("café")` should treat the `é` as one codepoint, not
  two UTF-16 units, so distance is 0 against `["café"]`. Pin one test with
  a supplementary-plane character (e.g. `"𝐀"`) to lock in codepoint
  iteration.
- Stable tie-breaking: two dictionary entries with identical JW distance
  must come back in dictionary order.
- Numeric/symbol-ish input via `.toString()`: Ruby accepts symbols; we
  accept anything, but we type the public surface as `string` — callers
  coerce.

## PR split

Estimated LOC (source + tests, plus standalone-package scaffolding):

| File                                                      | Source | Tests |
| --------------------------------------------------------- | -----: | ----: |
| `package.json` + `tsconfig.json` (mirrored from globalid) |     25 |     — |
| `src/index.ts` barrel                                     |     10 |     — |
| `src/levenshtein.ts`                                      |     35 |    50 |
| `src/jaro-winkler.ts`                                     |     70 |    80 |
| `src/spell-checker.ts`                                    |     45 |   120 |
| **Total**                                                 |    185 |   250 |

≈435 LOC total. The standalone-package framing shifts the split shape:
the scaffolding (package.json, tsconfig, root README stub, pnpm-workspace
recognition) wants to land together with at least one working module so
the package isn't a hollow build target, and the Wave-1 PR has to add the
package to any aggregate scripts that enumerate workspaces. Concretely:
add `{ "path": "packages/did-you-mean" }` to the root `tsconfig.json`
`references` array — without it, `tsc --build` won't pick the package up.
Also double-check `pnpm-workspace.yaml` already globs `packages/*` (it
does today, so no change needed there). Still three
PRs, but the first now bundles the package scaffolding with the
pure-math modules instead of landing it standalone:

- **PR 1 (~290 LOC):** scaffold `packages/did-you-mean/` (package.json,
  tsconfig, dx-tests dir matching globalid's layout) + `levenshtein.ts` +
  `jaro-winkler.ts` + their tests + `src/index.ts` exporting just those
  two. Pure math, no consumers, no AR or actionpack imports. Pin tests
  against hand-computed values plus fixtures cross-checked by running the
  Ruby stdlib (`ruby -rdid_you_mean -e 'p DidYouMean::JaroWinkler.distance(a,b)'`).
  Verify `pnpm build` / `pnpm typecheck` pick up the new workspace.
- **PR 2 (~175 LOC):** `spell-checker.ts` + tests + barrel update.
  Depends on PR 1.
- **PR 3 (~30 LOC):** Add `@blazetrails/did-you-mean` to actionpack
  `dependencies`, wire `ActionNotFound#corrections` (see next section),
  add one test.

The standalone package removes one risk that activesupport-home would
have carried: no chance of a circular dep, since this package depends on
nothing in the workspace. Consumer PRs (ParameterMissing,
association errors, `Template::Error`) follow the same shape as PR 3 —
each adds a workspace dep, swaps in `SpellChecker`, and deletes the
inline Levenshtein helper. Each is well under 100 LOC.

### Test fixtures

`vendor/rails` does not include did_you_mean's own test suite, and we
don't vendor a Ruby stdlib mirror. Use:

1. A handful of canonical cases from the Ruby project README (`"foo"` vs
   `["fooo", "fobr", "qux"]`, etc.).
2. Numeric oracles generated locally with `ruby -rdid_you_mean` and pasted
   as `// computed via Ruby 3.3 did_you_mean` comments next to the
   assertions. (Don't auto-generate at build time; just paste values so the
   test file is self-contained and CI doesn't need Ruby.)
3. The exact Rails call-site shapes we'll be calling from (controller
   action names, association names, strong-params keys) — so the tests
   double as caller documentation.

## AbstractController follow-up wiring

After PR 2 ships, `packages/actionpack/src/abstract-controller/base.ts`
gets a ~10 LOC delta:

```ts
import { SpellChecker } from "@blazetrails/did-you-mean";

export class ActionNotFound extends Error {
  readonly controller?: AbstractController;
  readonly action?: string;

  constructor(message: string, controller?: AbstractController, action?: string) {
    super(message);
    this.name = "ActionNotFound";
    this.controller = controller;
    this.action = action;
  }

  get corrections(): string[] {
    if (!this.controller || !this.action) return [];
    const ctor = this.controller.constructor as typeof AbstractController;
    const dictionary = ctor.actionMethods();
    return new SpellChecker({ dictionary }).correct(this.action);
  }
}
```

Then update the throw site (`base.ts:259`) to pass `this` and the action
name. Test: construct a controller with actions `["index", "show"]`, throw
`ActionNotFound` for `"shwo"`, assert `corrections` returns `["show"]`.

Ruby uses `DidYouMean::Correctable` (a mixin that defines `#corrections`
and overrides `#original_message`) and a class-level
`DidYouMean.correct_error(ErrorClass, Checker)` registration. In TS we
just put the getter on the subclass — same observable behaviour, no
runtime mixin.

The other consumers (`ParameterMissing`, association errors,
`Template::Error`) each get the same shape: a `corrections` getter on the
error subclass that constructs a `SpellChecker` from the relevant
dictionary, and a deletion of the inline Levenshtein helper that used to
stand in for it.
