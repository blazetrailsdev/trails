import { describe, it, expect, beforeAll, beforeEach } from "vitest";

import { Base } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { setGenerateSecureTokenOn } from "./active-record.js";

describe("SecureTokenTest", () => {
  fixtures([]);

  class OverridingUser extends Base {
    static _tableName = "users";
    static generateUniqueSecureToken({ length = 24 }: { length?: number } = {}): string {
      return "x".repeat(length);
    }
  }

  beforeAll(async () => {
    await OverridingUser.loadSchema();
    OverridingUser.hasSecureToken("token");
  });

  interface TokenRecord {
    token: string;
    regenerateToken(): Promise<unknown>;
  }

  let user: OverridingUser;
  beforeEach(() => {
    user = new OverridingUser();
  });

  it("generate_unique_secure_token is a class method on every model", () => {
    expect(Base.generateUniqueSecureToken({ length: 24 })).toHaveLength(24);
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

  it("has_secure_token without on: defaults to ActiveRecord.generate_secure_token_on", async () => {
    class InitializeTokenUser extends Base {
      static _tableName = "users";
    }
    await InitializeTokenUser.loadSchema();
    setGenerateSecureTokenOn("initialize");
    try {
      InitializeTokenUser.hasSecureToken("token");
    } finally {
      setGenerateSecureTokenOn("create");
    }

    expect((new InitializeTokenUser() as unknown as TokenRecord).token).toHaveLength(24);
  });
});
