# What a trails app actually loads to call `camelize`

This started as a sub-question of the Perry prototype ([FINDINGS.md](FINDINGS.md))
and turned into something independent of it. Perry's module counts are inflated
by its own eager collection, so they are a bad proxy for cost. These numbers
come from Node's resolver instead — the graph a real consumer pays for.

Measure with `./perry/module-graph.sh`.

## Numbers

Modules Node actually resolves, and wall time to `await import()` on a warm
cache (median of 5, Node 24):

| Entry point                                         | Modules | Time   |
| --------------------------------------------------- | ------- | ------ |
| `activesupport/index.js` (barrel), for `camelize`   | 332     | 399 ms |
| `activesupport/inflector.js` (deep), for `camelize` | 229     | 300 ms |
| `ruby-compat/index.js` (barrel), for `regexpEscape` | 138     | 147 ms |
| `ruby-compat/regexp.js` (deep), for `regexpEscape`  | 54      | 58 ms  |

By package, for `camelize` through `inflector.js`:

| Package                        | Modules |
| ------------------------------ | ------- |
| `@blazetrails/ruby-compat`     | **138** |
| `@blazetrails/activesupport`   | 63      |
| `@blazetrails/i18n`            | 19      |
| `@blazetrails/date`            | 6       |
| `js-temporal-polyfill`, `jsbi` | 2       |

## Where the weight is, and where it is not

**It is not activesupport.** That was the first guess and it is wrong.
`namespaces.ts` — the `TopLevel` hub that looked like the culprit — is written
carefully: six of its nine imports are `import type` and erase at runtime, and
the one genuinely heavy dependency, `message-pack.js` → `@msgpack/msgpack`, is
behind a lazy dynamic import. `activesupport/src/xml-mini/nokogiri.ts` guards
its optional backend the same way. activesupport's own 63 modules are a small
share of the 229.

**It is `ruby-compat`'s barrel.** `inflector.ts:3` wants three small helpers:

    import { isRegisteredConstant, regexpEscape, registeredConstant } from "@blazetrails/ruby-compat";

`regexpEscape` lives in `ruby-compat/src/regexp.ts`. Importing that module
directly costs 54 modules and 58 ms. Importing the same function through the
package entry point costs **138 modules and 147 ms** — 2.5x, for nothing. The
barrel is 445 lines of 146 re-exports, and ESM has to evaluate every module it
names before it can hand back one binding.

Multiply that by every `@blazetrails/*` package and every test file: this is
paid on every CLI invocation, every cold start and every test-suite boot, and
`ruby-compat` is the foundation layer, so almost nothing escapes it.

## Why this is cheap to fix, and the hazard that isn't there

`ruby-compat/src/index.ts` is a **pure re-export hub**: 146 `export` lines, no
bare side-effect imports, no top-level `registerConstant`, no prototype
patching. That was the thing worth checking before proposing anything, because
a barrel that performs registration is load-bearing and routing imports around
it would change initialization order. This one does not, so pointing hot
internal imports at subpaths is behaviour-preserving.

`ruby-compat` already publishes eight subpath exports (`./include`,
`./method-missing-proxy`, `./name-error`, `./psych`, `./range`, `./yaml`, …),
so the mechanism exists and the precedent is set; the hot leaves simply are not
among them.

## What is worth doing, in order

1. **Measure the real entry points, not `camelize`.** `camelize` is a probe, not
   a workload. The numbers that justify work are `bin/trails` startup and one
   test file's boot. `module-graph.sh` takes any entry point.
2. **Add subpath exports to `ruby-compat` for the hot leaves** (`regexp` first)
   and point activesupport's hot modules at them. Expected saving is the 2.5x
   above on the foundation layer. Behaviour-preserving, per the section above.
3. **Only then consider layering.** Whether `camelize` should transitively load
   `i18n` at all is a deeper question — `ActiveSupport::Inflector` genuinely
   does consult I18n for `transliterate`/`parameterize` in Rails, so the
   dependency is not arbitrary and parity constrains the answer. Check the Rails
   source before touching it; making the edge lazy is likelier right than
   removing it.

## What this does not buy

Nothing for Perry. Perry collects every statically reachable module and, as its
own error says, "dynamic import() of a runtime-computed path cannot run in an
ahead-of-time compiled binary" — so lazy, guarded and dynamic imports are all
collected alike, and a specifier hidden well enough to escape collection is
simply absent from the binary. Do not justify this work with the native-build
story; justify it with cold start and bundle size, or not at all.
