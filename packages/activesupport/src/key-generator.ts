import { ArgumentError } from "./hash-utils.js";
import { getCrypto, type Bytes } from "@blazetrails/ruby-compat";

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
    this.iterations = options.iterations ?? 2 ** 16;
    this.hashDigestClass = options.hashDigestClass ?? KeyGenerator.hashDigestClass;
  }

  generateKey(salt: string, keySize: number = 64): Bytes {
    return getCrypto().pbkdf2Sync(
      this.secret,
      salt,
      this.iterations,
      keySize,
      this.hashDigestClass,
    );
  }

  inspect(): string {
    return `#<${this.constructor.name}:0x${((objectId(this) << 1) >>> 0).toString(16).padStart(14, "0")}>`;
  }
}

export class CachingKeyGenerator {
  private readonly keyGenerator: KeyGenerator;
  private readonly cacheKeys = new Map<string, Bytes>();

  constructor(keyGenerator: KeyGenerator) {
    this.keyGenerator = keyGenerator;
  }

  generateKey(...args: [salt: string, keySize?: number]): Bytes {
    const key = args.join("|");
    let cached = this.cacheKeys.get(key);
    if (cached == null) {
      cached = this.keyGenerator.generateKey(...args);
      this.cacheKeys.set(key, cached);
    }
    return cached;
  }
}

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
