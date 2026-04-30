# ActiveSupport — scope and direction

**Not a "100%" target.** ActiveSupport is the most language-coupled
package in Rails: a third of it is Ruby core-extension monkeypatching,
metaprogramming for autoload/dependencies, threading primitives, and
test-framework integration that has no TypeScript analog (or a worse
one). Mirroring all 1,700+ Rails methods would import a lot of code
that nobody downstream calls.

The goal is **"what other trails packages need, plus the standalone
utilities that Rails users reach for from app code."** Rails-mirror
naming where the abstraction translates; trails-native names where
Ruby idioms don't.

## How to scope new work

Three questions, in order:

1. **Does a sibling package import it?** Grep
   `packages/{activerecord,activemodel,actionpack,arel,actionview,trailties,rack}/src` —
   if yes, it's in scope.
2. **Is it a runtime utility a Rails user reaches for?** Things like
   `Inflector`, `Duration`, `MessageVerifier`, `ParameterFilter`. These
   ship as standalone exports.
3. **Does it have a JS/TS-native analog already?** If yes, prefer the
   native — don't reimplement `Array#tap`, `Object.assign`, `JSON.parse`
   with Rails-named wrappers.

If none of (1) or (2), it's likely out of scope (see "Explicitly out"
below).

## Currently in scope (shipped or in flight)

Counts via `pnpm tsx scripts/api-compare/compare.ts --package activesupport`
(latest run: **420/1697 public-only, 24.7%**). The denominator includes
the Ruby-only surface listed under "Explicitly out" — actual coverage
of in-scope features is much higher than the headline number.

### Inflector / string utilities

`camelize`, `classify`, `dasherize`, `demodulize`, `humanize`,
`parameterize`, `pluralize`, `singularize`, `squish`, `tableize`,
`truncate`, `underscore`, `upcaseFirst`, `foreignKey`. Custom
inflections via `Inflector` registry. Used heavily by activerecord
and activemodel for column/association/class-name normalization.

### Duration / Temporal helpers

`Duration` (with `.since`, `.ago`, `.fromNow`, `.until`), `instant`,
`plainDate`, `plainDateTime`, `plainTime`, time-travel test helpers
under `testing/temporal-helpers`. Re-exports `Temporal` polyfill.
F-6 sweep flips remaining `Date`-returning helpers — see
[`temporal-migration-plan.md`](temporal-migration-plan.md).

### Notifications + instrumentation

`Notifications`, `NotificationEvent`, `NotificationSubscriber`,
`Instrumenter`. Used by activerecord (query logs), actionpack (request
notifications), trailties (log subscriber).

### Errors / reporting

`ActionableError`, `ErrorReporter`, `BroadcastLogger`, `CleanLogger`,
`Logger`, `Deprecation`. Production logging infrastructure.

### Crypto / messages

`MessageVerifier`, `MessageEncryptor`, `KeyGenerator`,
`SecurityUtils.secureCompare`, `digest` (SHA1/SHA256), `hexdigest`,
`pbkdf2Async`. Used by actionpack (cookies, CSRF) and activerecord
(encryption).

### Class-level / module behavior

`Concern`, `include`/`extend`/`prepend` mixin helpers, `Included<>`
type, `DescendantsTracker`, `Configurable`, `Callbacks`,
`ClassAttribute`, `Delegation`, `CurrentAttributes`,
`HashWithIndifferentAccess`, `OrderedOptions`, `InheritableOptions`,
`ParameterFilter`, `ArrayInquirer`, `EnvironmentInquirer`. The
host-level primitives that downstream packages compose with.

### Adapters (browser-runnable)

`fsAdapter`, `pathAdapter`, `osAdapter`, `processAdapter`,
`childProcessAdapter`, `cryptoAdapter`, `asyncContextAdapter`. Lazy
node defaults; trailties / a browser shell can override. CLI-only
utilities (`glob`) live behind subpath exports.

### Cache

`MemoryStore`, `FileStore`, `NullStore`, cache key + entry helpers.
Used by actionpack (HTTP caching) and activerecord (query cache).

### View helpers

`htmlEscape`, `htmlSafe`, `SafeBuffer`. Used by actionview.

## Explicitly out (Ruby-isms, no TS analog)

These do not get implemented. They're filtered from the
`api:compare` denominator below; until that's wired, they inflate the
"missing" count without representing real work.

| Out                                                                                     | Why                                                                                  |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Most `core_ext/`: open-classing `Array`, `Hash`, `Numeric`, `Range`, `Object`, `Module` | TS doesn't allow modifying built-in prototypes; equivalent is named utility imports. |
| `dependencies.rb`, `autoload`, Zeitwerk integration                                     | ESM module resolution replaces the autoloader entirely.                              |
| `concurrency/share_lock`, `load_interlock_aware_monitor`                                | Thread-based; JS event-loop concurrency uses async primitives instead.               |
| `fork_tracker`                                                                          | Process forking; not how JS apps scale.                                              |
| `xml_mini` engines                                                                      | Would need an XML library dep; no consumer in trails today.                          |
| `testing/parallelization`, `testing/method_call_assertions`, most of `testing/`         | Vitest provides equivalent surface; we don't reimplement the Ruby test framework.    |
| `code_generator`, `method_set`                                                          | Ruby metaprogramming for runtime method-DSL emission; TS uses class fields + types.  |
| `i18n_railtie`, `railtie`, `actionable_error_subscriber`                                | Boot integration; replaced by trailties trailtie equivalents.                        |
| `ruby_features`, `version`                                                              | Ruby-runtime introspection.                                                          |
| `ordered_hash`, `multibyte` (Ruby string segmentation), most `subscriber/test_helper`   | Native JS data structures cover; no consumer.                                        |
| Most `inflector/methods` private helpers                                                | Internal to the Inflector port; surface API is what matters.                         |

## What's in but worth reconsidering

These are ported but rarely used or have a worse TS-native alternative.
Periodic audit candidates:

- `core-ext/object/duplicable`, `core-ext/object/try` — landed because
  some Rails code paths assumed them. Could potentially shrink.
- `class-attribute` runtime — heavy for what TS users typically reach
  for; consider whether the virtualizer (`virtual-source-files-plan.md`)
  obsoletes it.
- `descendants-tracker` — only useful if you don't have ESM-time module
  graph; could be replaced once the virtualizer covers STI subclass
  registration.

## Sequencing

Activesupport doesn't have a "next PR" — it ships in lockstep with the
sibling packages that need new helpers. When a sibling needs a Rails
helper that's missing, the author adds it under the matching Rails
file path with a faithful port + tests. The headline percentage is
not a target, just an indicator.

If the headline number bothers you: extend `excluded-files.ts` to
include the entire "Explicitly out" list above. The denominator drops
~700, and the displayed coverage realigns with what's actually being
maintained.
