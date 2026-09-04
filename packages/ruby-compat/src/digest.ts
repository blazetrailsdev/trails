import { getCrypto, type HashAdapter } from "./crypto-adapter.js";

/**
 * One `Digest::Class` subclass (`vendor/ruby/ext/digest/lib/digest.rb:20`),
 * over the algorithm the constant names.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Digest::Class`
 * (`vendor/ruby/ext/digest/lib/digest.rb:20`), which Rails calls
 * (`activerecord/lib/active_record/encryption/key.rb:24`) without defining.
 */
export class DigestClass {
  /** @noRailsEquivalent PERMANENT */
  readonly algorithm: string;

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/digest/lib/digest.rb:20 */
  constructor(algorithm: string) {
    this.algorithm = algorithm;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/digest/lib/digest.rb:26 */
  new(): DigestInstance {
    return new DigestInstance(this.algorithm);
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/digest/digest.c:645 */
  hexdigest(data: string | Uint8Array): string {
    return getCrypto().createHash(this.algorithm).update(data).digest("hex");
  }
}

/**
 * The running digest `Digest::Class.new` answers, which
 * `Rack::ETag#digest_body` feeds part by part (`vendor/rack/lib/rack/etag.rb:65`).
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Digest::Instance`
 * (`vendor/ruby/ext/digest/lib/digest.rb:60`), which Rack calls without
 * defining.
 */
export class DigestInstance {
  private readonly impl: HashAdapter;

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/digest/digest.c:339 */
  constructor(algorithm: string) {
    this.impl = getCrypto().createHash(algorithm);
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/digest/digest.c:143 */
  update(data: string | Uint8Array): this {
    this.impl.update(data);
    return this;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/digest/digest.c:245 */
  hexdigest(): string {
    return this.impl.digest("hex");
  }
}

/**
 * `Digest` (`vendor/ruby/ext/digest/lib/digest.rb:8`), the three constants
 * Rails names — `Digest::MD5` (`digest.rb:9`), `Digest::SHA1`
 * (`encryption/key.rb:24`) and `Digest::SHA256` (`rack/etag.rb:65`).
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
