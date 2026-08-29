import { Configuration } from "./errors.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";

export class DeterministicKeyProvider extends DerivedSecretKeyProvider {
  constructor(password: string | string[]) {
    const passwords = Array.isArray(password) ? password : [password];
    if (passwords.length > 1) {
      throw new Configuration("Deterministic encryption keys can't be rotated");
    }
    super(passwords);
  }
}
