/**
 * Key generation — derives keys from passwords and generates random keys.
 *
 * Mirrors: ActiveRecord::Encryption::KeyGenerator
 */

import { getCrypto } from "@blazetrails/activesupport";
import { KeyGenerator as AsKeyGenerator } from "@blazetrails/activesupport/key-generator";

import { Configurable } from "./configurable-slot.js";

export class KeyGenerator {
  private _hashDigestClass: string;

  constructor(hashDigestClass?: string) {
    this._hashDigestClass = hashDigestClass ?? Configurable.config.hashDigestClass;
  }

  get hashDigestClass(): string {
    return this._hashDigestClass;
  }

  deriveKeyFrom(password: string, length?: number): string {
    const salt = this.keyDerivationSalt();
    const generator = new AsKeyGenerator(password, { hashDigestClass: this.hashDigestClass });
    return generator.generateKey(salt, length ?? this.keyLength()).toString("base64");
  }

  generateRandomKey({ length = this.keyLength() }: { length?: number } = {}): string {
    return getCrypto().randomBytes(length).toString("base64");
  }

  generateRandomHexKey({ length = this.keyLength() }: { length?: number } = {}): string {
    // `generateRandomKey` hands the raw bytes back base64-encoded where Ruby
    // returns a binary String, so Rails' `unpack("H*")[0]` re-encodes through
    // that buffer (key_generator.rb:31).
    return Buffer.from(this.generateRandomKey({ length }), "base64").toString("hex");
  }

  deriveKey(password: string, length?: number, salt?: string): string {
    const effectiveLength = length ?? this.keyLength();
    const crypto = getCrypto();
    const effectiveSalt = salt ?? "";
    const digest = this._hashDigestClass.toLowerCase().replace(/-/g, "");
    const derived = crypto.pbkdf2Sync(password, effectiveSalt, 2 ** 16, effectiveLength, digest);
    return derived.toString("base64");
  }

  /** @internal */
  private keyDerivationSalt(): string {
    return Configurable.config.keyDerivationSalt;
  }

  /** @internal */
  private keyLength(): number {
    return 32; // AES-256 key length, mirrors Cipher.key_length
  }
}
