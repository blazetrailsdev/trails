import { kernelArray as Array } from "@blazetrails/activesupport";
import { Encryption } from "../namespaces.js";
import { Key } from "./key.js";
import { KeyProvider } from "./key-provider.js";
import type { KeyGenerator } from "./key-generator.js";

export class DerivedSecretKeyProvider extends KeyProvider {
  constructor(
    passwords: string | string[],
    {
      keyGenerator = Encryption.keyGenerator as KeyGenerator,
    }: { keyGenerator?: KeyGenerator } = {},
  ) {
    super([]);
    this._keys = Array(passwords).map((password) =>
      this.deriveKeyFrom(password, { using: keyGenerator }),
    );
  }

  /** @internal */
  private deriveKeyFrom(password: string, { using }: { using: KeyGenerator }): Key {
    const secret = using.deriveKeyFrom(password);
    return new Key(secret);
  }
}

Encryption.DerivedSecretKeyProvider = DerivedSecretKeyProvider;
