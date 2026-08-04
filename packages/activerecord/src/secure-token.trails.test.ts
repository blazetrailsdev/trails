/**
 * TS-only cover for `has_secure_token`'s dispatch through
 * `self.class.generate_unique_secure_token` (secure_token.rb:51,54). Rails gets
 * the override point for free from `ClassMethods`; trails installs the class
 * method from `hasSecureToken`, so the routing needs its own test.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";

import { Base } from "./index.js";
import { hasSecureToken } from "./secure-token.js";
import { fixtures } from "./test-fixtures.js";

describe("SecureTokenTest", () => {
  fixtures([]);

  class OverridingUser extends Base {
    static _tableName = "users";
    static generateUniqueSecureToken(length: number = 24): string {
      return "x".repeat(length);
    }
  }

  beforeAll(async () => {
    await OverridingUser.loadSchema();
    hasSecureToken(OverridingUser, "token");
  });

  interface TokenRecord {
    token: string;
    regenerateToken(): Promise<unknown>;
  }

  let user: OverridingUser;
  beforeEach(() => {
    user = new OverridingUser();
  });

  it("an overridden generate_unique_secure_token is used on create", async () => {
    await user.save();

    expect((user as unknown as TokenRecord).token).toBe("x".repeat(24));
  });

  it("an overridden generate_unique_secure_token is used when regenerating", async () => {
    await user.save();
    (user as unknown as TokenRecord).token = "custom-secure-token";
    await user.save();

    await (user as unknown as TokenRecord).regenerateToken();

    expect((user as unknown as TokenRecord).token).toBe("x".repeat(24));
  });
});
