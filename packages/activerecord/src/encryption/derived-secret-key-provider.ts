/**
 * Derived secret key provider — derives keys from passwords.
 *
 * Mirrors: ActiveRecord::Encryption::DerivedSecretKeyProvider
 */

import { Key } from "./key.js";
import { KeyProvider } from "./key-provider.js";

export class DerivedSecretKeyProvider extends KeyProvider {
  constructor(passwords: string | string[]) {
    const passwordList = Array.isArray(passwords) ? passwords : [passwords];
    const keys = passwordList.map((p) => Key.deriveFrom(p));
    super(keys);
  }
}
