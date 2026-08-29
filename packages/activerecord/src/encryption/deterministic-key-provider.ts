import { Configuration } from "./errors.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";

export class DeterministicKeyProvider extends DerivedSecretKeyProvider {
  constructor(passwords: string | string[]) {
    const passwordList = Array.isArray(passwords) ? passwords : [passwords];
    if (passwordList.length > 1) {
      throw new Configuration("Deterministic encryption keys can't be rotated");
    }
    super(passwordList);
  }
}
