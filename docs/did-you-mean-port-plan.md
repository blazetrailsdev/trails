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
- `packages/did-you-mean/tsconfig.json` (copy globalid's)
- co-located `*.test.ts` files

The barrel exports `SpellChecker`, `jaroDistance`, `jaroWinklerDistance`,
and `levenshteinDistance`. Consumer packages add
`"@blazetrails/did-you-mean": "workspace:*"` to their `dependencies`.

## Survey of Rails usage

From `grep -rn DidYouMean vendor/rails`:

| Call site (vendor/rails path)                                                                                                                                                                           | What it suggests          | trails status today                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actionpack/lib/abstract_controller/base.rb` — `ActionNotFound#corrections`                                                                                                                             | controller action names   | `packages/actionpack/src/abstract-controller/base.ts:26` — `ActionNotFound` has no `corrections`                                                                      |
| `actionpack/lib/action_controller/metal/exceptions.rb` — `UrlGenerationError#corrections`                                                                                                               | route name dictionary     | not yet ported                                                                                                                                                        |
| `actionpack/lib/action_controller/metal/strong_parameters.rb` — `UnpermittedParameters#corrections`                                                                                                     | permitted-keys dictionary | `strong-parameters.ts:29` ships an inline Levenshtein ≤2 helper — should be replaced by `SpellChecker`                                                                |
| `activerecord/lib/active_record/associations/errors.rb` — `AssociationNotFoundError#corrections`, `InverseOfAssociationNotFoundError#corrections`, `HasManyThroughAssociationNotFoundError#corrections` | reflection names          | `packages/activerecord/src/associations.ts` + `reflection.ts` use an ad-hoc `levenshtein()` with `≤3` threshold (only covers two of the three error types faithfully) |
| `actionview/lib/action_view/template/error.rb` — `Template::Error#corrections` (uses raw `DidYouMean::Jaro.distance`)                                                                                   | template virtual paths    | not yet ported — needs `Jaro.distance` exported, not just `SpellChecker`                                                                                              |
| `railties/lib/rails/command.rb` — command suggestion                                                                                                                                                    | registered command names  | n/a (no railties port yet)                                                                                                                                            |
| `railties/lib/rails/test_unit/runner.rb` — `InvalidTestError`                                                                                                                                           | test paths                | n/a (no test runner port yet)                                                                                                                                         |
| `guides/rails_guides/generator.rb`                                                                                                                                                                      | guide anchors             | n/a (not a Rails runtime concern)                                                                                                                                     |

So the consumers we actually need to wire up after the port lands:

1. **AbstractController::ActionNotFound#corrections** (this prompt's motivating case)
2. **UnpermittedParameters#corrections** (replaces existing inline Levenshtein)
3. **AssociationNotFoundError / InverseOfAssociationNotFoundError / HasManyThroughAssociationNotFoundError `#corrections`** (replaces existing `levenshtein()` ad-hoc helpers in `associations.ts` and `reflection.ts`)
4. **Template::Error#corrections** (needs `jaroDistance` exported)
5. **UrlGenerationError#corrections** (new, when route exceptions are ported)

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
6. Sort `words` by `jaroWinklerDistance(String(word), normalizedInput)` **descending** (Ruby does `sort_by` ascending then `reverse!`; that ordering is stable in Ruby, which we have to mimic — Array.prototype.sort is stable in modern V8/Node so a single descending sort is fine, but the comparator must produce 0 for ties so we preserve dictionary order).
7. `mistypeThreshold = Math.ceil(normalizedInput.length * 0.25)`.
8. `corrections` = `words` where `levenshteinDistance(normalize(word), normalizedInput) <= mistypeThreshold`.
9. If `corrections` is empty, take the misspell fallback:
   `words.filter(word => { const w = normalize(word); const len = Math.min(normalizedInput.length, w.length); return levenshteinDistance(w, normalizedInput) < len; }).slice(0, 1)`.
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
- If `j > 0.7`, count the common prefix length (up to 4 codepoints) and
  return `j + prefixBonus * 0.1 * (1 - j)`. Otherwise return `j`.

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

Estimated LOC (source + tests, no surrounding docs):

| File                             | Source | Tests |
| -------------------------------- | -----: | ----: |
| `levenshtein.ts`                 |     35 |    50 |
| `jaro-winkler.ts`                |     70 |    80 |
| `spell-checker.ts`               |     45 |   120 |
| `did-you-mean/index.ts` + barrel |     10 |     — |
| **Total**                        |    160 |   250 |

≈410 LOC total — over the 300-LOC ceiling. Split:

- **PR 1 (~190 LOC):** `levenshtein.ts` + `jaro-winkler.ts` + their tests +
  barrel exports. Pure math, no consumers. Pin tests against hand-computed
  values plus a handful of fixtures cross-checked by running the Ruby
  stdlib (`ruby -rdid_you_mean -e 'p DidYouMean::JaroWinkler.distance(a,b)'`)
  so we have ground truth.
- **PR 2 (~170 LOC):** `spell-checker.ts` + tests. Depends on PR 1.
- **PR 3 (~30 LOC):** AbstractController `ActionNotFound#corrections`
  wiring (see next section). Lands once PR 2 is merged.

Subsequent consumer PRs (UnpermittedParameters, association errors,
Template::Error) are separate follow-ups, each well under 100 LOC, and
each gets to delete an inline ad-hoc Levenshtein helper.

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

The other consumers (`UnpermittedParameters`, association errors,
`Template::Error`) each get the same shape: a `corrections` getter on the
error subclass that constructs a `SpellChecker` from the relevant
dictionary, and a deletion of the inline Levenshtein helper that used to
stand in for it.
