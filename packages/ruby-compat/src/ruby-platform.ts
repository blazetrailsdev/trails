import { getProcessAdapter } from "./process-adapter.js";

const OS_TOKENS: Record<string, string> = {
  win32: "mingw-ucrt",
  sunos: "solaris",
};

/**
 * `RUBY_PLATFORM` (`vendor/ruby/version.c:103`), the global constant naming the
 * platform the interpreter was built for — what
 * `Rack::RewindableInput#filesystem_has_posix_semantics?`
 * (`rack/lib/rack/rewindable_input.rb:109-111`) matches
 * `/(mswin|mingw|cygwin|java)/` against.
 *
 * It is a function where Ruby's is a String, because the trails reading comes
 * from the registered process adapter that a non-Node host swaps at boot, while
 * MRI's platform is fixed at compile time (`version.c:66`).
 *
 * MRI's value is `arch-os`; this is the `os` half alone, because a JS host
 * publishes no `config.guess` triplet to take the `arch` half from — its
 * machine names are its own (`"x64"` where MRI writes `"x86_64"` on Linux and
 * `"x64"` on mingw for the same machine), so a fabricated prefix would be
 * wrong more often than absent. The `os` half is the half Ruby code matches on,
 * and it is spelled as MRI spells it: a Windows host reads `"mingw-ucrt"`,
 * MRI's own default Windows build, rather than the host's `"win32"`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `RUBY_PLATFORM`
 * (`vendor/ruby/version.c:103`), which Rails reads without defining.
 */
export function RUBY_PLATFORM(): string {
  const platform = getProcessAdapter().platform();
  return OS_TOKENS[platform] ?? platform;
}
