import { ArgumentError } from "./hash-utils.js";
import { getCrypto } from "@blazetrails/ruby-compat/crypto-adapter";
import { DigestClass } from "@blazetrails/ruby-compat/digest";
import type { Bytes } from "@blazetrails/ruby-compat/fs-adapter";
import { format } from "@blazetrails/ruby-compat/kernel-format";
import { rbModName, rbObjAsString, rbObjId } from "@blazetrails/ruby-compat/object";
import { OpenSSL } from "@blazetrails/ruby-compat/openssl";

export class KeyGenerator {
  private static _hashDigestClass?: DigestClass;

  static set hashDigestClass(klass: DigestClass) {
    if (klass instanceof DigestClass) {
      this._hashDigestClass = klass;
    } else {
      throw new ArgumentError(
        `${rbObjAsString(klass)} is expected to be an OpenSSL::Digest subclass`,
      );
    }
  }

  static get hashDigestClass(): DigestClass {
    return (this._hashDigestClass ??= OpenSSL.Digest.SHA1);
  }

  private readonly secret: string;
  private readonly iterations: number;
  private readonly hashDigestClass: DigestClass;

  constructor(
    secret: string,
    options: { iterations?: number; hashDigestClass?: DigestClass } = {},
  ) {
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
      this.hashDigestClass.algorithm,
    );
  }

  inspect(): string {
    return `#<${rbModName(this.constructor)}:${format("%#016x", rbObjId(this) * 2)}>`;
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
