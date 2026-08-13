/**
 * Trails-only coverage for token-for finders. Rails' token_for_test.rb exercises
 * the unknown-purpose raise through the class-level finder only
 * ("raises when token definition does not exist"); these cases pin the
 * `token_definitions.fetch(purpose)` raise that Relation#find_by_token_for and
 * #find_by_token_for! go through (token_for.rb:42-51).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { User } from "./test-helpers/models/user.js";
import { setTokenForSecret } from "./token-for.js";
import { fixtures } from "./test-fixtures.js";

class TokenUser extends User {
  static {
    this.generatesTokenFor("lookup");
    // token_for.rb:24 — `model.instance_eval(&block)`, so a receiver-less body
    // reads the model. A `function` block is trails' spelling of that; an arrow
    // takes the same value from its `model` parameter.
    this.generatesTokenFor("token_snapshot", {
      block: function (this: TokenUser) {
        return this.token;
      },
    });
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

  it("evaluates the token block in the context of the record", async () => {
    const user = await TokenUser.create({ token: "first" });
    const token = user.generateTokenFor("token_snapshot");
    expect(await TokenUser.findByTokenFor("token_snapshot", token)).not.toBeNull();

    await user.update({ token: "second" });
    expect(await TokenUser.findByTokenFor("token_snapshot", token)).toBeNull();
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
