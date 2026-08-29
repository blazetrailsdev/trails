import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { User } from "./test-helpers/models/user.js";
import { setTokenForSecret } from "./token-for.js";
import { Base } from "./base.js";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { fixtures } from "./test-fixtures.js";

class TokenUser extends User {
  static {
    this.generatesTokenFor("lookup");
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

  it("keeps an explicitly assigned generated_token_verifier when the secret seam re-runs", () => {
    const explicit = new MessageVerifier("explicit");
    Base.generatedTokenVerifier = explicit;

    setTokenForSecret("another secret");

    expect(Base.generatedTokenVerifier).toBe(explicit);
    Base.generatedTokenVerifier = null;
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
