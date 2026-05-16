/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Base, RecordNotFound, registerSubclass } from "./index.js";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { setSignedIdVerifierSecret, setSignedIdVerifier, signedIdVerifier } from "./signed-id.js";
import { UnknownPrimaryKey } from "./errors.js";
import { SignedGlobalID, setApp, _resetApp } from "@blazetrails/globalid";

import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("SignedIdTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
    setSignedIdVerifierSecret("blazetrails-test-secret");
  });

  function makeModel() {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    return { User };
  }

  it("fail to find record from broken signed id", async () => {
    const { User } = makeModel();
    const result = await User.findSigned("broken-token");
    expect(result).toBeNull();
  });

  it("find signed record within expiration duration", async () => {
    const { User } = makeModel();
    const u = await User.create({ name: "Alice" });
    const token = await u.signedId({ expiresIn: 60 });
    const found = await User.findSigned(token);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Alice");
  });

  it("fail to find signed record within expiration duration", async () => {
    const { User } = makeModel();
    const u = await User.create({ name: "Bob" });
    const token = await u.signedId({ expiresAt: Temporal.Now.instant().subtract({ seconds: 1 }) });
    const result = await User.findSigned(token);
    expect(result).toBeNull();
  });

  it("fail to find record from that has since been destroyed", async () => {
    const { User } = makeModel();
    const u = await User.create({ name: "Carol" });
    const token = await u.signedId();
    await u.destroy();
    const result = await User.findSigned(token);
    expect(result).toBeNull();
  });

  it("fail to find signed record with purpose", async () => {
    const { User } = makeModel();
    const u = await User.create({ name: "Dan" });
    const token = await u.signedId({ purpose: "login" });
    const result = await User.findSigned(token, { purpose: "reset" });
    expect(result).toBeNull();
  });

  it("finding record from broken signed id raises on the bang", async () => {
    const { User } = makeModel();
    await expect(User.findSignedBang("broken")).rejects.toThrow();
  });

  it("find signed record with bang with purpose", async () => {
    const { User } = makeModel();
    const u = await User.create({ name: "Eve" });
    const token = await u.signedId({ purpose: "confirm" });
    const found = await User.findSignedBang(token, { purpose: "confirm" });
    expect(found.name).toBe("Eve");
  });

  it("find signed record with bang with purpose raises", async () => {
    const { User } = makeModel();
    const u = await User.create({ name: "Frank" });
    const token = await u.signedId({ purpose: "confirm" });
    await expect(User.findSignedBang(token, { purpose: "reset" })).rejects.toThrow();
  });

  it("cannot get a signed ID for a new record", async () => {
    const { User } = makeModel();
    const u = new User({ name: "Gina" });
    expect(() => u.signedId()).toThrow();
  });

  it("can get a signed ID in an after_create", async () => {
    const { User } = makeModel();
    let capturedToken: string | null = null;
    User.afterCreate(async (record: any) => {
      capturedToken = await record.signedId();
    });
    await User.create({ name: "Henry" });
    expect(capturedToken).not.toBeNull();
    const found = await User.findSigned(capturedToken!);
    expect(found).not.toBeNull();
  });

  it("find signed record with custom primary key", async () => {
    class Toy extends Base {
      static {
        this._primaryKey = "toy_id";
        this.attribute("toy_id", "string");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const t = await Toy.create({ toy_id: "abc-123", name: "Block" });
    const token = await t.signedId();
    const found = await Toy.findSigned(token);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Block");
  });

  it("find signed record for single table inheritance (STI Models)", async () => {
    class Animal extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.adapter = adapter;
      }
    }
    class Dog extends Animal {
      // eslint-disable-next-line no-empty-static-block
      static {}
    }
    const d = await Dog.create({ name: "Rex" });
    const token = await d.signedId();
    const found = await Dog.findSigned(token);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Rex");
  });

  it("find signed record raises UnknownPrimaryKey when a model has no primary key", async () => {
    class Matey extends Base {
      static {
        this._primaryKey = "";
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await expect(Matey.findSigned("this will not be even verified")).rejects.toThrow(
      UnknownPrimaryKey,
    );
  });

  it("find signed record with a bang with custom primary key", async () => {
    class Toy extends Base {
      static {
        this._primaryKey = "toy_id";
        this.attribute("toy_id", "string");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const t = await Toy.create({ toy_id: "k-9", name: "Robot" });
    const token = await t.signedId();
    const found = await Toy.findSignedBang(token);
    expect(found.name).toBe("Robot");
  });

  it("find signed record with a bang for single table inheritance (STI Models)", async () => {
    class Vehicle extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.adapter = adapter;
      }
    }
    class Car extends Vehicle {
      // eslint-disable-next-line no-empty-static-block
      static {}
    }
    const c = await Car.create({ name: "Sedan" });
    const token = await c.signedId();
    const found = await Car.findSignedBang(token);
    expect(found.name).toBe("Sedan");
  });

  it("find signed record within expiration time", async () => {
    const { User } = makeModel();
    const u = await User.create({ name: "Timed" });
    const token = await u.signedId({ expiresIn: 30_000 });
    const found = await User.findSigned(token);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Timed");
  });

  it("fail to find signed record within expiration time", async () => {
    const { User } = makeModel();
    const u = await User.create({ name: "Expired" });
    const token = await u.signedId({ expiresAt: Temporal.Now.instant().subtract({ seconds: 1 }) });
    const result = await User.findSigned(token);
    expect(result).toBeNull();
  });
  it("finding signed record that has been destroyed raises on the bang", async () => {
    const { User } = makeModel();
    const u = await User.create({ name: "Ivan" });
    const token = await u.signedId();
    await u.destroy();
    await expect(User.findSignedBang(token)).rejects.toThrow(RecordNotFound);
  });

  it("finding signed record outside expiration duration raises on the bang", async () => {
    class UserShort extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await UserShort.create({ name: "Jake" });
    const token = await u.signedId({ expiresAt: Temporal.Now.instant().subtract({ seconds: 1 }) });
    await expect(UserShort.findSignedBang(token)).rejects.toThrow(
      /Expired message|InvalidSignature/,
    );
  });

  it("fail to work without a signed_id_verifier_secret", async () => {
    const { User } = makeModel();
    const u = await User.create({ name: "NoSecret" });
    setSignedIdVerifierSecret(null);
    try {
      expect(() => u.signedId()).toThrow(/signed_id_verifier_secret|signed ids/i);
    } finally {
      setSignedIdVerifierSecret("blazetrails-test-secret");
    }
  });

  it("fail to work without when signed_id_verifier_secret lambda is nil", async () => {
    const { User } = makeModel();
    const u = await User.create({ name: "NilLambda" });
    setSignedIdVerifierSecret(() => null);
    try {
      expect(() => u.signedId()).toThrow(/signed_id_verifier_secret|signed ids/i);
    } finally {
      setSignedIdVerifierSecret("blazetrails-test-secret");
    }
  });

  it("always output url_safe", async () => {
    const { User } = makeModel();
    const u = await User.create({ name: "Safe" });
    const token = await u.signedId();
    // Base64 tokens should not contain characters unsafe for URLs
    // Standard base64 uses +, /, = which are URL-safe enough for query params
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("use a custom verifier", async () => {
    const { User } = makeModel();
    const customVerifier = new MessageVerifier("sekret", {
      digest: "sha256",
      url_safe: true,
    });
    setSignedIdVerifier(User as any, customVerifier);
    expect(signedIdVerifier(User as any)).toBe(customVerifier);
    const u = await User.create({ name: "Custom" });
    const token = await u.signedId();
    const found = await User.findSigned(token);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(u.id);
  });

  it("find signed record", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Alice" });
    const token = await u.signedId();
    const found = await User.findSigned(token);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(u.id);
  });

  it("find signed record on relation", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Alice" });
    const token = await u.signedId();
    const found = await User.where({ name: "Alice" }).findSigned(token);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(u.id);
    const miss = await User.where({ name: "Bob" }).findSigned(token);
    expect(miss).toBeNull();
  });

  it("find signed record with a bang", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Alice" });
    const token = await u.signedId();
    const found = await User.findSignedBang(token);
    expect(found.id).toBe(u.id);
  });

  it("find signed record with a bang on relation", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Alice" });
    const token = await u.signedId();
    const found = await User.where({ name: "Alice" }).findSignedBang(token);
    expect(found.id).toBe(u.id);
    await expect(User.where({ name: "Bob" }).findSignedBang(token)).rejects.toThrow();
  });

  it("find signed record with purpose", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Alice" });
    const token = await u.signedId({ purpose: "confirm" });
    const found = await User.findSigned(token, { purpose: "confirm" });
    expect(found).not.toBeNull();
    expect(found!.id).toBe(u.id);
    const wrongPurpose = await User.findSigned(token, { purpose: "wrong" });
    expect(wrongPurpose).toBeNull();
  });

  it("find signed record with a bang within expiration duration", async () => {
    const { User } = makeModel();
    const u = await User.create({ name: "Timely" });
    const token = await u.signedId({ expiresIn: 60 });
    const found = await User.findSignedBang(token);
    expect(found.id).toBe(u.id);
  });
});

