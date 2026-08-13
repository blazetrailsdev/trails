// Late-bound `ActiveSupport.deprecator` slot, extracted into a module with ZERO
// imports so it cannot participate in any import cycle.
//
// Why this exists: `DateAndTime::Compatibility.preserve_timezone`
// (activesupport/lib/active_support/core_ext/date_and_time/compatibility.rb:28)
// names `ActiveSupport.deprecator` inside the method body, which Ruby resolves
// when the method runs. ESM has no equivalent — a plain
// `import { deprecator } from "./deprecation.js"` is eager, and `deprecation.ts`
// imports the package barrel (`deprecation.ts:5`, for `ActiveSupport.errorReporter`
// at `:92`). That edge closes a cycle through `index.ts` into `message-pack`,
// and entering the graph from a worker thread then evaluates
// `message-pack/index.ts:23` with `Serializer` still in TDZ:
// `ReferenceError: Cannot access 'Serializer' before initialization`.
// Measured — it reds `cache/file-store-atomic-write.trails.test.ts`, whose
// Worker enters the graph at its own root, while a normal vitest run masks it.
//
// `deprecation.ts` is the only writer: it calls `_setDeprecator` at the bottom
// of its own body, so the slot IS the storage and the two can never disagree.
// Readers use `deprecator` at call time, exactly where Ruby resolves the
// constant; it is `null` only if `deprecation.ts` has never been evaluated,
// which is the same condition under which Ruby would not have autoloaded it.
//
// The shape itself — and why the alternatives do not work — is written down
// once in CLAUDE.md, "Call-time constant resolution (Ruby autoload → the
// zero-import slot)".

/** @internal */
export let deprecator: { warn(message: string, callstack?: unknown): void } | null = null;

/** @internal Called by `deprecation.ts` once its own `deprecator` is built. */
export function _setDeprecator(value: { warn(message: string, callstack?: unknown): void }): void {
  deprecator = value;
}
