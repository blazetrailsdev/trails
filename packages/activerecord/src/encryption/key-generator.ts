/**
 * Key generation — derives keys from passwords and generates random keys.
 *
 * Mirrors: ActiveRecord::Encryption::KeyGenerator
 */

import * as crypto from "crypto";

const DEFAULT_KEY_LENGTH = 32; // AES-256

export class KeyGenerator {
  private _hashDigestClass: string;

  constructor(hashDigestClass: string = "SHA256") {
    this._hashDigestClass = hashDigestClass;
  }

  generateRandomKey(length: number = DEFAULT_KEY_LENGTH): string {
    return crypto.randomBytes(length).toString("base64");
  }

  generateRandomHexKey(length: number = DEFAULT_KEY_LENGTH): string {
    return crypto.randomBytes(length).toString("hex");
  }

  deriveKey(password: string, length: number = DEFAULT_KEY_LENGTH, salt?: string): string {
    const effectiveSalt = salt ?? "";
    const digest = this._hashDigestClass.toLowerCase().replace(/-/g, "");
    const derived = crypto.pbkdf2Sync(password, effectiveSalt, 2 ** 16, length, digest);
    return derived.toString("base64");
  }
}
