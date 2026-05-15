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

  it("as string", () => {
    expect(GlobalID.create(fakeModel(5)).toString()).toBe("gid://bcx/Person/5");
    expect(GlobalID.create(fakeModel(uuid, "PersonUuid")).toString()).toBe(
      `gid://bcx/PersonUuid/${uuid}`,
    );
    expect(GlobalID.create(fakeModel(4, "Person::Child")).toString()).toBe(
      "gid://bcx/Person::Child/4",
    );
    expect(GlobalID.create(fakeModel(1, "PersonModel")).toString()).toBe("gid://bcx/PersonModel/1");
    expect(
      GlobalID.create(
        fakeModel(["tenant-key-value", "id-value"], "CompositePrimaryKeyModel"),
      ).toString(),
    ).toBe("gid://bcx/CompositePrimaryKeyModel/tenant-key-value/id-value");
  });

  it("as param", () => {
    const gid = GlobalID.create(fakeModel(5));
    expect(gid.toParam()).toBe("Z2lkOi8vYmN4L1BlcnNvbi81");
    expect(GlobalID.parse("Z2lkOi8vYmN4L1BlcnNvbi81")!.equals(gid)).toBe(true);

    const uuidGid = GlobalID.create(fakeModel(uuid, "PersonUuid"));
    expect(GlobalID.parse(uuidGid.toParam())!.equals(uuidGid)).toBe(true);

    const cpkGid = GlobalID.create(
      fakeModel(["tenant-key-value", "id-value"], "CompositePrimaryKeyModel"),
    );
    expect(GlobalID.parse(cpkGid.toParam())!.equals(cpkGid)).toBe(true);
  });

  it("as URI", () => {
    expect(GlobalID.create(fakeModel(5)).uri).toBe("gid://bcx/Person/5");
    expect(GlobalID.create(fakeModel(4, "Person::Child")).uri).toBe("gid://bcx/Person::Child/4");
  });

  it("as JSON", () => {
    const gid = GlobalID.create(fakeModel(5));
    // Mirror Rails GlobalID#as_json — JSON.stringify(gid) calls toJSON() and
    // serializes to the URI string, wrapped in quotes.
    expect(JSON.stringify(gid)).toBe('"gid://bcx/Person/5"');
    expect(JSON.stringify(GlobalID.create(fakeModel(4, "Person::Child")))).toBe(
      '"gid://bcx/Person::Child/4"',
    );
  });

  it("model id", () => {
    expect(GlobalID.create(fakeModel(5)).modelId).toBe("5");
    expect(GlobalID.create(fakeModel(uuid, "PersonUuid")).modelId).toBe(uuid);
    expect(GlobalID.create(fakeModel(4, "Person::Child")).modelId).toBe("4");
    expect(
      GlobalID.create(fakeModel(["tenant-key-value", "id-value"], "CompositePrimaryKeyModel"))
        .modelId,
    ).toEqual(["tenant-key-value", "id-value"]);
  });

  it("model name", () => {
    expect(GlobalID.create(fakeModel(5)).modelName).toBe("Person");
    expect(GlobalID.create(fakeModel(uuid, "PersonUuid")).modelName).toBe("PersonUuid");
    expect(GlobalID.create(fakeModel(4, "Person::Child")).modelName).toBe("Person::Child");
    expect(GlobalID.create(fakeModel(["t", "i"], "CompositePrimaryKeyModel")).modelName).toBe(
      "CompositePrimaryKeyModel",
    );
  });

  it(":app option", () => {
    expect(GlobalID.create(fakeModel(5)).toString()).toBe("gid://bcx/Person/5");
    expect(GlobalID.create(fakeModel(5), { app: "foo" }).toString()).toBe("gid://foo/Person/5");
    _resetApp();
    expect(() => GlobalID.create(fakeModel(5), { app: null as unknown as string })).toThrow();
  });

  it("equality", () => {
    const gid1 = GlobalID.create(fakeModel(5));
    const gid2 = GlobalID.create(fakeModel(5));
    const gid3 = GlobalID.create(fakeModel(10));
    expect(gid1.equals(gid2)).toBe(true);
    expect(gid1.equals(gid3)).toBe(false);
  });
});

describe("GlobalIDCustomParamsTest", () => {
  beforeEach(() => setApp("bcx"));
  afterEach(() => _resetApp());

  it("create custom params", () => {
    const gid = GlobalID.create(fakeModel(5), { hello: "world" });
    expect(gid.params["hello"]).toBe("world");
  });

  it("parse custom params", () => {
    const gid = GlobalID.parse("gid://bcx/Person/5?hello=world");
    expect(gid!.params["hello"]).toBe("world");
  });
});
