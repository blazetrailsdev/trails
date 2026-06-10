/**
 * Port of vendor/rails/activerecord/test/cases/token_for_test.rb
 * Test names match the Rails counterpart.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { RecordNotFound, registerModel } from "./index.js";
import { User } from "./test-helpers/models/user.js";
import { Matey } from "./test-helpers/models/matey.js";
import { Room } from "./test-helpers/models/room.js";
import { CpkBook } from "./test-helpers/models/cpk/book.js";
import { InvalidSignature } from "@blazetrails/activesupport/message-verifier";
import { travel, travelBack } from "@blazetrails/activesupport";
import { generatesTokenFor, setTokenForSecret } from "./token-for.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";

// Rails: class User < ::User { generates_token_for :lookup; … }
class TokenUser extends User {
  static {
    generatesTokenFor(this, "lookup");
    generatesTokenFor(this, "password_reset", {
      expiresIn: 15 * 60,
      // first 10 characters of the BCrypt salt — Rails: password_digest.to_s[-(31 + 22), 10]
      generator: (r: any) => String(r.password_digest ?? "").slice(-(31 + 22), -(31 + 22) + 10),
    });
    generatesTokenFor(this, "snapshot", {
      generator: (r: any) => ({ updated_at: r.updated_at }),
    });
  }
}

const DAY = 24 * 60 * 60 * 1000;

describe("TokenForTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({
      users: TEST_SCHEMA.users,
      rooms: TEST_SCHEMA.rooms,
      cpk_books: TEST_SCHEMA.cpk_books,
      mateys: TEST_SCHEMA.mateys,
    });
    registerModel(Room);
    await TokenUser.loadSchema();
    await CpkBook.loadSchema();
  });

  let user: TokenUser;
  let lookupToken: string;
  let passwordResetToken: string;
  beforeEach(async () => {
    setTokenForSecret("secret");

    user = new TokenUser();
    (user as any).password_digest = `$2a$4$${"x".repeat(22)}${"y".repeat(31)}`;
    await user.save();
    lookupToken = (user as any).generateTokenFor("lookup");
    passwordResetToken = (user as any).generateTokenFor("password_reset");
  });

  afterEach(() => {
    travelBack();
    setTokenForSecret(null);
  });

  it("finds record by token", async () => {
    expect(((await (TokenUser as any).findByTokenFor("lookup", lookupToken)) as any).id).toBe(
      user.id,
    );
    expect(((await (TokenUser as any).findByTokenForBang("lookup", lookupToken)) as any).id).toBe(
      user.id,
    );
  });

  it("returns nil when record is not found", async () => {
    await user.destroy();
    expect(await (TokenUser as any).findByTokenFor("lookup", lookupToken)).toBeNull();
  });

  it("raises on bang when record is not found", async () => {
    await user.destroy();
    await expect((TokenUser as any).findByTokenForBang("lookup", lookupToken)).rejects.toThrow(
      RecordNotFound,
    );
  });

  it("raises when token definition does not exist", async () => {
    await expect((TokenUser as any).findByTokenFor("bad", lookupToken)).rejects.toThrow();
  });

  it("does not find record when token is invalid", async () => {
    expect(await (TokenUser as any).findByTokenFor("lookup", "bad")).toBeNull();
    await expect((TokenUser as any).findByTokenForBang("lookup", "bad")).rejects.toThrow(
      InvalidSignature,
    );
  });

  it("does not find record when token is for a different purpose", async () => {
    expect(await (TokenUser as any).findByTokenFor("password_reset", lookupToken)).toBeNull();
    await expect(
      (TokenUser as any).findByTokenForBang("password_reset", lookupToken),
    ).rejects.toThrow(InvalidSignature);
  });

  it("finds record when token has not expired and embedded data has not changed", async () => {
    expect(
      ((await (TokenUser as any).findByTokenFor("password_reset", passwordResetToken)) as any).id,
    ).toBe(user.id);
  });

  it("does not find record when token has expired", async () => {
    travel(DAY);
    expect(
      await (TokenUser as any).findByTokenFor("password_reset", passwordResetToken),
    ).toBeNull();
    await expect(
      (TokenUser as any).findByTokenForBang("password_reset", passwordResetToken),
    ).rejects.toThrow(InvalidSignature);
  });

  it("tokens do not expire by default", async () => {
    travel(1000 * 365 * DAY);
    expect(((await (TokenUser as any).findByTokenFor("lookup", lookupToken)) as any).id).toBe(
      user.id,
    );
  });

  it("does not find record when expires_in is different", async () => {
    generatesTokenFor(TokenUser, "lookup", { expiresIn: 365 * DAY });

    try {
      expect(await (TokenUser as any).findByTokenFor("lookup", lookupToken)).toBeNull();
      const newLookupToken = (user as any).generateTokenFor("lookup");
      expect(((await (TokenUser as any).findByTokenFor("lookup", newLookupToken)) as any).id).toBe(
        user.id,
      );
    } finally {
      generatesTokenFor(TokenUser, "lookup");
    }
  });

  it("does not find record when embedded data is different", async () => {
    (user as any).password_digest = "new password";
    await user.save();
    expect(
      await (TokenUser as any).findByTokenFor("password_reset", passwordResetToken),
    ).toBeNull();
    await expect(
      (TokenUser as any).findByTokenForBang("password_reset", passwordResetToken),
    ).rejects.toThrow(InvalidSignature);
  });

  it("supports JSON-serializable embedded data", async () => {
    const snapshotToken = (user as any).generateTokenFor("snapshot");
    expect(((await (TokenUser as any).findByTokenFor("snapshot", snapshotToken)) as any).id).toBe(
      user.id,
    );
    await (user as any).update({ updated_at: new Date(Date.now() + 1000) });
    expect(await (TokenUser as any).findByTokenFor("snapshot", snapshotToken)).toBeNull();
  });

  it("finds record through relation", async () => {
    expect(((await TokenUser.where("1=1").findByTokenFor("lookup", lookupToken)) as any)?.id).toBe(
      user.id,
    );
    expect(await TokenUser.where("1=0").findByTokenFor("lookup", lookupToken)).toBeNull();
  });

  it("finds record through subclass", async () => {
    class Subclass extends TokenUser {}
    const subclassedUser = await (Subclass as any).findByTokenFor("lookup", lookupToken);

    expect(subclassedUser).toBeInstanceOf(Subclass);
    expect((subclassedUser as any).id).toBe(user.id);
  });

  it("subclasses can redefine tokens", async () => {
    class Subclass extends TokenUser {
      static {
        generatesTokenFor(this, "lookup");
      }
    }
    const subclassedUser = await Subclass.find(user.id);
    const subclassedLookupToken = (subclassedUser as any).generateTokenFor("lookup");

    expect(
      ((await (Subclass as any).findByTokenFor("lookup", subclassedLookupToken)) as any).id,
    ).toBe(user.id);
    expect(await (Subclass as any).findByTokenFor("lookup", lookupToken)).toBeNull();
    expect(await (TokenUser as any).findByTokenFor("lookup", subclassedLookupToken)).toBeNull();
  });

  it("finds record with a custom primary key", async () => {
    class CustomPk extends TokenUser {
      static _primaryKey = "auth_token";
    }
    const customPkUser = await CustomPk.find((user as any).auth_token);
    const customPkLookupToken = (customPkUser as any).generateTokenFor("lookup");

    expect(
      ((await (CustomPk as any).findByTokenFor("lookup", customPkLookupToken)) as any).id,
    ).toBe((customPkUser as any).id);
    expect(await (CustomPk as any).findByTokenFor("lookup", lookupToken)).toBeNull();
  });

  it("finds record with a composite primary key", async () => {
    // Rails: Cpk::Book.create!(id: [1, 3], shop_id: 2) — composite PK is
    // [author_id, id]; assign the components our mass-assignment understands.
    const book = await CpkBook.create({ author_id: 1, id: 3, shop_id: 2 });
    const token = (book as any).generateTokenFor("test");

    expect(((await (CpkBook as any).findByTokenFor("test", token)) as any).id).toEqual(
      (book as any).id,
    );
  });

  it("raises when no primary key has been declared", async () => {
    class NoPk extends Matey {
      static {
        generatesTokenFor(this, "parley");
      }
    }

    await expect(
      (NoPk as any).findByTokenFor("parley", "this token will not be checked"),
    ).rejects.toThrow();
  });
});
