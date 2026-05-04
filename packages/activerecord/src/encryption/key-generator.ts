/**
 * Key generation — derives keys from passwords and generates random keys.
 *
 * Mirrors: ActiveRecord::Encryption::KeyGenerator
 */

import { getCrypto } from "@blazetrails/activesupport";
import { Configurable } from "./configurable.js";

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
    return this.deriveKey(password, length ?? this.keyLength(), salt);
  }

  generateRandomKey(length?: number): string {
    return getCrypto()
      .randomBytes(length ?? this.keyLength())
      .toString("base64");
  }

  generateRandomHexKey(length?: number): string {
    return getCrypto()
      .randomBytes(length ?? this.keyLength())
      .toString("hex");
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
    return Configurable.config.get("keyDerivationSalt") as string;
  }

  /** @internal */
  private keyLength(): number {
    return 32; // AES-256 key length, mirrors Cipher.key_length
  }
}
