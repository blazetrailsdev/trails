let debugGlobal: unknown = false;
let verboseGlobal: unknown = false;

/**
 * `$VERBOSE` (`vendor/ruby/v3.3.11/ruby.c:2910-2913`, `verbose_getter`). The
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
 * `$VERBOSE=` (`vendor/ruby/v3.3.11/ruby.c:2916-2920`, `verbose_setter`) — a truthy
 * assignment stores `true`, anything else stores the value itself, so `nil`
 * survives as the "no warnings at all" third state.
 *
 * @noRailsEquivalent PERMANENT — the writer half of {@link verbose}; a TS
 * `set` accessor cannot be a module-level binding.
 */
export function setVerbose(value: unknown): void {
  verboseGlobal = value != null && value !== false ? true : value;
}

/**
 * `$DEBUG` (`vendor/ruby/v3.3.11/ruby.c:2940-2943`, `debug_getter`; `ruby_debug`, set
 * by `-d` / `--debug`).
 * A trails process has no such flag, so it reads `false` until something sets it.
 *
 * @noRailsEquivalent PERMANENT — Ruby core, not Rails: `$DEBUG` is an
 * interpreter global, and `Tempfile::Remover#call` guards its trace on it
 * (`vendor/ruby/v3.3.11/lib/tempfile.rb:315`).
 */
export function debug(): unknown {
  return debugGlobal;
}

/**
 * `$DEBUG=` (`vendor/ruby/v3.3.11/ruby.c:2946-2949`, `debug_setter`), which
 * stores the value as given.
 *
 * @noRailsEquivalent PERMANENT — the writer half of {@link debug}; a TS
 * `set` accessor cannot be a module-level binding.
 */
export function setDebug(value: unknown): void {
  debugGlobal = value;
}
