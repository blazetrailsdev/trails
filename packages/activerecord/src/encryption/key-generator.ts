/**
 * Key generation — derives keys from passwords and generates random keys.
 *
 * Mirrors: ActiveRecord::Encryption::KeyGenerator
 */

import { NotImplementedError } from "../errors.js";
import { getCrypto } from "@blazetrails/activesupport";
import { Configurable } from "./configurable.js";

const DEFAULT_KEY_LENGTH = 32; // AES-256

export class KeyGenerator {
  private _hashDigestClass: string;

  constructor(hashDigestClass?: string) {
    this._hashDigestClass = hashDigestClass ?? Configurable.config.hashDigestClass;
  }

  get hashDigestClass(): string {
    return this._hashDigestClass;
  }

  deriveKeyFrom(password: string, length: number = DEFAULT_KEY_LENGTH): string {
    const salt = Configurable.config.get("keyDerivationSalt") as string;
    return this.deriveKey(password, length, salt);
  }

  generateRandomKey(length: number = DEFAULT_KEY_LENGTH): string {
    return getCrypto().randomBytes(length).toString("base64");
  }

  generateRandomHexKey(length: number = DEFAULT_KEY_LENGTH): string {
    return getCrypto().randomBytes(length).toString("hex");
  }

  deriveKey(password: string, length: number = DEFAULT_KEY_LENGTH, salt?: string): string {
    const crypto = getCrypto();
    const effectiveSalt = salt ?? "";
    const digest = this._hashDigestClass.toLowerCase().replace(/-/g, "");
    const derived = crypto.pbkdf2Sync(password, effectiveSalt, 2 ** 16, length, digest);
    return derived.toString("base64");
  }
}

function keyDerivationSalt(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::KeyGenerator#key_derivation_salt is not implemented",
  );
}

function keyLength(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::KeyGenerator#key_length is not implemented",
  );
}
