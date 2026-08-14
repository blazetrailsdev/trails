/**
 * KeyGenerator — derives cryptographic keys using PBKDF2.
 * Mirrors Rails ActiveSupport::KeyGenerator.
 */

import { getCrypto } from "./crypto-adapter.js";

export class KeyGenerator {
  private readonly secret: string;
  private readonly iterations: number;
  private readonly hashDigestClass: string;

  constructor(secret: string, options: { iterations?: number; hashDigestClass?: string } = {}) {
    this.secret = secret;
    this.iterations = options.iterations ?? 65536;
    this.hashDigestClass = options.hashDigestClass ?? "sha1";
  }

  /**
   * generateKey — derives a key of the given length (in bytes) for the given salt.
   * Returns the key as a Buffer.
   */
  generateKey(salt: string, keySize: number = 64): Buffer {
    return getCrypto().pbkdf2Sync(
      this.secret,
      salt,
      this.iterations,
      keySize,
      this.normalizedDigest(),
    );
  }

  /** @internal */
  private normalizedDigest(): string {
    return this.hashDigestClass.toLowerCase().replace(/-/g, "");
  }

  inspect(): string {
    return `#<KeyGenerator secret="[FILTERED]" iterations=${this.iterations}>`;
  }
}

/**
 * CachingKeyGenerator — wraps KeyGenerator with a memoization cache.
 * Mirrors Rails ActiveSupport::CachingKeyGenerator.
 */
export class CachingKeyGenerator {
  private readonly generator: KeyGenerator;
  private readonly cache = new Map<string, Buffer>();

  constructor(generator: KeyGenerator) {
    this.generator = generator;
  }

  generateKey(salt: string, keySize: number = 64): Buffer {
    const cacheKey = `${salt}|${keySize}`;
    if (!this.cache.has(cacheKey)) {
      this.cache.set(cacheKey, this.generator.generateKey(salt, keySize));
    }
    return this.cache.get(cacheKey)!;
  }
}
