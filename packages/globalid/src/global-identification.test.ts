import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { setApp, _resetApp } from "./config.js";
import { GlobalID } from "./global-id.js";
import { SignedGlobalID } from "./signed-global-id.js";
import { toGlobalId, toGid, toGidParam, toSignedGlobalId, toSgid } from "./identification.js";
import { Locator, setModelFinder, _resetModelFinder, type LocatorModel } from "./locator.js";

function makeVerifier(): MessageVerifier {
  return new MessageVerifier("test-secret", { digest: "sha256", url_safe: true });
}

class Person {
  static name = "Person";
  static primaryKey = "id";
  id: string;
  constructor(id: string) {
    this.id = id;
  }
  static async find(id: unknown): Promise<Person | Person[]> {
    if (Array.isArray(id)) return id.map((i) => new Person(String(i)));
    return new Person(String(id));
  }
}

describe("GlobalIdentificationTest", () => {
  beforeEach(() => {
    setApp("bcx");
    setModelFinder((name) => (name === "Person" ? (Person as unknown as LocatorModel) : undefined));
  });
  afterEach(() => {
    _resetApp();
    _resetModelFinder();
  });

  it("creates a Global ID from self", () => {
    const p = new Person("1");
    expect(toGlobalId.call(p).uri).toBe(GlobalID.create(p).uri);
    expect(toGid.call(p).uri).toBe(GlobalID.create(p).uri);
    expect(toGlobalId.call(p)).toBeInstanceOf(GlobalID);
  });

  it("creates a Global ID with custom params", () => {
    const p = new Person("1");
    const a = toGlobalId.call(p, { some: "param" });
    expect(a.params).toEqual({ some: "param" });
  });

  it("creates a signed Global ID from self", () => {
    const verifier = makeVerifier();
    const a = toSignedGlobalId.call(new Person("1"), { verifier });
    const b = toSgid.call(new Person("1"), { verifier });
    expect(a).toBeInstanceOf(SignedGlobalID);
    expect(a.uri).toBe("gid://bcx/Person/1");
    expect(b.uri).toBe(a.uri);
  });

  it("creates a signed Global ID with purpose", () => {
    const verifier = makeVerifier();
    const a = toSignedGlobalId.call(new Person("1"), { verifier, for: "login" });
    expect(a.purpose).toBe("login");
    // Round-trip verifies the purpose only when caller passes matching for:.
    const token = a.toString();
    expect(SignedGlobalID.parse(token, { verifier, for: "login" })).not.toBeNull();
    expect(SignedGlobalID.parse(token, { verifier, for: "other" })).toBeNull();
  });

  it("creates a signed Global ID with custom params", () => {
    const verifier = makeVerifier();
    const sgid = toSignedGlobalId.call(new Person("1"), { verifier, db: "primary" });
    expect(sgid.uri).toContain("?db=primary");
    const parsed = SignedGlobalID.parse(sgid.toString(), { verifier });
    expect(parsed!.uri).toContain("?db=primary");
  });

  it("toGidParam round-trips through GlobalID.parse", () => {
    const p = new Person("5");
    const parsed = GlobalID.parse(toGidParam.call(p));
    expect(parsed!.modelId).toBe("5");
  });
});

describe("Locator.locateSigned + locateManySigned", () => {
  beforeEach(() => {
    setApp("bcx");
    setModelFinder((name) => (name === "Person" ? (Person as unknown as LocatorModel) : undefined));
  });
  afterEach(() => {
    _resetApp();
    _resetModelFinder();
  });

  it("locate_signed finds a record by valid SGID", async () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(new Person("7"), { verifier });
    const found = (await Locator.locateSigned(sgid.toString(), { verifier })) as Person;
    expect(found).toBeInstanceOf(Person);
    expect(found.id).toBe("7");
  });

  it("locate_signed finds a record by purpose-scoped SGID when for: matches", async () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(new Person("9"), { verifier, for: "login" });
    const found = (await Locator.locateSigned(sgid.toString(), {
      verifier,
      for: "login",
    })) as Person;
    expect(found).toBeInstanceOf(Person);
    expect(found.id).toBe("9");
  });

  it("locate_signed returns null for invalid signature or purpose mismatch", async () => {
    const v1 = makeVerifier();
    const v2 = new MessageVerifier("other", { digest: "sha256", url_safe: true });
    const sgid = SignedGlobalID.create(new Person("7"), { verifier: v1, purpose: "login" });
    expect(await Locator.locateSigned(sgid.toString(), { verifier: v2 })).toBeNull();
    expect(await Locator.locateSigned(sgid.toString(), { verifier: v1, for: "signup" })).toBeNull();
  });

  it("locate_many_signed locates the valid subset", async () => {
    const verifier = makeVerifier();
    const wrongVerifier = new MessageVerifier("other", { digest: "sha256", url_safe: true });
    const validSgid = SignedGlobalID.create(new Person("1"), { verifier });
    const invalidSgid = SignedGlobalID.create(new Person("2"), { verifier: wrongVerifier });
    const validSgid2 = SignedGlobalID.create(new Person("3"), { verifier });

    const found = await Locator.locateManySigned(
      [validSgid.toString(), invalidSgid.toString(), validSgid2.toString()],
      { verifier },
    );
    expect(found).toHaveLength(2);
    expect((found[0] as Person).id).toBe("1");
    expect((found[1] as Person).id).toBe("3");
  });
});
