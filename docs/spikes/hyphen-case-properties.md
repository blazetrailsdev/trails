# Spike: hyphen-case JavaScript property names in `.tse` (and possibly `.ts`)

Throwaway spike. Not a story, no Rails counterpart, nothing here is meant to merge.

## Recommendation

**`.ts`: no.** The whitespace rule itself would break nothing here (0 of 1,600 binary minuses in
5,186 tracked files violate it), but the syntax cannot be introduced by a pre-transform. Every
tool in the chain parses TypeScript itself, and the two that matter most have no hook:
`tsc --build` (the native 7.1 binary reads files from disk) and prettier, which today either
refuses the file or, for a plain read, rewrites `post.created-at` to `post.created - at` on save
and in lint-staged. That last one is verified below. Shipping it means maintaining a fork of the
language across about ten parsers.

**`.tse`: feasible, cheap, and containable.** The prototype on this branch does it in about 400
lines inside `tse-compiler`, off by default, switched on per file by a pragma, with correct
columns in the typecheck shim and in runtime error locations. All four design combinations run
from one switch.

**If you ship it, ship literal keys, property positions only, opt-in per file.** That is the one
combination with no second spelling for an existing name and no reinterpretation of bare
`a-b`.

**My lean is still not to ship it.** What it buys is the two quote characters and two brackets in
`{"turbo-frame": x}` and `this["window-size"]`. What it costs is one whitespace-sensitive rule
whose failure mode is silent: `post.total-discount`, which is subtraction today, becomes a
property read that answers `undefined`. The repo's `.tse` files contain no quoted hyphenated key
today, so there is no measured demand to weigh against that.

### The decision you have to make

1. Is `.ts` out? I am recommending yes, with evidence in "The `.ts` layers" below.
2. For `.tse`: ship nothing, or ship literal + property-only behind the pragma?
3. If shipping: is a digit-led segment (`grid.col-2`) an error, as prototyped, or a name?

## The four combinations

All four are implemented in `rewriteHyphenNames` (`resolve` × `positions`) and tested.

|                     | Property positions only                                                                                                                                                         | Full identifiers                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Literal key**     | Coherent. `x.a-b` is `x["a-b"]`; `{a-b: 1}` is `{"a-b": 1}`; shorthand `{a-b}` is `{"a-b": aB}`. A bare `a-b` is a compile error. Breaks: `x.a-b` that meant subtraction.       | Half coherent. A binding cannot be named `a-b` in JavaScript, so `const a-b = 1` has to become `const aB = 1`. Properties are literal and bindings are aliased: two semantics in one feature. Breaks: every unspaced `a-b` between two variables, silently. |
| **camelCase alias** | Coherent but redundant. `x.a-b` is `x.aB`; `{a-b}` is `{aB}`. Two spellings for every name. Breaks: `x.a-b` that meant subtraction; grep for `windowSize` misses `window-size`. | Coherent. Hyphen-case is purely a source spelling everywhere. Breaks: every unspaced `a-b`, silently, and the mapping is not injective (`a-b` and `aB`, `x-url` and `xUrl` collide).                                                                        |

Shorthand in property-only mode reads the camelCase local (`{window-size}` reads `windowSize`).
I chose that because it is the only binding a property-only design can name, and it makes
shorthand the one place where the alias leaks into the literal design. If that leak is
unwelcome, forbid shorthand and require `{window-size: windowSize}`.

Why literal over alias: CLAUDE.md § "An action's name is its method's name" already rejected
"two spellings for one action, with a conversion between them somewhere" in favour of one rule.
The alias design is that rejected shape applied to every property.

## Measured breakage

Run with `pnpm tsx scripts/spikes/hyphen-audit.ts <path-to-trailmap>`. The `.ts` side walks the
TypeScript 5.9 AST (`BinaryExpression` with a `MinusToken`), so string, comment, regex and
template text are not counted. The `.tse` side runs the prototype's own tokenizer over each code
tag. I checked the script against a hand-written file with eight known violations and it found
all eight.

