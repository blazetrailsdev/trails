import { SecureRandom, type DigestClass } from "@blazetrails/ruby-compat";
import { KeyGenerator as AsKeyGenerator } from "@blazetrails/activesupport/key-generator";

import { Encryption } from "../namespaces.js";

export class KeyGenerator {
  private _hashDigestClass: DigestClass;

  constructor({
    hashDigestClass = Encryption.config.hashDigestClass,
  }: { hashDigestClass?: DigestClass } = {}) {
    this._hashDigestClass = hashDigestClass;
  }

  get hashDigestClass(): DigestClass {
    return this._hashDigestClass;
  }

  generateRandomKey({ length = this.keyLength() }: { length?: number } = {}): string {
    return SecureRandom.randomBytes(length).toString("base64");
  }

  generateRandomHexKey({ length = this.keyLength() }: { length?: number } = {}): string {
    return Buffer.from(this.generateRandomKey({ length }), "base64").toString("hex");
  }

  deriveKeyFrom(password: string, { length = this.keyLength() }: { length?: number } = {}): string {
    const generator = new AsKeyGenerator(password, { hashDigestClass: this.hashDigestClass });
    return generator.generateKey(this.keyDerivationSalt(), length).toString("base64");
  }

  /** @internal */
  private keyDerivationSalt(): string {
    return Encryption.config.keyDerivationSalt;
  }

  /** @internal */
  private keyLength(): number {
    return 32;
  }
}

Encryption.KeyGenerator = KeyGenerator;
