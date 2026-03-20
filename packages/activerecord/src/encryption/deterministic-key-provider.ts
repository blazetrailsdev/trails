/**
 * Deterministic key provider — uses a single key for deterministic encryption.
 *
 * Mirrors: ActiveRecord::Encryption::DeterministicKeyProvider
 */

import { Key } from "./key.js";
import { ConfigError } from "./errors.js";
import { KeyProvider } from "./key-provider.js";

export class DeterministicKeyProvider extends KeyProvider {
  constructor(keys: Key | Key[]) {
    const keyList = Array.isArray(keys) ? keys : [keys];
    if (keyList.length > 1) {
      throw new ConfigError("A DeterministicKeyProvider only supports a single key");
    }
    super(keyList);
  }
}