| Population                                                | Size                              | Unspaced name-name after `.` (silent) | Unspaced bare `a-b` | `x-1` | Other unspaced | One-sided |
| --------------------------------------------------------- | --------------------------------- | ------------------------------------- | ------------------- | ----- | -------------- | --------- |
| Tracked `.ts`/`.js`, source and tests, `vendor/` excluded | 5,186 files, 1,600 binary minuses | 0                                     | 0                   | 0     | 0              | 0         |
| `.tse` in this repo, tests and fixtures                   | 68 files, 63 code tags            | 0                                     | 0                   | 0     | 0              | 0         |
| `.tse` in this repo, non-test                             | 2 files, 18 code tags             | 0                                     | 0                   | 0     | 0              | 0         |
| Template strings inside `.ts` (mostly tests)              | 497 strings, 703 code tags        | 0                                     | 0                   | 0     | 0              | 0         |
| `.tse` in trailmap, non-test                              | 12 files, 244 code tags           | 0                                     | 0                   | 0     | 0              | 0         |
| `.tse` in trailmap, test                                  | 1 file, 1 code tag                | 0                                     | 0                   | 0     | 0              | 0         |

Every count is zero, including in prettier-ignored files, so the prettier split is moot: prettier
already prints binary minus with a space on both sides, and nothing unformatted slipped through.
The inline-template row reports 2 hits when run on this branch; both are this spike's own test.

Two caveats. The `.tse` corpus is small (326 code tags in total), so zero there means "no
evidence of breakage", not "none will occur": `.tse` is not formatted by anything, so
`arr.length-1` in a template is one keystroke away. And TypeScript has one unspaced minus that is
not an expression at all: the mapped-type modifiers `-?` and `-readonly` (1 site in the repo),
which any `.ts` scanner would have to exempt.

Demand, estimated by regex rather than AST: `packages/*/src` holds about 527 `["a-b"]` accesses
and 503 `"a-b":` keys (91 outside tests, mostly HTTP header names). No `.tse` file in this repo
or in trailmap holds one.

## Edge-case rulings

"Tested" means a case in `packages/tse-compiler/src/hyphen-names.test.ts`. The rule as
prototyped is stricter than the brief: **a binary minus without spaces is never subtraction.** It
is either one name or a compile error. That removes every "is this a name or a difference"
judgement except the one the feature exists to make.

