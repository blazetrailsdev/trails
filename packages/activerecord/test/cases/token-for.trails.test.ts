import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { User } from "../models/user.js";
import { Base } from "../../lib/base.js";
import { Relation } from "../../lib/relation.js";
import { RelationMethods, type TokenDefinition } from "../../lib/token-for.js";
import { fetch } from "@blazetrails/ruby-compat";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { fixtures } from "../support/use-fixtures.js";

class TokenUser extends User {
  static {
    this.generatesTokenFor("lookup");
    this.generatesTokenFor("token_snapshot", {}, function (this: TokenUser) {
      return this.token;
    });
  }
}

describe("token-for relation finders", () => {
  fixtures([], { useTransactionalTests: false });
  beforeAll(async () => {
    await TokenUser.loadSchema();
  });

  let originalVerifier: MessageVerifier | null;
  beforeEach(() => {
    originalVerifier = Base.generatedTokenVerifier;
    Base.generatedTokenVerifier = new MessageVerifier("secret");
  });
  afterEach(async () => {
    Base.generatedTokenVerifier = originalVerifier;
    await TokenUser.deleteAll();
  });

  it("evaluates the token block in the context of the record", async () => {
    const user = await TokenUser.create({ token: "first" });
    const token = user.generateTokenFor("token_snapshot");
    expect(await TokenUser.findByTokenFor("token_snapshot", token)).not.toBeNull();

    await user.update({ token: "second" });
    expect(await TokenUser.findByTokenFor("token_snapshot", token)).toBeNull();
  });

  it("signs an id past Number.MAX_SAFE_INTEGER as its exact digits, not a rounded number", () => {
    const user = new TokenUser();
    user.id = 2n ** 60n + 1n;
    const token = user.generateTokenFor("lookup");
    const definition = fetch<TokenDefinition>(TokenUser.tokenDefinitions, "lookup");
    expect(
      definition.messageVerifier().verified(token, { purpose: definition.fullPurpose() }),
    ).toEqual(["1152921504606846977"]);
  });

  it("raises Ruby's Hash#fetch KeyError when a relation looks up an unknown purpose", async () => {
    await expect(TokenUser.where("1=1").findByTokenFor("bad", "token")).rejects.toThrow(
      /key not found: "bad"/,
    );
    await expect(TokenUser.where("1=1").findByTokenForBang("bad", "token")).rejects.toThrow(
      /key not found: "bad"/,
    );
  });

  it("Relation includes TokenFor::RelationMethods", () => {
    expect(Relation.prototype.findByTokenFor).toBe(RelationMethods.prototype.findByTokenFor);
    expect(Relation.prototype.findByTokenForBang).toBe(
      RelationMethods.prototype.findByTokenForBang,
    );
  });
});
