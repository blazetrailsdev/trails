// Late-bound `Trails.logger` slot, extracted into a module with ZERO imports
// so it cannot participate in any import cycle.
//
// Why this exists: Ruby resolves `Rails.logger` when the method runs, and
// `defined?(Rails.logger)` is false until railties is loaded — which is exactly
// how `Deprecation::DEFAULT_BEHAVIORS[:log]`
// (activesupport/lib/active_support/deprecation/behaviors.rb:26-31) reaches the
// application logger from inside Active Support. ESM has no equivalent, and the
// dependency runs the other way: `@blazetrails/trailties` imports
// `@blazetrails/activesupport`, never the reverse.
//
// `Trails.logger` (`trailties/src/rails.ts`) is the only writer — its accessor
// pair reads and writes this binding, so the slot IS the storage and the two
// can never disagree. Readers inside activesupport import `trailsLogger` and
// use it at call time, exactly where Ruby resolves the constant; it is `null`
// whenever railties is absent or has not set a logger, which is the same
// condition Ruby's `defined?(Rails.logger) && Rails.logger` tests.
//
// The shape itself — and why the alternatives do not work — is written down
// once in CLAUDE.md, "Call-time constant resolution (Ruby autoload → the
// zero-import slot)".

/** @internal */
export let trailsLogger: { warn(msg: unknown): void; debug(msg: unknown): void } | null = null;

/** @internal */
export function _setTrailsLogger(
  logger: { warn(msg: unknown): void; debug(msg: unknown): void } | null,
): void {
  trailsLogger = logger;
}