| Input                                                                      | Ruling                                               | Reason                                                                                                                                                                                                                                               | Status                          |
| -------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `a - b`, `a -⏎ b`                                                          | Subtraction                                          | Whitespace on both sides; a newline is whitespace                                                                                                                                                                                                    | Tested                          |
| `this.test- 1`, `this.test -1`, `a⏎-b`                                     | Error                                                | One-sided. `a⏎-b` is valid subtraction today, so this rejects it loudly                                                                                                                                                                              | Tested                          |
| `this.x-1`, `this.col-2`, `arr.length-1`                                   | Error                                                | A segment cannot start with a digit. `length-1` is the commonest unspaced minus in JavaScript and must not turn into a property silently. Raku rules the other way (subtraction); see open questions                                                 | Tested                          |
| `this.is-new`, `this.data-class`, `this.for-each`                          | Name                                                 | Keywords are legal property names                                                                                                                                                                                                                    | Tested                          |
| `this.a--`, `this.a-=1`, `this.a -= 1`                                     | Unchanged                                            | `--` and `-=` are their own tokens, longest match first                                                                                                                                                                                              | Tested                          |
| `this.a--b`, `this.a---b`                                                  | Error                                                | No consecutive hyphens. Both are JavaScript syntax errors today                                                                                                                                                                                      | Tested                          |
| `a - -b`, `f(-x)`, `[a, -b]`, `return -x`, `typeof -x`, `x = -1`, `a * -b` | Unchanged                                            | A minus in prefix position is unary and outside the rule                                                                                                                                                                                             | Tested                          |
| `this.a-`                                                                  | Error                                                | Trailing hyphen is one-sided. In a tag, `-%>` is taken by the lexer as the trim marker first                                                                                                                                                         | Tested                          |
| `this.-a`                                                                  | Left to the JS parser                                | Already a syntax error                                                                                                                                                                                                                               | Tested                          |
| `this.a-b?.c-d()`, `this.fetch-all()`                                      | `this["a-b"]?.["c-d"]()`, `this["fetch-all"]()`      | The receiver is kept, so `this` binds as before                                                                                                                                                                                                      | Tested                          |
| `this['a-b'].c-d[e - f]`                                                   | Mixes freely                                         | Quoted and computed keys are untouched                                                                                                                                                                                                               | Tested                          |
| `f()-1`, `a[0]-b`, `"a"-1`                                                 | Error                                                | Unspaced minus that cannot be a name                                                                                                                                                                                                                 | Tested                          |
| `{window-size = 10}` in a pattern                                          | `{"window-size": windowSize = 10}`                   | Shorthand with default                                                                                                                                                                                                                               | Tested                          |
| `{window-size: w}`                                                         | `{"window-size": w}`                                 | Rename                                                                                                                                                                                                                                               | Tested                          |
| `{window-size: 10}`, `{fetch-all() {}}`                                    | Quoted key, quoted method name                       | Key position inside an object brace                                                                                                                                                                                                                  | Tested                          |
| `{get window-size() {}}`, class members                                    | Not prototyped                                       | The desugared forms (`"window-size" = 1`, `get "max-width"()`, `"fetch-all"()`, `static`, `declare`) all type-check under native tsc 7.1. Recognising member position needs a class-body state the tokenizer lacks. Templates do not declare classes | Reasoned; target forms verified |
| `this.#a-b`                                                                | Error                                                | A private name cannot be quoted                                                                                                                                                                                                                      | Tested                          |
| Template literal text, strings, comments, regex bodies                     | Untouched                                            | Not code                                                                                                                                                                                                                                             | Tested                          |
| `${this.a-b}` inside a template literal                                    | Rewritten                                            | Substitutions are code                                                                                                                                                                                                                               | Tested                          |
| `() => {a-b}`, `if (x) {a-b}`                                              | Error (bare name), not shorthand                     | The brace is a block. Decided by the token before `{`, which is a heuristic                                                                                                                                                                          | Tested                          |
| HTML outside tags (`data-turbo-frame="x-y"`)                               | Untouched                                            | The lexer never hands text to the rewriter                                                                                                                                                                                                           | Tested                          |
| `a-b` between two locals                                                   | Error in property-only mode, `aB` in identifier mode | See the four combinations                                                                                                                                                                                                                            | Tested                          |
| First segment is an operator keyword, bare (`in-flight`, `new-thing`)      | Not recognised as a name in identifier mode          | The tokenizer reads the keyword as an operator. Property position is fine                                                                                                                                                                            | Reasoned                        |

## Ambiguities with no good answer

These change the meaning of valid JavaScript without an error.

1. **`x.a-b`.** Subtraction today, one property after. This is the feature, so no rule can make
   it loud. With literal keys the new value is usually `undefined`, and `undefined` renders as an
   empty string in a template. The typecheck shim catches it only when the view type is known
   (the test asserts `'window-height' does not exist`); with unresolved locals the scope type is
   `any` and nothing complains.
2. **`a-b` in full-identifier mode.** `end-start` becomes `endStart`. tsc reports an unknown name
   unless `endStart` happens to exist, in which case it is silent and wrong.
3. **`{a-b}` where the brace is a block.** The prototype guesses from the preceding token. A tag
   that opens a brace in one `<% %>` and continues in the next gives the tokenizer no context.
4. **The alias is not injective.** `x.a-b` and `x.aB` are one member. Rename and
   find-references cannot round-trip the spelling.

Containment: a per-file pragma (`<%! hyphen-names: literal !%>`, prototyped) contains all of
them to files whose author opted in, and `off` is the default. A `.tse`-wide default would be
safe against today's corpus (zero sites) but would turn the first unspaced `total-discount`
someone types into a silent bug. A compiler flag is the wrong grain: a template's meaning would
then depend on the app that renders it.

## Types

**Literal keys.** TypeScript already has all of it; verified with native tsc 7.1 on a scratch
file. `interface Style { "window-size": string }`, a class field `"window-size" = "10px"`,
`static "default-size" = 1`, `get "max-width"(): number`, `"fetch-all"(): string[]`, and
`declare "data-id": string` all compile, and `p["window-height"]` is an error. In the shim the
rewrite produces `this["window-size"]`, so the checker sees an ordinary element access. Rename
and go-to-definition work on quoted members in the TS language service; I did not exercise them.