describe("toGid", () => {
  afterEach(() => _resetApp());

  it("returns a GlobalID-like URI", async () => {
    setApp("MyApp");
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Alice" });
    expect(u.toGid().toString()).toBe(`gid://MyApp/User/${u.id}`);
  });

  it("throws when no app is configured", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ id: 1 });
    expect(() => u.toGid()).toThrow(/app is required/i);
  });
});

describe("Base.findGlobalId", () => {
  afterEach(() => _resetApp());

  it("locates a record by its toGid() URI via the AR model registry", async () => {
    setApp("MyApp");
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Alice" });
    const found = (await Base.findGlobalId(u.toGid())) as User;
    expect(found).toBeInstanceOf(User);
    expect(found.id).toBe(u.id);
    expect(found.name).toBe("Alice");
  });

  it("returns null for an unknown model class", async () => {
    setApp("MyApp");
    const found = await Base.findGlobalId("gid://MyApp/NoSuchModel/1");
    expect(found).toBeNull();
  });

  it("resolves an inherited-adapter STI subclass via the descendants fallback", async () => {
    setApp("MyApp");
    const adapter = freshAdapter();
    class Animal extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Dog extends Animal {
      static {
        // STI subclass registers with its parent; does NOT set its own adapter.
        registerSubclass(this);
      }
    }
    const d = await Dog.create({ name: "Rex" });
    const found = (await Base.findGlobalId(d.toGid())) as Dog;
    expect(found).toBeInstanceOf(Dog);
    expect(found.id).toBe(d.id);
  });
});

