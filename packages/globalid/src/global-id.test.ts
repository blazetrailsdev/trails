import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setApp, _resetApp } from "./config.js";
import { GlobalID } from "./global-id.js";

const fakeModel = (id: unknown, name = "Person") => ({
  id,
  constructor: { name },
});

describe("GlobalIDTest", () => {
  it("value equality", () => {
    const a = GlobalID.parse("gid://app/Person/5")!;
    const b = GlobalID.parse("gid://app/Person/5")!;
    expect(a.equals(b)).toBe(true);
  });

  it("invalid app name", () => {
    expect(() => GlobalID.validateApp("")).toThrow();
    expect(() => GlobalID.validateApp("blog_app")).toThrow();
    expect(() => GlobalID.validateApp(null)).toThrow();
  });
});

describe("GlobalIDParamEncodedTest", () => {
  beforeEach(() => setApp("bcx"));
  afterEach(() => _resetApp());

  it("parsing", () => {
    const gid = GlobalID.create(fakeModel("id"));
    const parsed = GlobalID.parse(gid.toParam());
    expect(parsed).not.toBeNull();
    expect(parsed!.equals(gid)).toBe(true);
  });
});

describe("GlobalIDCreationTest", () => {
  const uuid = "7ef9b614-353c-43a1-a203-ab2307851990";

  beforeEach(() => setApp("bcx"));
  afterEach(() => _resetApp());

  it("model name", () => {
    const gid = GlobalID.create(fakeModel(5));
    expect(gid.modelName).toBe("Person");
  });

  it("model id", () => {
    const gid = GlobalID.create(fakeModel(5));
    expect(gid.modelId).toBe("5");
  });

  it("model uuid id", () => {
    const gid = GlobalID.create(fakeModel(uuid, "PersonUuid"));
    expect(gid.modelId).toBe(uuid);
  });

  it("model namespaced class name", () => {
    const gid = GlobalID.create({ id: 4, constructor: { name: "Person::Child" } });
    expect(gid.modelName).toBe("Person::Child");
  });

  it("model composite primary key", () => {
    const gid = GlobalID.create(
      fakeModel(["tenant-key-value", "id-value"], "CompositePrimaryKeyModel"),
    );
    expect(gid.modelId).toEqual(["tenant-key-value", "id-value"]);
  });

  it("uri", () => {
    const gid = GlobalID.create(fakeModel(5));
    expect(gid.uri).toBe("gid://bcx/Person/5");
  });

  it("string", () => {
    const gid = GlobalID.create(fakeModel(5));
    expect(gid.toString()).toBe("gid://bcx/Person/5");
  });

  it("param", () => {
    const gid = GlobalID.create(fakeModel(5));
    const param = gid.toParam();
    expect(typeof param).toBe("string");
    expect(GlobalID.parse(param)!.equals(gid)).toBe(true);
  });

  it("app required", () => {
    _resetApp();
    expect(() => GlobalID.create(fakeModel(5))).toThrow(/app is required/i);
  });

  it("app option overrides configured app", () => {
    const gid = GlobalID.create(fakeModel(5), { app: "override" });
    expect(gid.app).toBe("override");
  });
});

describe("GlobalID.parse", () => {
  afterEach(() => _resetApp());

  it("parses gid:// string", () => {
    const gid = GlobalID.parse("gid://bcx/Person/5");
    expect(gid).not.toBeNull();
    expect(gid!.modelName).toBe("Person");
  });

  it("returns same instance when given a GlobalID", () => {
    setApp("bcx");
    const gid = GlobalID.create(fakeModel(5));
    expect(GlobalID.parse(gid)).toBe(gid);
  });

  it("returns null for invalid input", () => {
    expect(GlobalID.parse("not-a-gid")).toBeNull();
  });
});