**Alias.** The declaration is `windowSize`. A reader who sees `this.window-size` has to know the
rule to search for it. Go-to-definition from a `.tse` works only through the shim's source map,
which lands on the right member. Rename from the declaration would rewrite the shim, not the
`.tse`, so hyphenated uses are left stale.

## Interaction with existing trails rules

- **Kebab-case files and locale keys.** These are strings (`t(".next-bundle.title")`,
  `render template: "shared/line-item"`), so neither design touches them. The feature does not
  remove the `dasherize(underscore(name))` conversion at any of the five listed sites.
- **`docs/ruby-ts-conventions.md`.** Members are camelCase. Literal keys add members that no
  Rails name translates to, so they are confined to user data (attribute hashes), which is fine.
  The alias adds a second spelling of every converted name, which is not.
- **Generated attribute readers.** `post.created-at` works under the alias for free (it is
  `post.createdAt`). Under literal keys it is `post["created-at"]`, which is `undefined` unless
  reader generation also defines a hyphenated accessor per attribute. That doubles the generated
  surface and re-opens the "must not shadow an inherited method" rule for a second name. I would
  not do it. So under the recommended design, `post.created-at` does not work and silently reads
  `undefined`, which is the strongest argument against shipping at all.
- **Tag helpers.** `prefixTagOption` (`helpers/tag-helper.ts:538`) dasherizes `_` only, as Rails
  does, so `data: { turboFrame: 1 }` renders `data-turboFrame`. `data: { turbo-frame: 1 }` under
  literal keys is the one place the feature reads better than what exists.

## Tooling the user sees

Today `.tse` has no syntax grammar, no formatter and no linter in this repo (no tmLanguage or
tree-sitter file is tracked; prettier and eslint do not match the extension). Diagnostics come
from `trails-tsc`'s tsserver plugin (`lsp-plugin.ts`), which is written against the TypeScript
5.x plugin API. So the feature needs nothing new from tooling that does not exist, and when a
grammar is written the hyphen rule is one token pattern. Diagnostics already work: the prototype
keeps shim columns exact.

## The `.ts` layers

"Verified" means I ran it on a scratch file with `this.window-size`, `this.window-size = 10` and
`{window-size}`.

