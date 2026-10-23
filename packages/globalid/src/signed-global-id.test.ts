import { GlobalID } from "./global-id.js";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  travelBack,
  travelTo,
  assertNil,
  assertNotNil,
  assertEqual,
} from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { SignedGlobalID, _resetSignedGlobalIDClassConfig } from "./signed-global-id.js";
import { registerConstant, resetConstants } from "@blazetrails/ruby-compat";

function makeVerifier(secret = "test-secret"): MessageVerifier {
  return new MessageVerifier(secret, { digest: "sha256", url_safe: true });
}

const person = (id: unknown = 5) => ({ id, constructor: { name: "Person" } });
const TEST_APP = "bcx";

class Person {
  static primaryKey = "id";
  constructor(public id: string) {}
  static async find(id: unknown): Promise<Person> {
    return new Person(String(id));
  }
}

describe("SignedGlobalIDTest", () => {
  beforeEach(() => {
    GlobalID.setApp(TEST_APP);
    registerConstant("Person", Person);
  });
  afterEach(() => {
    GlobalID["_app"] = undefined;
    resetConstants();
  });

  it("as string", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(), { verifier });
    assertEqual(sgid.uri, SignedGlobalID.parse(sgid.toString(), { verifier })!.uri);
  });

  it("model id", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier });
    expect(sgid.modelId).toBe("5");
  });

  it("value equality", () => {
    const verifier = makeVerifier();
    const a = SignedGlobalID.create(person(5), { verifier });
    const b = SignedGlobalID.create(person(5), { verifier });
    expect(a.equals(b)).toBe(true);
  });

  it("to param", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier });
    expect(sgid.toParam()).toBe(sgid.toString());
  });

  it("model class", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier });
    expect(sgid.modelClass).toBe(Person);
  });

  it("inspect", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier });
    expect(sgid.inspect()).toMatch(/^#<SignedGlobalID:0x[0-9a-f]+>$/);
  });
});

describe("SignedGlobalIDPurposeTest", () => {
  beforeEach(() => GlobalID.setApp(TEST_APP));
  afterEach(() => (GlobalID["_app"] = undefined));

  it("sign with purpose when :for is provided", () => {
    const verifier = makeVerifier();
    const loginSgid = SignedGlobalID.create(person(5), { verifier, for: "login" });
    const likeSgid = SignedGlobalID.create(person(5), { verifier, for: "like-button" });
    assertEqual(
      loginSgid.uri,
      SignedGlobalID.parse(loginSgid.toString(), { verifier, for: "login" })!.uri,
    );
    expect(loginSgid.equals(likeSgid)).not.toBe(true);
  });

  it("sign with default purpose when no :for is provided", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier });
    const defaultSgid = SignedGlobalID.create(person(5), { verifier, for: "default" });
    expect(sgid.purpose).toBe("default");
    expect(sgid.equals(defaultSgid)).toBe(true);
  });

  it("new accepts a :for", () => {
    const verifier = makeVerifier();
    const loginSgid = SignedGlobalID.create(person(5), { verifier, for: "login" });
    const expected = new SignedGlobalID(`gid://${TEST_APP}/Person/5`, {
      verifier,
      for: "login",
    });
    expect(loginSgid.equals(expected)).toBe(true);
  });

  it("create accepts a :for", () => {
    const verifier = makeVerifier();
    const a = SignedGlobalID.create(person(5), { verifier, for: "login" });
    const b = SignedGlobalID.create(person(5), { verifier, for: "login" });
    expect(a.equals(b)).toBe(true);
  });

  it("parse returns nil when purpose mismatch", () => {
    const verifier = makeVerifier();
    const loginSgid = SignedGlobalID.create(person(5), { verifier, for: "login" });
    assertNil(SignedGlobalID.parse(loginSgid.toString(), { verifier }));
    assertNil(SignedGlobalID.parse(loginSgid.toString(), { verifier, for: "like_button" }));
  });

  it("equal only with same purpose", () => {
    const verifier = makeVerifier();
    const loginSgid = SignedGlobalID.create(person(5), { verifier, for: "login" });
    const expected = SignedGlobalID.create(person(5), { verifier, for: "login" });
    const likeSgid = SignedGlobalID.create(person(5), { verifier, for: "like_button" });
    const noPurposeSgid = SignedGlobalID.create(person(5), { verifier });
    expect(loginSgid.equals(expected)).toBe(true);
    expect(loginSgid.equals(likeSgid)).not.toBe(true);
    expect(loginSgid.equals(noPurposeSgid)).not.toBe(true);
  });
});

