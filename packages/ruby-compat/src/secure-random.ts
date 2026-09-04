import { getCrypto } from "./crypto-adapter.js";
import type { Bytes } from "./fs-adapter.js";
import { NotImplementedError } from "./not-implemented-error.js";

/**
 * `SecureRandom` (`vendor/ruby/lib/securerandom.rb:41`), extended with
 * `Random::Formatter` (`securerandom.rb:93`) so `random_bytes`, `hex` and
 * `uuid` are available on it the way every caller uses them.
 *
 * `gen_random` is the `Random.urandom` arm (`securerandom.rb:64-73`); the
 * crypto adapter is the system random device. `Random.urandom` answers `nil`
 * where `getCrypto()` raises, so the raise is caught back into that `nil` and
 * the guard below raises the `NotImplementedError` Ruby raises. Bytes are a
 * Ruby binary String, so `unpack1("H*")` is `toString("hex")`.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `SecureRandom` ships
 * with the interpreter and no Rails file defines it, but
 * `Rack::Session::Abstract::ID::DEFAULT_OPTIONS[:secure_random]` IS it
 * (`rack-session/lib/rack/session/abstract/id.rb:252`), so the port cannot
 * seat that constant without it.
 */
export const SecureRandom = {
  /** @noRailsEquivalent PERMANENT — vendor/ruby/lib/securerandom.rb:50 */
  bytes(n: number): Bytes {
    return SecureRandom.genRandom(n);
  },

  /** @noRailsEquivalent PERMANENT — vendor/ruby/lib/securerandom.rb:64 */
  genRandom(n: number): Bytes {
    let ret: Bytes | undefined;
    try {
      ret = getCrypto().randomBytes(n);
    } catch {
      ret = undefined;
    }
    if (!ret) {
      throw new NotImplementedError("No random device");
    }
    if (ret.length !== n) {
      throw new NotImplementedError(
        `Unexpected partial read from random device: only ${ret.length} for ${n} bytes`,
      );
    }
    return ret;
  },

  /** @noRailsEquivalent PERMANENT — vendor/ruby/lib/random/formatter.rb:72 */
  randomBytes(n: number | null = null): Bytes {
    n = n != null ? n : 16;
    return SecureRandom.genRandom(n);
  },

  /** @noRailsEquivalent PERMANENT — vendor/ruby/lib/random/formatter.rb:93 */
  hex(n: number | null = null): string {
    return SecureRandom.randomBytes(n).toString("hex");
  },

  /** @noRailsEquivalent PERMANENT — vendor/ruby/lib/random/formatter.rb:170 */
  uuid(): string {
    const bytes = SecureRandom.randomBytes(16);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ary = [
      view.getUint32(0),
      view.getUint16(4),
      view.getUint16(6),
      view.getUint16(8),
      view.getUint16(10),
      view.getUint32(12),
    ];
    ary[2] = (ary[2] & 0x0fff) | 0x4000;
    ary[3] = (ary[3] & 0x3fff) | 0x8000;
    const hex = (value: number, width: number) => value.toString(16).padStart(width, "0");
    return `${hex(ary[0], 8)}-${hex(ary[1], 4)}-${hex(ary[2], 4)}-${hex(ary[3], 4)}-${hex(ary[4], 4)}${hex(ary[5], 8)}`;
  },
};
