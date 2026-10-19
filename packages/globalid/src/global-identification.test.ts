import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { registerConstant, resetConstants } from "@blazetrails/ruby-compat";
import { GlobalID } from "./global-id.js";
import { SignedGlobalID } from "./signed-global-id.js";
import { toGlobalId, toGid, toSignedGlobalId, toSgid } from "./identification.js";

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
    GlobalID.setApp("bcx");
    registerConstant("Person", Person);
    model = new Person("1");
  });
  afterEach(() => {
    GlobalID["_app"] = undefined;
    resetConstants();
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
    const globalId = toGlobalId.call(model);
    const dupModel = new Person(String(Number(model.id) + 1));
    const dupGlobalId = toGlobalId.call(dupModel);
    expect(globalId).not.toEqual(dupGlobalId);
  });
});
