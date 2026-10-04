import { kernelArray as Array } from "@blazetrails/activesupport";
import { Encryption } from "../namespaces.js";
import { Key } from "./key.js";
import { KeyProvider } from "./key-provider.js";
import type { KeyGenerator } from "./key-generator.js";

export class DerivedSecretKeyProvider extends KeyProvider {
  private _keyGenerator: KeyGenerator;

  constructor(
    passwords: string | string[],
    {
      keyGenerator = Encryption.keyGenerator as KeyGenerator,
    }: { keyGenerator?: KeyGenerator } = {},
  ) {
    super(
      Array(passwords).map((password) =>
        DerivedSecretKeyProvider.prototype.deriveKeyFrom.call(
          {} as DerivedSecretKeyProvider,
          password,
          { using: keyGenerator },
        ),
      ),
    );
    this._keyGenerator = keyGenerator;
  }

  /** @internal */
  private deriveKeyFrom(
    password: string,
    { using = this._keyGenerator }: { using?: KeyGenerator } = {},
  ): Key {
    const secret = using.deriveKeyFrom(password);
    return new Key(secret);
  }
}

Encryption.DerivedSecretKeyProvider = DerivedSecretKeyProvider;
