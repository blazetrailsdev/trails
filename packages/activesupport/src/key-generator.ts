/**
 * = Key Generator
 *
 * KeyGenerator is a simple wrapper around OpenSSL's implementation of PBKDF2.
 * It can be used to derive a number of keys for various purposes from a given secret.
 * This lets trails applications have a single secure secret, but avoid reusing that
 * key in multiple incompatible contexts.
 *
 * Mirrors: `active_support/key_generator.rb`.
 */

import { ArgumentError } from "./hash-utils.js";
import { getCrypto } from "./crypto-adapter.js";

// Ruby names a digest with the `OpenSSL::Digest` subclass itself; trails' crypto
// adapter names its digests with the OpenSSL string, so a "digest class" here is
// that string — the same convention `core_ext/digest/uuid.ts` already uses.
const OPENSSL_DIGESTS = new Set(["md5", "sha1", "sha256", "sha384", "sha512"]);

export class KeyGenerator {
  private static _hashDigestClass?: string;

  static set hashDigestClass(klass: string) {
    if (typeof klass === "string" && OPENSSL_DIGESTS.has(klass)) {
      this._hashDigestClass = klass;
    } else {
      throw new ArgumentError(`${String(klass)} is expected to be an OpenSSL::Digest subclass`);
    }
  }

  static get hashDigestClass(): string {
    return (this._hashDigestClass ??= "sha1");
  }

  private readonly secret: string;
  private readonly iterations: number;
  private readonly hashDigestClass: string;

  constructor(secret: string, options: { iterations?: number; hashDigestClass?: string } = {}) {
    this.secret = secret;
    // The default iterations are higher than required for our key derivation uses
    // on the off chance someone uses this for password storage
    //
    // `??`, not `||`: Ruby's `||` (key_generator.rb:32,35) falls through only for
    // nil/false, so `iterations: 0` is honoured there; JS `||` would swallow it.
    this.iterations = options.iterations ?? 2 ** 16;
    // Also allow configuration here so people can use this to build a rotation
    // scheme when switching the digest class.
    this.hashDigestClass = options.hashDigestClass ?? KeyGenerator.hashDigestClass;
  }

  /**
   * Returns a derived key suitable for use. The default `keySize` is chosen
   * to be compatible with the default settings of MessageVerifier.
   * i.e. `OpenSSL::Digest::SHA1#block_length`
   */
  generateKey(salt: string, keySize: number = 64): Buffer {
    return getCrypto().pbkdf2Sync(
      this.secret,
      salt,
      this.iterations,
      keySize,
      this.hashDigestClass,
    );
  }

  /** :nodoc: */
  inspect(): string {
    return `#<${this.constructor.name}:0x${((objectId(this) << 1) >>> 0).toString(16).padStart(14, "0")}>`;
  }
}

/**
 * = Caching Key Generator
 *
 * CachingKeyGenerator is a wrapper around KeyGenerator which allows users to avoid
 * re-executing the key generation process when it's called using the same `salt` and
 * `keySize`.
 */
export class CachingKeyGenerator {
  private readonly keyGenerator: KeyGenerator;
  private readonly cacheKeys = new Map<string, Buffer>();

  constructor(keyGenerator: KeyGenerator) {
    this.keyGenerator = keyGenerator;
  }

  /** Returns a derived key suitable for use. */
  generateKey(...args: [salt: string, keySize?: number]): Buffer {
    const key = args.join("|");
    let cached = this.cacheKeys.get(key);
    if (cached == null) {
      cached = this.keyGenerator.generateKey(...args);
      this.cacheKeys.set(key, cached);
    }
    return cached;
  }
}

// Ruby's `object_id` — a per-object identity number. JS has none, so identities
// are handed out lazily and remembered on a WeakMap.
const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

function objectId(object: object): number {
  let id = objectIds.get(object);
  if (id == null) {
    id = nextObjectId++;
    objectIds.set(object, id);
  }
  return id;
}
