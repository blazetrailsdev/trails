/**
 * Trails-only coverage for token-for finders. Rails' token_for_test.rb exercises
 * the unknown-purpose raise through the class-level finder only
 * ("raises when token definition does not exist"); these cases pin the
 * `token_definitions.fetch(purpose)` raise that Relation#find_by_token_for and
 * #find_by_token_for! go through (token_for.rb:42-51).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { User } from "./test-helpers/models/user.js";
import { generatesTokenFor, setTokenForSecret } from "./token-for.js";
import { fixtures } from "./test-fixtures.js";

class TokenUser extends User {
  static {
    generatesTokenFor(this, "lookup");
  }
}

describe("token-for relation finders", () => {
  fixtures([], { useTransactionalTests: false });
  beforeAll(async () => {
    await TokenUser.loadSchema();
  });

  beforeEach(() => setTokenForSecret("secret"));
  afterEach(async () => {
    setTokenForSecret(null);
    await TokenUser.deleteAll();
  });

  it("raises Ruby's Hash#fetch KeyError when a relation looks up an unknown purpose", async () => {
    await expect(TokenUser.where("1=1").findByTokenFor("bad", "token")).rejects.toThrow(
      /key not found: "bad"/,
    );
    await expect(TokenUser.where("1=1").findByTokenForBang("bad", "token")).rejects.toThrow(
      /key not found: "bad"/,
    );
  });
});
