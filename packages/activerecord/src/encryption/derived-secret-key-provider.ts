/**
 * Derived secret key provider — derives keys from passwords.
 *
 * Mirrors: ActiveRecord::Encryption::DerivedSecretKeyProvider
 */

import { Key } from "./key.js";
import { KeyProvider } from "./key-provider.js";
import { KeyGenerator } from "./key-generator.js";

export class DerivedSecretKeyProvider extends KeyProvider {
  private _keyGenerator: KeyGenerator;

  constructor(passwords: string | string[], options?: { keyGenerator?: KeyGenerator }) {
    const passwordList = Array.isArray(passwords) ? passwords : [passwords];
    const generator = options?.keyGenerator ?? new KeyGenerator();
    const keys = passwordList.map((p) => new Key(generator.deriveKeyFrom(p)));
    super(keys);
    this._keyGenerator = generator;
  }

  /** @internal */
  private deriveKeyFrom(password: string, using: KeyGenerator = this._keyGenerator): Key {
    const secret = using.deriveKeyFrom(password);
    return new Key(secret);
  }
}
