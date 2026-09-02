import { NotImplementedError } from "./not-implemented-error.js";

/**
 * `SecureRandom` (`vendor/ruby/lib/securerandom.rb:41`), extended with
 * `Random::Formatter` (`securerandom.rb:93`) so `random_bytes` and `hex` are
 * available on it the way every caller uses them.
 *
 * `gen_random` is the `Random.urandom` arm (`securerandom.rb:64-73`); Web
 * Crypto's `getRandomValues` is the system random device here, and its absence
 * raises the same `NotImplementedError, "No random device"` Ruby raises.
 *
 * Bytes are a Ruby binary String — one character per byte — as
 * `StringIO`'s buffer is, so `unpack1("H*")` is a per-character hex render.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `SecureRandom` ships
 * with the interpreter and no Rails file defines it, but
 * `Rack::Session::Abstract::ID::DEFAULT_OPTIONS[:secure_random]` IS it
 * (`rack-session/lib/rack/session/abstract/id.rb:252`), so the port cannot
 * seat that constant without it.
 */
export const SecureRandom = {
  /** @noRailsEquivalent PERMANENT — vendor/ruby/lib/securerandom.rb:50 */
  bytes(n: number): string {
    return SecureRandom.genRandom(n);
  },

  /** @noRailsEquivalent PERMANENT — vendor/ruby/lib/securerandom.rb:64 */
  genRandom(n: number): string {
    const ret = (globalThis as { crypto?: Crypto }).crypto?.getRandomValues(new Uint8Array(n));
    if (!ret) {
      throw new NotImplementedError("No random device");
    }
    if (ret.length !== n) {
      throw new NotImplementedError(
        `Unexpected partial read from random device: only ${ret.length} for ${n} bytes`,
      );
    }
    return String.fromCharCode(...ret);
  },

  /** @noRailsEquivalent PERMANENT — vendor/ruby/lib/random/formatter.rb:72 */
  randomBytes(n: number | null = null): string {
    n = n != null ? n : 16;
    return SecureRandom.genRandom(n);
  },

  /** @noRailsEquivalent PERMANENT — vendor/ruby/lib/random/formatter.rb:93 */
  hex(n: number | null = null): string {
    return Array.from(SecureRandom.randomBytes(n), (char) =>
      char.charCodeAt(0).toString(16).padStart(2, "0"),
    ).join("");
  },
};
