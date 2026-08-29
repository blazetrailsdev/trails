import { Key } from "./key.js";
import { KeyProvider } from "./key-provider.js";
import { KeyGenerator } from "./key-generator.js";

export class DerivedSecretKeyProvider extends KeyProvider {
  private _keyGenerator: KeyGenerator;

  constructor(passwords: string | string[], options?: { keyGenerator?: KeyGenerator }) {
    const passwordList = Array.isArray(passwords) ? passwords : [passwords];
    const keyGenerator = options?.keyGenerator ?? new KeyGenerator();
    super(
      passwordList.map((password) =>
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
