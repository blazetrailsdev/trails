/**
 * Port of vendor/rails/activerecord/test/cases/secure_token_test.rb
 * Test names match the Rails counterpart.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Base } from "./index.js";
import { User } from "./test-helpers/models/user.js";
import { hasSecureToken, MinimumLengthError } from "./secure-token.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";

describe("SecureTokenTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({ users: TEST_SCHEMA.users });
    await User.loadSchema();
  });

  let user: User;
  beforeEach(() => {
    user = new User();
  });

  // Rails: Class.new(ActiveRecord::Base) { self.table_name = "users"; has_secure_token on: :initialize }
  async function onInitializeModel(): Promise<typeof Base> {
    class TokenUser extends Base {
      static _tableName = "users";
    }
    await TokenUser.loadSchema();
    hasSecureToken(TokenUser, "token", { on: "initialize" });
    return TokenUser;
  }

  it("token values are generated for specified attributes and persisted on save", async () => {
    await user.save();
    expect(user.token).not.toBeNull();
    expect(user.auth_token).not.toBeNull();
    expect((user.token as string).length).toBe(24);
    expect((user.auth_token as string).length).toBe(36);
  });

  it("generating token on initialize does not affect reading from the column", async () => {
    const model = await onInitializeModel();

    const token = "abc123";

    const created = await model.create({ token });

    expect(created.token).toBe(token);
    expect((await created.reload()).token).toBe(token);
    expect((await model.find(created.id)).token).toBe(token);
  });

  it("generating token on initialize happens only once", async () => {
    const model = await onInitializeModel();

    const token = "    ";

    const u = new model();
    await u.update({ token });

    expect(u.token).toBe(token);
    expect((await u.reload()).token).toBe(token);
    expect((await model.find(u.id)).token).toBe(token);
  });

  it("generating token on initialize is skipped if column was not selected", async () => {
    const model = await onInitializeModel();

    await model.create();
    await expect(model.select("id").last()).resolves.not.toThrow();
  });

  it("regenerating the secure token", async () => {
    await user.save();
    const oldToken = user.token;
    const oldAuthToken = user.auth_token;
    await (user as any).regenerateToken();
    await (user as any).regenerateAuthToken();

    expect(user.token).not.toBe(oldToken);
    expect(user.auth_token).not.toBe(oldAuthToken);

    expect((user.token as string).length).toBe(24);
    expect((user.auth_token as string).length).toBe(36);
  });

  it("token value not overwritten when present", async () => {
    user.token = "custom-secure-token";
    await user.save();

    expect(user.token).toBe("custom-secure-token");
  });

  it("token length cannot be less than 24 characters", () => {
    expect(() => hasSecureToken(User, "not_valid_token", { length: 12 })).toThrow(
      MinimumLengthError,
    );
  });

  it("token on callback", async () => {
    const model = await onInitializeModel();

    const u = new model();

    expect((u as any).token).toBeTruthy();
  });

  it("token calls the setter method", async () => {
    // Rails: a model with `has_secure_token on: :initialize` overriding
    //   def token=(value); super; self.modified_token = "#{value}_modified"; end
    // The on-initialize callback assigns via the writer, so the override sees
    // the generated value. We emulate `super` by wrapping the column's own
    // accessor descriptor (installed by loadSchema) before overriding.
    class TokenUser extends Base {
      static _tableName = "users";
    }
    await TokenUser.loadSchema();
    hasSecureToken(TokenUser, "token", { on: "initialize" });

    const proto = TokenUser.prototype as any;
    let superDesc: PropertyDescriptor | undefined;
    for (let p = proto; p && !superDesc; p = Object.getPrototypeOf(p)) {
      superDesc = Object.getOwnPropertyDescriptor(p, "token");
    }
    Object.defineProperty(proto, "token", {
      configurable: true,
      get(this: any) {
        return superDesc!.get!.call(this);
      },
      set(this: any, value: unknown) {
        superDesc!.set!.call(this, value);
        this.modifiedToken = `${value}_modified`;
      },
    });

    const u = new TokenUser();

    expect((u as any).token).toBeTruthy();
    expect((u as any).modifiedToken).toBe(`${(u as any).token}_modified`);
  });
});
