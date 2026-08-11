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
    const keyGenerator = options?.keyGenerator ?? new KeyGenerator();
    // Rails builds the key list by calling the private `derive_key_from` from
    // inside the `super(...)` argument (derived_secret_key_provider.rb:8).
    // Ruby has `self` before `super`; JS does not, so the same body runs
    // unbound off the prototype — passing `using:` explicitly, as Rails does,
    // is what makes the receiver unnecessary.
    super(
      passwordList.map((password) =>
        DerivedSecretKeyProvider.prototype.deriveKeyFrom.call(
          {} as DerivedSecretKeyProvider,
          password,
          { using: keyGenerator },
        ),
      ),
    );
    this._keyGenerator = keyGenerator;
  }

  /** @internal */
  private deriveKeyFrom(
    password: string,
    { using = this._keyGenerator }: { using?: KeyGenerator } = {},
  ): Key {
    const secret = using.deriveKeyFrom(password);
    return new Key(secret);
  }
}
