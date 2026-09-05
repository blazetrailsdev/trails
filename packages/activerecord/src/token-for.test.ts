import { Time as RubyTime } from "@blazetrails/date";
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { RecordNotFound, registerModel } from "./index.js";
import { User } from "./test-helpers/models/user.js";
import { Matey } from "./test-helpers/models/matey.js";
import { Room } from "./test-helpers/models/room.js";
import { CpkBook } from "./test-helpers/models/cpk.js";
import { InvalidSignature } from "@blazetrails/activesupport/message-verifier";
import { travel, travelBack } from "@blazetrails/activesupport";
import { setTokenForSecret } from "./token-for.js";
import { fixtures } from "./test-fixtures.js";
import "./support/canonical-model-index.js";

class TokenUser extends User {
  static {
    this.generatesTokenFor("lookup");
    this.generatesTokenFor("password_reset", {
      expiresIn: 15 * 60,
      block: (r: any) => String(r.password_digest ?? "").slice(-(31 + 22), -(31 + 22) + 10),
    });
    this.generatesTokenFor("snapshot", {
      block: (r: any) => ({ updated_at: r.updated_at }),
    });
  }
}

const DAY = 24 * 60 * 60 * 1000;

describe("TokenForTest", () => {
  fixtures([], { useTransactionalTests: false });
  beforeAll(async () => {
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
    lookupToken = user.generateTokenFor("lookup");
    passwordResetToken = user.generateTokenFor("password_reset");
  });

  afterEach(async () => {
    travelBack();
    setTokenForSecret(null);
    await TokenUser.deleteAll();
    await CpkBook.deleteAll();
  });

  it("finds record by token", async () => {
    expect((await TokenUser.findByTokenFor("lookup", lookupToken))!.id).toBe(user.id);
    expect((await TokenUser.findByTokenForBang("lookup", lookupToken)).id).toBe(user.id);
  });

  it("returns nil when record is not found", async () => {
    await user.destroy();
    expect(await TokenUser.findByTokenFor("lookup", lookupToken)).toBeNull();
  });

  it("raises on bang when record is not found", async () => {
    await user.destroy();
    await expect(TokenUser.findByTokenForBang("lookup", lookupToken)).rejects.toThrow(
      RecordNotFound,
    );
  });

  it("raises when token definition does not exist", async () => {
    await expect(TokenUser.findByTokenFor("bad", lookupToken)).rejects.toThrow();
  });

  it("does not find record when token is invalid", async () => {
    expect(await TokenUser.findByTokenFor("lookup", "bad")).toBeNull();
    await expect(TokenUser.findByTokenForBang("lookup", "bad")).rejects.toThrow(InvalidSignature);
  });

  it("does not find record when token is for a different purpose", async () => {
    expect(await TokenUser.findByTokenFor("password_reset", lookupToken)).toBeNull();
    await expect(TokenUser.findByTokenForBang("password_reset", lookupToken)).rejects.toThrow(
      InvalidSignature,
    );
  });

  it("finds record when token has not expired and embedded data has not changed", async () => {
    expect((await TokenUser.findByTokenFor("password_reset", passwordResetToken))!.id).toBe(
      user.id,
    );
  });

  it("does not find record when token has expired", async () => {
    travel(DAY);
    expect(await TokenUser.findByTokenFor("password_reset", passwordResetToken)).toBeNull();
    await expect(
      TokenUser.findByTokenForBang("password_reset", passwordResetToken),
    ).rejects.toThrow(InvalidSignature);
  });

  it("tokens do not expire by default", async () => {
    travel(1000 * 365 * DAY);
    expect((await TokenUser.findByTokenFor("lookup", lookupToken))!.id).toBe(user.id);
  });

  it("does not find record when expires_in is different", async () => {
    TokenUser.generatesTokenFor("lookup", { expiresIn: 365 * DAY });

    try {
      expect(await TokenUser.findByTokenFor("lookup", lookupToken)).toBeNull();
      const newLookupToken = user.generateTokenFor("lookup");
      expect((await TokenUser.findByTokenFor("lookup", newLookupToken))!.id).toBe(user.id);
    } finally {
      TokenUser.generatesTokenFor("lookup");
    }
  });

  it("does not find record when embedded data is different", async () => {
    (user as any).password_digest = "new password";
    await user.save();
    expect(await TokenUser.findByTokenFor("password_reset", passwordResetToken)).toBeNull();
    await expect(
      TokenUser.findByTokenForBang("password_reset", passwordResetToken),
    ).rejects.toThrow(InvalidSignature);
  });

  it("supports JSON-serializable embedded data", async () => {
    const snapshotToken = user.generateTokenFor("snapshot");
    expect((await TokenUser.findByTokenFor("snapshot", snapshotToken))!.id).toBe(user.id);
    const advanced = (user as any).updated_at.plus(1) as RubyTime;
    await (user as any).touch({ time: advanced });
    expect(await TokenUser.findByTokenFor("snapshot", snapshotToken)).toBeNull();
  });

  it("finds record through relation", async () => {
    expect(((await TokenUser.where("1=1").findByTokenFor("lookup", lookupToken)) as any)?.id).toBe(
      user.id,
    );
    expect(await TokenUser.where("1=0").findByTokenFor("lookup", lookupToken)).toBeNull();
  });

  it("finds record through subclass", async () => {
    class Subclass extends TokenUser {}
    const subclassedUser = await Subclass.findByTokenFor("lookup", lookupToken);

    expect(subclassedUser).toBeInstanceOf(Subclass);
    expect(subclassedUser!.id).toBe(user.id);
  });

  it("subclasses can redefine tokens", async () => {
    class Subclass extends TokenUser {
      static {
        this.generatesTokenFor("lookup");
      }
    }
    const subclassedUser = await Subclass.find(user.id);
    const subclassedLookupToken = (subclassedUser as any).generateTokenFor("lookup");

    expect((await Subclass.findByTokenFor("lookup", subclassedLookupToken))!.id).toBe(user.id);
    expect(await Subclass.findByTokenFor("lookup", lookupToken)).toBeNull();
    expect(await TokenUser.findByTokenFor("lookup", subclassedLookupToken)).toBeNull();
  });

  it("finds record with a custom primary key", async () => {
    class CustomPk extends TokenUser {
      static _primaryKey = "auth_token";
    }
    const customPkUser = await CustomPk.find((user as any).auth_token);
    const customPkLookupToken = (customPkUser as any).generateTokenFor("lookup");

    expect((await CustomPk.findByTokenFor("lookup", customPkLookupToken))!.id).toBe(
      (customPkUser as any).id,
    );
    expect(await CustomPk.findByTokenFor("lookup", lookupToken)).toBeNull();
  });

  it("finds record with a composite primary key", async () => {
    const book = await CpkBook.create({ id: [1, 3], shop_id: 2 });
    const token = book.generateTokenFor("test");

    expect((await CpkBook.findByTokenFor("test", token))!.id).toEqual((book as any).id);
  });

  it("raises when no primary key has been declared", async () => {
    class NoPk extends Matey {
      static {
        this.generatesTokenFor("parley");
      }
    }

    await expect(NoPk.findByTokenFor("parley", "this token will not be checked")).rejects.toThrow();
  });
});
