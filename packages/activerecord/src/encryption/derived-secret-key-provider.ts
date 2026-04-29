/**
 * Derived secret key provider — derives keys from passwords.
 *
 * Mirrors: ActiveRecord::Encryption::DerivedSecretKeyProvider
 */

import { NotImplementedError } from "../errors.js";
import { Key } from "./key.js";
import { KeyProvider } from "./key-provider.js";
import { KeyGenerator } from "./key-generator.js";

export class DerivedSecretKeyProvider extends KeyProvider {
  constructor(passwords: string | string[], options?: { keyGenerator?: KeyGenerator }) {
    const passwordList = Array.isArray(passwords) ? passwords : [passwords];
    const generator = options?.keyGenerator ?? new KeyGenerator();
    // Mirror Rails: uses key_generator.derive_key_from(password) which applies
    // config.key_derivation_salt. deriveKeyFrom raises ConfigError if the salt
    // is not configured, matching Rails' required-key semantics.
    const keys = passwordList.map((p) => new Key(generator.deriveKeyFrom(p)));
    super(keys);
  }
}

/** @internal */
function deriveKeyFrom(password: any, using?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::DerivedSecretKeyProvider#derive_key_from is not implemented",
  );
}