| Layer                                    | What happens to raw hyphen syntax                                                                                     | Would a pre-transform work                                                                                                                        | Positions                                                                                                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsc --build` (native 7.1, `pnpm build`) | Verified: the read parses as subtraction; the assignment and the shorthand are `TS1005`/`TS1128`                      | No hook. The Go binary reads the disk. Only a generated mirror tree would do                                                                      | A mirror tree needs maps for every diagnostic                                                                                                                                   |
| Native API (`typescript/unstable/*`)     | Same parser                                                                                                           | Yes: `typescript/unstable/fs` exposes `readFile` and `createFileSystemLayer`, which `activerecord-cli/src/tsc-wrapper/ar-program.ts` already uses | The rewrite is not length-preserving (literal adds 3 characters, alias removes 1 per hyphen), so diagnostics need column remapping; `trails-tsc/src/remap.ts` remaps lines only |
| `trails-tsc`                             | TS 5.9 host with `TscPlugin.virtualize` per extension                                                                 | Yes, a `.ts` plugin fits the existing interface                                                                                                   | Same column gap                                                                                                                                                                 |
| Editor language service                  | The 7.1 package exports no language-service plugin entry that I could find; `lsp-plugin.ts` targets the 5.x tsserver  | Only in an editor still running the 5.x tsserver                                                                                                  | Hover, rename and completion would operate on rewritten text                                                                                                                    |
| eslint (`typescript-eslint` 8)           | Parse error                                                                                                           | Only through an eslint processor, and `--fix` would write fixes against rewritten text                                                            | Processor must map both ways                                                                                                                                                    |
| prettier 3.8                             | Verified: `const a = this.window-size` is reformatted to `this.window - size`; the assignment form is a `SyntaxError` | No. A formatter must print the syntax, which needs a prettier plugin with its own parser and printer                                              | Not applicable                                                                                                                                                                  |
| lint-staged                              | Runs `eslint --fix` then `prettier --write`                                                                           | Inherits both problems, on every commit                                                                                                           |                                                                                                                                                                                 |
| esbuild (vitest, tsx)                    | Verified: read becomes `this.window - size`; assignment is "Invalid assignment target"; shorthand is a parse error    | A vite plugin with `enforce: "pre"` for vitest; tsx has no transform hook                                                                         | Needs a chained source map                                                                                                                                                      |
| typedoc 0.28                             | Uses the 5.x compiler API                                                                                             | Only through a custom host                                                                                                                        |                                                                                                                                                                                 |
| `scripts/` parity extractors             | 11 files in `scripts/api-compare` and others parse with `typescript-5` or ts-morph                                    | Each needs the transform before `createSourceFile`                                                                                                | Line numbers survive; columns do not                                                                                                                                            |

Nothing here is impossible, but there is no single seam. The `.tse` case is different in kind:
one compiler that we own sits in front of everything.

## Prior art

From memory, not re-checked against sources.

| Language              | Hyphen in names                                   | How subtraction is told apart                                                                 |
| --------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Lisp, Scheme, Clojure | Yes                                               | No infix operators, so no conflict                                                            |
| COBOL                 | Yes                                               | The operator needs a space on both sides                                                      |
| CSS `calc()`          | Yes                                               | `+` and `-` need whitespace on both sides                                                     |
| Sass                  | Yes, and `-` and `_` are the same name            | Spaces on both sides or neither is subtraction; a hyphen glued to an identifier is part of it |
| XPath, XQuery         | Yes                                               | A minus after a name needs whitespace before it                                               |
| Raku                  | Yes, when a letter follows the hyphen             | `$a-1` is subtraction, because a digit cannot continue a name                                 |
| Nix                   | Yes                                               | `a-b` is a name, `a - b` subtracts                                                            |
| Kotlin                | Only inside backticks                             | Explicit quoting, no whitespace rule                                                          |
| JSX                   | Yes, in attribute and element names only          | Position: the name is never in expression position                                            |
| Vue templates         | `window-size` in markup is `windowSize` in script | An alias across the HTML/JS boundary, not inside expressions                                  |
| CoffeeScript, jq      | No                                                | `a-b` and `.a-b` subtract; quote the key                                                      |

The designs that hold up restrict hyphenated names by position (JSX) or have no infix minus at
all. The ones that allow both everywhere (Sass, Nix, Raku) are the ones with a documented
footgun.

## What was verified and what was not

Verified by running:

- `packages/tse-compiler/src/hyphen-names.test.ts`: 27 tests, pass.
- `packages/trails-tsc/src/plugins/tse-hyphen.spike.test.ts`: 6 tests, pass.
- `packages/actionview/src/template/handlers/tse-translate-location.test.ts`: 10 tests, pass
  (2 new).
- Every existing test file for the code touched still passes: all of
  `tse-compiler/src/*.test.ts`, `trails-tsc/src/plugins/*.test.ts`,
  `trails-tsc/src/build-views.test.ts`, `trails-tsc/src/lsp-plugin.test.ts` and
  `actionview/src/template/handlers/tse.test.ts`. With the three files above that is 14 files,
  234 tests, 0 failures. `node scripts/typecheck.mjs` exits 0 and eslint is clean on the touched
  directories.
- The audit numbers, the native tsc, prettier and esbuild behaviours, and the literal-key
  declaration forms.

Reasoned only: class-member support, rename and go-to-definition behaviour, eslint, typedoc and
language-service behaviour, and the prior-art table. The whole suite was not run.

Prototype limits: the runtime source map from `compileJs` is line-granular, as it was before, so
only the shim map and `translateLocation` carry columns. The object-versus-block brace decision
and the regex-versus-division decision are token heuristics.

## Unrelated bug found

`translateLocation` returns `null` (no column) for an error on a line that also holds a
`<%! … !%>` block, with or without this spike: the ERB tokenizer reports the block as a `:CODE`
token whose text never appears in the compiled line, and `findOffset` consumes the rest of the
line looking for it. Reproduce with `<%! types: { a: string } !%><%= value.missing() %>`.

## Open questions

1. Digit-led segments: error (prototyped), a name (`grid.col-2`), or subtraction as in Raku?
2. Should property-only shorthand `{window-size}` exist, given it reads `windowSize`?
3. Should the strict form of the rule stand (unspaced minus is never subtraction), or should
   `f()-1` stay legal as the brief's wording allows?
4. If literal keys ship, is `post.created-at` reading `undefined` acceptable, or does that alone
   settle it?
