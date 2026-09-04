import { getCrypto } from "./crypto-adapter.js";
import type { Bytes } from "./fs-adapter.js";

/**
 * One `Digest::Class` subclass (`vendor/ruby/ext/digest/lib/digest.rb:20`) —
 * the three class methods every Rails caller reaches for, over the algorithm
 * the constant names.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Digest::Class`
 * (`vendor/ruby/ext/digest/lib/digest.rb:20`), which Rails calls
 * (`activerecord/lib/active_record/encryption/key.rb:24`) without defining.
 */
class DigestClass {
  /** @noRailsEquivalent PERMANENT */
  readonly algorithm: string;

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/digest/lib/digest.rb:20 */
  constructor(algorithm: string) {
    this.algorithm = algorithm;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/digest/digest.c:614 */
  digest(data: string | Uint8Array): Bytes {
    return getCrypto().createHash(this.algorithm).update(data).digest();
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/digest/digest.c:645 */
  hexdigest(data: string | Uint8Array): string {
    return getCrypto().createHash(this.algorithm).update(data).digest("hex");
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/digest/digest.c:676 */
  base64digest(data: string | Uint8Array): string {
    return getCrypto().createHash(this.algorithm).update(data).digest("base64");
  }
}

/**
 * `Digest` (`vendor/ruby/ext/digest/lib/digest.rb:8`), the three constants
 * Rails names — `Digest::MD5` (`activesupport/lib/active_support/digest.rb:9`),
 * `Digest::SHA1` (`activerecord/lib/active_record/encryption/key.rb:24`) and
 * `Digest::SHA256`
 * (`activesupport/lib/active_support/notifications/fanout.rb`).
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Digest`
 * (`vendor/ruby/ext/digest/lib/digest.rb:8`), which no Rails file defines.
 */
export const Digest = {
  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/digest/md5/md5init.c:41 */
  MD5: new DigestClass("md5"),
  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/digest/sha1/sha1init.c:41 */
  SHA1: new DigestClass("sha1"),
  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/digest/sha2/lib/sha2.rb:44 */
  SHA256: new DigestClass("sha256"),
};