describe("SignedGlobalIDExpirationTest", () => {
  beforeEach(() => GlobalID.setApp(TEST_APP));
  afterEach(() => (GlobalID["_app"] = undefined));

  it("passing expires_in less than a second is not expired", () => {
    try {
      travelTo("2024-01-01T00:00:00.000Z", { withUsec: true });
      const verifier = makeVerifier();
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresIn: 1 });
      travelTo("2024-01-01T00:00:00.500Z", { withUsec: true });
      assertNotNil(SignedGlobalID.parse(sgid.toString(), { verifier }));
      travelTo("2024-01-01T00:00:02.000Z", { withUsec: true });
      assertNil(SignedGlobalID.parse(sgid.toString(), { verifier }));
    } finally {
      travelBack();
    }
  });

  it("passing expires_in nil turns off expiration checking", () => {
    try {
      travelTo("2024-01-01T00:00:00.000Z", { withUsec: true });
      const verifier = makeVerifier();
      SignedGlobalID.expiresIn = 3600;
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresIn: null });

      travelTo("2024-01-01T01:00:00.000Z", { withUsec: true });
      assertNotNil(SignedGlobalID.parse(sgid.toString(), { verifier }));

      travelTo("2024-01-01T02:00:00.000Z", { withUsec: true });
      assertNotNil(SignedGlobalID.parse(sgid.toString(), { verifier }));
    } finally {
      travelBack();
      _resetSignedGlobalIDClassConfig();
    }
  });

  it("passing expires_at sets expiration date", () => {
    try {
      travelTo("2024-01-01T00:00:00.000Z", { withUsec: true });
      const verifier = makeVerifier();
      const date = Temporal.Instant.from("2024-01-01T23:59:59.999Z");
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresAt: date });
      expect(sgid.expiresAt!.epochMilliseconds).toBe(date.epochMilliseconds);

      travelTo("2024-01-02T00:00:00.000Z", { withUsec: true });
      assertNil(SignedGlobalID.parse(sgid.toString(), { verifier }));
    } finally {
      travelBack();
    }
  });

  it("passing nil expires_at turns off expiration checking", () => {
    try {
      travelTo("2024-01-01T00:00:00.000Z", { withUsec: true });
      const verifier = makeVerifier();
      SignedGlobalID.expiresIn = 3600;
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresAt: null });

      travelTo("2024-01-01T04:00:00.000Z", { withUsec: true });
      assertNotNil(SignedGlobalID.parse(sgid.toString(), { verifier }));
    } finally {
      travelBack();
      _resetSignedGlobalIDClassConfig();
    }
  });

  it("favor expires_at over expires_in", () => {
    try {
      travelTo("2024-01-01T00:00:00.000Z", { withUsec: true });
      const verifier = makeVerifier();
      const sgid = SignedGlobalID.create(person(5), {
        verifier,
        expiresAt: Temporal.Instant.from("2024-01-02T23:59:59.999Z"),
        expiresIn: 3600,
      });

      travelTo("2024-01-01T01:00:00.000Z", { withUsec: true });
      assertNotNil(SignedGlobalID.parse(sgid.toString(), { verifier }));
    } finally {
      travelBack();
    }
  });

  it("expires_in defaults to class level expiration", () => {
    try {
      travelTo("2024-01-01T00:00:00.000Z", { withUsec: true });
      const verifier = makeVerifier();
      SignedGlobalID.expiresIn = 3600;
      const sgid = SignedGlobalID.create(person(5), { verifier });
      travelTo("2024-01-01T00:59:00.000Z", { withUsec: true });
      assertNotNil(SignedGlobalID.parse(sgid.toString(), { verifier }));
      travelTo("2024-01-01T01:01:00.000Z", { withUsec: true });
      assertNil(SignedGlobalID.parse(sgid.toString(), { verifier }));
    } finally {
      travelBack();
      _resetSignedGlobalIDClassConfig();
    }
  });

  it("passing in expires_in overrides class level expiration", () => {
    try {
      travelTo("2024-01-01T00:00:00.000Z", { withUsec: true });
      const verifier = makeVerifier();
      SignedGlobalID.expiresIn = 3600;
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresIn: 7200 });
      travelTo("2024-01-01T01:00:00.000Z", { withUsec: true });
      assertNotNil(SignedGlobalID.parse(sgid.toString(), { verifier }));
      travelTo("2024-01-01T02:00:03.000Z", { withUsec: true });
      assertNil(SignedGlobalID.parse(sgid.toString(), { verifier }));
    } finally {
      travelBack();
      _resetSignedGlobalIDClassConfig();
    }
  });

  it("passing expires_at overrides class level expires_in", () => {
    try {
      travelTo("2024-01-01T00:00:00.000Z", { withUsec: true });
      const verifier = makeVerifier();
      SignedGlobalID.expiresIn = 3600;
      const date = Temporal.Instant.from("2024-01-02T23:59:59.999Z");
      const sgid = SignedGlobalID.create(person(5), { verifier, expiresAt: date });
      expect(sgid.expiresAt!.epochMilliseconds).toBe(date.epochMilliseconds);

      travelTo("2024-01-01T02:00:00.000Z", { withUsec: true });
      assertNotNil(SignedGlobalID.parse(sgid.toString(), { verifier }));
    } finally {
      travelBack();
      _resetSignedGlobalIDClassConfig();
    }
  });
});

describe("SignedGlobalIDCustomParamsTest", () => {
  beforeEach(() => GlobalID.setApp(TEST_APP));
  afterEach(() => (GlobalID["_app"] = undefined));

  it("create custom params", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier, hello: "world" });
    expect(sgid.params!.get("hello")).toBe("world");
  });

  it("parse custom params", () => {
    const verifier = makeVerifier();
    const sgid = SignedGlobalID.create(person(5), { verifier, hello: "world" });
    const parsed = SignedGlobalID.parse(sgid.toString(), { verifier });
    expect(parsed!.params!.get("hello")).toBe("world");
  });
});
