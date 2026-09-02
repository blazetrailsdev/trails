/**
 * @noRailsEquivalent PERMANENT — `$VERBOSE` (`vendor/ruby/ruby.c:2910`) is an
 * interpreter global, not a Ruby method, so no Rails file declares the module
 * this file's exports live in.
 */

let verboseGlobal: unknown = false;

/**
 * `$VERBOSE` (`vendor/ruby/ruby.c:2910-2913`, `verbose_getter`). The
 * interpreter seats it `false` unless `-w`/`-v` was passed, so a trails
 * process — which has no such flag — reads `false` until something sets it.
 *
 * @noRailsEquivalent PERMANENT — Ruby core, not Rails: `$VERBOSE` is an
 * interpreter global, and `Rack::Session::Abstract::Persisted#commit_session`
 * guards its deferred-cookie notice on it
 * (`rack-session/lib/rack/session/abstract/id.rb:399`).
 */
export function verbose(): unknown {
  return verboseGlobal;
}

/**
 * `$VERBOSE=` (`vendor/ruby/ruby.c:2916-2920`, `verbose_setter`) — a truthy
 * assignment stores `true`, anything else stores the value itself, so `nil`
 * survives as the "no warnings at all" third state.
 *
 * @noRailsEquivalent PERMANENT — the writer half of {@link verbose}; a TS
 * `set` accessor cannot be a module-level binding.
 */
export function setVerbose(value: unknown): void {
  verboseGlobal = value != null && value !== false ? true : value;
}
