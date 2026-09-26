import { getCrypto, type HashAdapter } from "./crypto-adapter.js";
import type { Bytes } from "./fs-adapter.js";

/**
 * One `Digest::Class` subclass (`vendor/ruby/v3.3.11/ext/digest/lib/digest.rb:20`),
 * over the algorithm the constant names.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Digest::Class`
 * (`vendor/ruby/v3.3.11/ext/digest/lib/digest.rb:20`), which Rails calls
 * (`activerecord/lib/active_record/encryption/key.rb:24`) without defining.
 */
export class DigestClass {
  /** @noRailsEquivalent PERMANENT */
  readonly algorithm: string;

  /**
   * `Module#name` (`vendor/ruby/v3.3.11/object.c:2263`), the constant path this class
   * is bound to, which `Digest::UUID.uuid_from_hash` interpolates into its
   * `ArgumentError` (`activesupport/lib/active_support/core_ext/digest/uuid.rb:25`).
   *
   * @noRailsEquivalent PERMANENT
   */
  readonly name: string;

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/digest/lib/digest.rb:20 */
  constructor(algorithm: string, name: string) {
    this.algorithm = algorithm;
    this.name = name;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/digest/lib/digest.rb:26 */
  new(): DigestInstance {
    return new DigestInstance(this.algorithm);
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/digest/digest.c:645 */
  hexdigest(data: string | Uint8Array): string {
    return getCrypto().createHash(this.algorithm).update(data).digest("hex");
  }
}

/**
 * The running digest `Digest::Class.new` answers, which
 * `Rack::ETag#digest_body` feeds part by part (`vendor/rack/v3.1.14/lib/rack/etag.rb:65`).
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Digest::Instance`
 * (`vendor/ruby/v3.3.11/ext/digest/lib/digest.rb:60`), which Rack calls without
 * defining.
 */
export class DigestInstance {
  /** @noRailsEquivalent PERMANENT */
  readonly algorithm: string;

  private readonly impl: HashAdapter;

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/digest/digest.c:339 */
  constructor(algorithm: string) {
    this.algorithm = algorithm;
    this.impl = getCrypto().createHash(algorithm);
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/digest/digest.c:143 */
  update(data: string | Uint8Array): this {
    this.impl.update(data);
    return this;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/digest/digest.c:245 */
  hexdigest(): string {
    return this.impl.digest("hex");
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/digest/digest.c:225 */
  digest(): Bytes {
    return this.impl.digest();
  }
}

/**
 * `Digest` (`vendor/ruby/v3.3.11/ext/digest/lib/digest.rb:8`), the three constants
 * Rails names — `Digest::MD5` (`digest.rb:9`), `Digest::SHA1`
 * (`encryption/key.rb:24`) and `Digest::SHA256` (`rack/etag.rb:65`).
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Digest`
 * (`vendor/ruby/v3.3.11/ext/digest/lib/digest.rb:8`), which no Rails file defines.
 */
export const Digest = {
  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/digest/md5/md5init.c:41 */
  MD5: new DigestClass("md5", "Digest::MD5"),
  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/digest/sha1/sha1init.c:41 */
  SHA1: new DigestClass("sha1", "Digest::SHA1"),
  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/ext/digest/sha2/lib/sha2.rb:44 */
  SHA256: new DigestClass("sha256", "Digest::SHA256"),
};
