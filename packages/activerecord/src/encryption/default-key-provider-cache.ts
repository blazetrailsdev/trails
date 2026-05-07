/**
 * Module-level single-entry cache for the default key provider. Shared across
 * all Scheme and Encryptor instances so PBKDF2 runs once per
 * (primaryKey, salt, digest) tuple.
 */

import { Configurable } from "./configurable.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";

let _entry: DerivedSecretKeyProvider | undefined;
let _sig: string | undefined;

function stableKeySignature(
  primaryKey: string | string[],
  keyDerivationSalt: string | undefined,
  hashDigestClass: string,
): string {
  // JSON.stringify preserves array order (key rotation order is semantically
  // meaningful) and is unambiguous — no comma-collision risk from key strings.
  // Use null for undefined so missing salt is distinct from empty-string salt,
  // ensuring cache invalidation when keyDerivationSalt is cleared.
  // Normalize digest the same way KeyGenerator does (lowercase, no hyphens)
  // so "SHA-256" and "sha256" resolve to the same cache entry.
  const digest = hashDigestClass.toLowerCase().replace(/-/g, "");
  return JSON.stringify([primaryKey, keyDerivationSalt ?? null, digest]);
}

export function getOrCreateDefaultKeyProvider(
  primaryKey: string | string[],
  keyDerivationSalt: string | undefined,
  hashDigestClass: string,
): DerivedSecretKeyProvider {
  const sig = stableKeySignature(primaryKey, keyDerivationSalt, hashDigestClass);
  if (!_entry || _sig !== sig) {
    _entry = new DerivedSecretKeyProvider(primaryKey);
    _sig = sig;
  }
  return _entry;
}

export function clearDefaultKeyProviderCache(): void {
  _entry = undefined;
  _sig = undefined;
}

// Single onConfigure hook covers all consumers (Scheme, Encryptor).
Configurable.onConfigure(clearDefaultKeyProviderCache);