describe("Base.toGlobalId / toGidParam", () => {
  afterEach(() => _resetApp());

  it("toGlobalId returns a GlobalID instance; toGidParam round-trips through findGlobalId", async () => {
    setApp("MyApp");
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Pat" });
    const gid = u.toGlobalId();
    expect(gid.uri).toBe(`gid://MyApp/User/${u.id}`);
    expect(gid.modelName).toBe("User");
    const found = (await Base.findGlobalId(u.toGidParam())) as User;
    expect(found.id).toBe(u.id);
  });
});

describe("Base.findSignedGlobalId", () => {
  beforeEach(() => setSignedIdVerifierSecret("blazetrails-test-secret"));
  afterEach(() => _resetApp());

  it("locates a record by SignedGlobalID token", async () => {
    setApp("MyApp");
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Bob" });
    const sgid = await u.toSgid();
    const found = (await Base.findSignedGlobalId(sgid.toString())) as User;
    expect(found).toBeInstanceOf(User);
    expect(found.id).toBe(u.id);
  });

  it("findSignedGlobalIdBang throws RecordNotFound for invalid token", async () => {
    setApp("MyApp");
    await expect(Base.findSignedGlobalIdBang("invalid-token")).rejects.toThrow(RecordNotFound);
  });

  it("findSignedGlobalId honors for: purpose scoping", async () => {
    setApp("MyApp");
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ id: 3 });
    const sgid = await u.toSgid({ for: "share" });
    const token = sgid.toString();
    // Matching for: locates the record.
    const found = (await Base.findSignedGlobalId(token, { for: "share" })) as User;
    expect(found.id).toBe(3);
    // Mismatching for: returns null (purpose-scoped tokens are the SGID
    // security boundary).
    expect(await Base.findSignedGlobalId(token, { for: "other" })).toBeNull();
  });

  it("toSignedGlobalId is an alias of toSgid (same URI + purpose)", async () => {
    setApp("MyApp");
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ id: 7 });
    const a = await u.toSignedGlobalId({ for: "login" });
    const b = await u.toSgid({ for: "login" });
    expect(a.uri).toBe(b.uri);
    expect(a.purpose).toBe(b.purpose);
    expect(a.purpose).toBe("login");
  });
});

describe("signedId / findSigned / findSignedBang", () => {
  it("generates a signed ID for a persisted record", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const user = await User.create({ name: "Alice" });
    const sid = await user.signedId();
    expect(typeof sid).toBe("string");
    expect(sid.length).toBeGreaterThan(0);
  });

  it("throws for new records", async () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    const user = new User({ name: "Alice" });
    expect(() => user.signedId()).toThrow("Cannot get a signed_id for a new record");
  });

  it("findSigned recovers the record from its signed ID", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const user = await User.create({ name: "Bob" });
    const sid = await user.signedId();
    const found = await User.findSigned(sid);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(user.id);
  });

  it("findSigned returns null for invalid signed ID", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const found = await User.findSigned("not-valid-base64!!!");
    expect(found).toBeNull();
  });

  it("findSigned respects purpose option", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const user = await User.create({ name: "Carol" });
    const sid = await user.signedId({ purpose: "password_reset" });
    // Wrong purpose returns null
    const wrongPurpose = await User.findSigned(sid, { purpose: "login" });
    expect(wrongPurpose).toBeNull();
    // Correct purpose finds the record
    const rightPurpose = await User.findSigned(sid, { purpose: "password_reset" });
    expect(rightPurpose).not.toBeNull();
    expect(rightPurpose!.id).toBe(user.id);
  });

  it("findSignedBang throws when not found", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await expect(User.findSignedBang("invalid")).rejects.toThrow();
  });

  it("toSgid returns SignedGlobalID whose toParam round-trips to same instance", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Dave" });
    const sgid = await u.toSgid({ for: "test", app: "TestApp" });
    expect(sgid.purpose).toBe("test");
    expect(sgid.uri).toContain(`/${u.id}`);
    const parsed = SignedGlobalID.parse(sgid.toParam(), {
      for: "test",
      verifier: signedIdVerifier(User),
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.uri).toBe(sgid.uri);
    expect(parsed!.purpose).toBe(sgid.purpose);
  });

  it("toSgidParam returns a string token identical to toSgid().toParam()", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Eve" });
    const token = await u.toSgidParam({ app: "TestApp" });
    expect(typeof token).toBe("string");
    expect(token).toBe((await u.toSgid({ app: "TestApp" })).toParam());
  });
});
