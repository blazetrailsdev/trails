import { getCrypto, type CipherAdapter, type DecipherAdapter } from "./crypto-adapter.js";
import type { Bytes } from "./fs-adapter.js";
import { Digest } from "./digest.js";
import { SecureRandom } from "./secure-random.js";

/**
 * `OpenSSL::Cipher` (`vendor/ruby/ext/openssl/lib/openssl/cipher.rb:16`), the
 * sliver Rails drives (`message_encryptor.rb:276-290`).
 *
 * @noRailsEquivalent PERMANENT — Ruby's openssl extension
 * (`vendor/ruby/ext/openssl/lib/openssl/cipher.rb:16`), which Rails calls
 * without defining.
 */
export class Cipher {
  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/openssl/ossl_cipher.c:355 */
  readonly name: string;

  private mode: "encrypt" | "decrypt" | null = null;
  private currentKey: Uint8Array | null = null;
  private currentIv: Uint8Array | null = null;
  private impl: CipherAdapter | DecipherAdapter | null = null;

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/openssl/ossl_cipher.c:139 */
  constructor(name: string) {
    this.name = name;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/openssl/ossl_cipher.c:824 */
  get keyLen(): number {
    return this.cipherInfo().keyLength;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/openssl/ossl_cipher.c:868 */
  get ivLen(): number {
    return this.cipherInfo().ivLength;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/openssl/ossl_cipher.c:283 */
  encrypt(): this {
    this.mode = "encrypt";
    return this;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/openssl/ossl_cipher.c:302 */
  decrypt(): this {
    this.mode = "decrypt";
    return this;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/openssl/ossl_cipher.c:840 */
  set key(key: Uint8Array) {
    this.currentKey = key;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/openssl/ossl_cipher.c:884 */
  set iv(iv: Uint8Array) {
    this.currentIv = iv;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/openssl/lib/openssl/cipher.rb:56 */
  randomIv(): Bytes {
    const str = SecureRandom.randomBytes(this.ivLen);
    this.currentIv = str;
    return str;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/openssl/ossl_cipher.c:920 */
  set authTag(tag: Uint8Array) {
    const impl = this.started();
    if (!impl.setAuthTag) {
      throw new Error("Crypto adapter does not support GCM auth tags (setAuthTag)");
    }
    impl.setAuthTag(tag);
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/openssl/ossl_cipher.c:898 */
  get authTag(): Bytes {
    const impl = this.started() as CipherAdapter;
    if (!impl.getAuthTag) {
      throw new Error("Crypto adapter does not support GCM auth tags (getAuthTag)");
    }
    return impl.getAuthTag();
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/openssl/ossl_cipher.c:958 */
  set authData(data: Uint8Array | string) {
    const impl = this.started();
    if (!impl.setAAD) {
      throw new Error("Crypto adapter does not support AEAD auth data (setAAD)");
    }
    impl.setAAD(typeof data === "string" ? new TextEncoder().encode(data) : data);
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/openssl/ossl_cipher.c:504 */
  update(data: Uint8Array): Bytes {
    return (this.started() as CipherAdapter).update(data);
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/openssl/ossl_cipher.c:568 */
  final(): Bytes {
    return (this.started() as CipherAdapter).final();
  }

  private cipherInfo(): { keyLength: number; ivLength: number } {
    const crypto = getCrypto();
    const info = crypto.getCipherInfo?.(this.name);
    if (!info) {
      throw new Error(`Crypto adapter does not know cipher "${this.name}" (getCipherInfo)`);
    }
    return info;
  }

  private started(): CipherAdapter | DecipherAdapter {
    if (this.impl) return this.impl;
    if (!this.mode) throw new Error("Cipher mode not set: call encrypt() or decrypt() first");
    if (!this.currentKey) throw new Error("Cipher key not set");
    if (!this.currentIv) throw new Error("Cipher iv not set");
    const crypto = getCrypto();
    this.impl =
      this.mode === "encrypt"
        ? crypto.createCipheriv(this.name, this.currentKey, this.currentIv)
        : crypto.createDecipheriv(this.name, this.currentKey, this.currentIv);
    return this.impl;
  }
}

/**
 * `OpenSSL::HMAC` (`vendor/ruby/ext/openssl/lib/openssl/hmac.rb:4`), the two
 * class methods Rails calls (`request_forgery_protection.rb:466`,
 * `message_verifier.rb:353`).
 *
 * @noRailsEquivalent PERMANENT — Ruby's openssl extension
 * (`vendor/ruby/ext/openssl/lib/openssl/hmac.rb:4`), which Rails calls without
 * defining.
 */
export const HMAC = {
  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/openssl/lib/openssl/hmac.rb:34 */
  digest(digest: string, key: string | Uint8Array, data: string | Uint8Array): Bytes {
    return getCrypto().createHmac(digest, key).update(data).digest();
  },

  /** @noRailsEquivalent PERMANENT — vendor/ruby/ext/openssl/lib/openssl/hmac.rb:56 */
  hexdigest(digest: string, key: string | Uint8Array, data: string | Uint8Array): string {
    return getCrypto().createHmac(digest, key).update(data).digest("hex");
  },
};

/**
 * `OpenSSL` (`vendor/ruby/ext/openssl/lib/openssl.rb:16`), so a ported body
 * spells `OpenSSL::HMAC.digest` the way the Ruby does.
 *
 * `OpenSSL::Digest::MD5` / `SHA1` / `SHA256`
 * (`vendor/ruby/ext/openssl/ossl_digest.c:400`) are the same three algorithms
 * `Digest::MD5` / `SHA1` / `SHA256` name, over the same adapter, so the seat
 * holds one pair of constants rather than two.
 *
 * @noRailsEquivalent PERMANENT — Ruby's openssl extension
 * (`vendor/ruby/ext/openssl/lib/openssl.rb:16`), which no Rails file defines.
 */
export const OpenSSL = { Cipher, HMAC, Digest };
