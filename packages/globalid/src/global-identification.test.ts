import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { setApp, _resetApp } from "./config.js";
import { registerConstant, _resetConstants } from "@blazetrails/activesupport";
import { GlobalID } from "./global-id.js";
import { SignedGlobalID } from "./signed-global-id.js";
import {
  toGlobalId,
  toGid,
  toGidParam,
  toSignedGlobalId,
  toSgid,
  toSgidParam,
} from "./identification.js";
import { Locator } from "./locator.js";

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
  let model: Person;

  beforeEach(() => {
    setApp("bcx");
    registerConstant("Person", Person);
    model = new Person("1");
  });
  afterEach(() => {
    _resetApp();
    _resetConstants();
  });

  it("creates a Global ID from self", () => {
    expect(GlobalID.create(model)).toEqual(toGlobalId.call(model));
    expect(GlobalID.create(model)).toEqual(toGid.call(model));
  });

  it("creates a Global ID with custom params", () => {
    expect(GlobalID.create(model, { some: "param" })).toEqual(
      toGlobalId.call(model, { some: "param" }),
    );
    expect(GlobalID.create(model, { some: "param" })).toEqual(toGid.call(model, { some: "param" }));
  });

  // Rails compares SignedGlobalIDs with `assert_equal`, which routes through
  // SignedGlobalID#== (uri + purpose). Vitest's `toEqual` is structural and
  // would also compare the per-instance inspect id, so the ported assertions
  // go through the same `equals` Rails' `==` is.
  it("creates a signed Global ID from self", () => {
    const verifier = makeVerifier();
    expect(
      SignedGlobalID.create(model, { verifier }).equals(toSignedGlobalId.call(model, { verifier })),
    ).toBe(true);
    expect(
      SignedGlobalID.create(model, { verifier }).equals(toSgid.call(model, { verifier })),
    ).toBe(true);
  });

  it("creates a signed Global ID with purpose", () => {
    const verifier = makeVerifier();
    expect(
      SignedGlobalID.create(model, { verifier, for: "login" }).equals(
        toSignedGlobalId.call(model, { verifier, for: "login" }),
      ),
    ).toBe(true);
    expect(
      SignedGlobalID.create(model, { verifier, for: "login" }).equals(
        toSgid.call(model, { verifier, for: "login" }),
      ),
    ).toBe(true);
  });

  it("creates a signed Global ID with custom params", () => {
    const verifier = makeVerifier();
    expect(
      SignedGlobalID.create(model, { verifier, some: "param" }).equals(
        toSignedGlobalId.call(model, { verifier, some: "param" }),
      ),
    ).toBe(true);
    expect(
      SignedGlobalID.create(model, { verifier, some: "param" }).equals(
        toSgid.call(model, { verifier, some: "param" }),
      ),
    ).toBe(true);
  });

  it("dup should clear memoized to_global_id", () => {
    // Rails calls model.dup (which clears the @global_id memoization) before
    // bumping the id. Trails doesn't memoize toGlobalId, so the dup is a plain
    // structural copy and the same invariant holds.
    const globalId = toGlobalId.call(model);
    const dupModel = new Person(String(Number(model.id) + 1));
    const dupGlobalId = toGlobalId.call(dupModel);
    expect(globalId).not.toEqual(dupGlobalId);
  });

  it("toGidParam round-trips through GlobalID.parse", () => {
    const p = new Person("5");
    const parsed = GlobalID.parse(toGidParam.call(p));
    expect(parsed!.modelId).toBe("5");
  });

  it("toSgidParam returns a verifiable token", () => {
    const verifier = makeVerifier();
    const token = toSgidParam.call(new Person("2"), { verifier });
    expect(typeof token).toBe("string");
    const parsed = SignedGlobalID.parse(token, { verifier });
    expect(parsed).not.toBeNull();
    expect(parsed!.uri).toBe("gid://bcx/Person/2");
  });
});

describe("Locator.locateSigned + locateManySigned", () => {
  beforeEach(() => {
    setApp("bcx");
    registerConstant("Person", Person);
  });
  afterEach(() => {
    _resetApp();
    _resetConstants();
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
    const sgid = SignedGlobalID.create(new Person("7"), { verifier: v1, for: "login" });
    expect(await Locator.locateSigned(sgid.toString(), { verifier: v2 })).toBeNull();
    expect(await Locator.locateSigned(sgid.toString(), { verifier: v1, for: "signup" })).toBeNull();
  });

  it("locate_many_signed filters by for: purpose", async () => {
    const verifier = makeVerifier();
    const matching = SignedGlobalID.create(new Person("1"), { verifier, for: "login" });
    const mismatched = SignedGlobalID.create(new Person("2"), { verifier, for: "signup" });
    const found = await Locator.locateManySigned([matching.toString(), mismatched.toString()], {
      verifier,
      for: "login",
    });
    expect(found).toHaveLength(1);
    expect((found[0] as Person).id).toBe("1");
  });

  it("accepts SignedGlobalID instances directly (no toString needed)", async () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(new Person("4"), { verifier });
    const sgid2 = SignedGlobalID.create(new Person("5"), { verifier });
    // locateSigned with a SignedGlobalID instance, not a string.
    const found = (await Locator.locateSigned(sgid, { verifier })) as Person;
    expect(found.id).toBe("4");
    // locateManySigned with an array of SignedGlobalID instances.
    const many = await Locator.locateManySigned([sgid, sgid2], { verifier });
    expect(many).toHaveLength(2);
    expect((many[0] as Person).id).toBe("4");
    expect((many[1] as Person).id).toBe("5");
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
