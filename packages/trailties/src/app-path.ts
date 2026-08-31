/**
 * Rails' `APP_PATH` and `ENGINE_PATH` constants. `bin/rails` defines
 * `APP_PATH` from its own location before `Rails::Command` runs, and
 * `Rails::Command::Actions` reads it through `defined?(APP_PATH)`
 * (`railties/lib/rails/command/actions.rb:13-16`). TypeScript has no
 * `defined?`, so the constants are mutable module bindings that are
 * `undefined` until the CLI entry point names them.
 *
 * @noRailsEquivalent PERMANENT
 */
export let APP_PATH: string | undefined;

/** @noRailsEquivalent PERMANENT */
export let ENGINE_PATH: string | undefined;

/** @noRailsEquivalent PERMANENT */
export function setAppPath(path: string | undefined): void {
  APP_PATH = path;
}

/** @noRailsEquivalent PERMANENT */
export function setEnginePath(path: string | undefined): void {
  ENGINE_PATH = path;
}
