import { getProcessAdapter } from "./process-adapter.js";

/**
 * `RUBY_PLATFORM` (`vendor/ruby/version.c:103`), the global constant naming the
 * platform the interpreter was built for — what
 * `Rack::RewindableInput#filesystem_has_posix_semantics?`
 * (`rack/lib/rack/rewindable_input.rb:109-111`) is reading when it matches
 * `/(mswin|mingw|cygwin|java)/`.
 *
 * Two things differ from MRI's, and both are the host's rather than a choice.
 * It is a function where Ruby's is a String, because the trails reading comes
 * from the registered process adapter that a non-Node host swaps at boot, while
 * MRI's platform is fixed at compile time (`version.c:66`). And the reading is
 * the host's own spelling — `"linux"`, `"darwin"`, `"win32"` — where MRI names
 * a build triplet (`"x86_64-linux"`, `"x64-mingw-ucrt"`), because a JS host
 * publishes no triplet to translate one from; so a caller matching on it
 * matches the host's names, not Ruby's.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `RUBY_PLATFORM`
 * (`vendor/ruby/version.c:103`), which Rails reads without defining.
 */
export function RUBY_PLATFORM(): string {
  return getProcessAdapter().platform();
}
