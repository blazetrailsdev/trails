import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { Account } from "./test-helpers/models/account.js";
import { fixtures } from "./test-helpers/use-fixtures.js";

describe("SignedIdTrailsTest", () => {
  fixtures({});

  it("a subclass builds its own verifier rather than reading Base's memo", () => {
    const baseSecret = Base.signedIdVerifierSecret;
    const accountSecret = Object.getOwnPropertyDescriptor(Account, "signedIdVerifierSecret");
    try {
      Base.signedIdVerifierSecret = "base secret";
      (Base as unknown as { _signedIdVerifier: unknown })._signedIdVerifier = null;
      const baseVerifier = Base.signedIdVerifier;

      class AccountWithOwnSecret extends Account {}
      AccountWithOwnSecret.signedIdVerifierSecret = "account secret";

      const accountVerifier = AccountWithOwnSecret.signedIdVerifier;
      expect(accountVerifier).not.toBe(baseVerifier);
      expect(accountVerifier.verified(baseVerifier.generate("x"))).toBeNull();
      expect(AccountWithOwnSecret.signedIdVerifier).toBe(accountVerifier);
      expect(Base.signedIdVerifier).toBe(baseVerifier);
    } finally {
      Base.signedIdVerifierSecret = baseSecret;
      (Base as unknown as { _signedIdVerifier: unknown })._signedIdVerifier = null;
      if (accountSecret) Object.defineProperty(Account, "signedIdVerifierSecret", accountSecret);
    }
  });
});
