import { describe, expect, it } from "vitest";
import {
  parseGid,
  buildGid,
  validateApp,
  MissingModelIdError,
  InvalidComponentError,
  BadURIError,
} from "./uri/gid.js";

describe("URI::GIDTest", () => {
  it("parsed", () => {
    const gid = parseGid("gid://bcx/Person/5");
    expect(gid.app).toBe("bcx");
    expect(gid.modelName).toBe("Person");
    expect(gid.modelId).toBe("5");
    const cpkGid = parseGid("gid://bcx/CompositePrimaryKeyModel/tenant-key-value/id-value");
    expect(cpkGid.modelId).toEqual(["tenant-key-value", "id-value"]);
  });

  it("parsed for non existing model class", () => {
    const flatGid = parseGid("gid://bcx/NonExistingModel/1");
    expect(flatGid.modelId).toBe("1");
    expect(flatGid.modelName).toBe("NonExistingModel");
    const compositeGid = parseGid("gid://bcx/NonExistingModel/tenant-key-value/id-value");
    expect(compositeGid.modelId).toEqual(["tenant-key-value", "id-value"]);
    expect(compositeGid.modelName).toBe("NonExistingModel");
  });

  it("create", () => {
    const uri = buildGid("bcx", "Person", "5");
    expect(uri).toBe("gid://bcx/Person/5");
  });

  it("create from a composite primary key model", () => {
    const uri = buildGid("bcx", "CompositePrimaryKeyModel", ["tenant-key-value", "id-value"]);
    expect(uri).toBe("gid://bcx/CompositePrimaryKeyModel/tenant-key-value/id-value");
  });

  it("build", () => {
    const a = buildGid("bcx", "Person", "5");
    const b = buildGid("bcx", "Person", "5");
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).toBe(b);
  });

  it("build with a composite primary key", () => {
    const a = buildGid("bcx", "CompositePrimaryKeyModel", ["tenant-key-value", "id-value"]);
    const b = buildGid("bcx", "CompositePrimaryKeyModel", ["tenant-key-value", "id-value"]);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).toBe(b);
    expect(a).toBe("gid://bcx/CompositePrimaryKeyModel/tenant-key-value/id-value");
  });

  it("as String", () => {
    const gidStr = "gid://bcx/Person/5";
    const gid = parseGid(gidStr);
    expect(buildGid(gid.app, gid.modelName, gid.modelId)).toBe(gidStr);
  });

  it("equal", () => {
    const a = parseGid("gid://bcx/Person/5");
    const b = parseGid("gid://bcx/Person/5");
    expect(a.app).toBe(b.app);
    expect(a.modelName).toBe(b.modelName);
    expect(a.modelId).toBe(b.modelId);
    const c = parseGid("gid://bcxxx/Persona/1");
    expect(a.app).not.toBe(c.app);
  });
});

describe("URI::GIDModelIDEncodingTest", () => {
  it("alphanumeric", () => {
    const uri = buildGid("app", "Person", "John123");
    expect(uri).toBe("gid://app/Person/John123");
  });

  it("non-alphanumeric", () => {
    const uri = buildGid("app", "Person", "John Doe-Smith/Jones");
    expect(uri).toBe("gid://app/Person/John+Doe-Smith%2FJones");
  });

  it("every part of composite primary key is encoded", () => {
    const uri = buildGid("app", "CompositePrimaryKeyModel", ["tenant key", "id value"]);
    expect(uri).toBe("gid://app/CompositePrimaryKeyModel/tenant+key/id+value");
  });
});

describe("URI::GIDModelIDDecodingTest", () => {
  it("alphanumeric", () => {
    expect(parseGid("gid://app/Person/John123").modelId).toBe("John123");
  });

  it("non-alphanumeric", () => {
    expect(parseGid("gid://app/Person/John+Doe-Smith%2FJones").modelId).toBe(
      "John Doe-Smith/Jones",
    );
  });

  it("every part of composite primary key is decoded", () => {
    const gid = parseGid("gid://app/CompositePrimaryKeyModel/tenant+key+value/id+value");
    expect(gid.modelId).toEqual(["tenant key value", "id value"]);
  });
});

describe("URI::GIDValidationTest", () => {
  it("missing app", () => {
    expect(() => parseGid("gid:///Person/1")).toThrow(InvalidComponentError);
  });

  it("missing path", () => {
    expect(() => parseGid("gid://bcx/")).toThrow();
  });

  it("missing model id", () => {
    expect(() => parseGid("gid://bcx/Person")).toThrow(MissingModelIdError);
    expect(() => parseGid("gid://bcx/Person")).toThrow(/Unable to create a Global ID for Person/);
  });

  it("missing model composite id", () => {
    expect(() => parseGid("gid://bcx/CompositePrimaryKeyModel")).toThrow(MissingModelIdError);
    expect(() => parseGid("gid://bcx/CompositePrimaryKeyModel")).toThrow(
      /Unable to create a Global ID for CompositePrimaryKeyModel/,
    );
  });

  it("empty", () => {
    expect(() => parseGid("gid:///")).toThrow();
  });

  it("invalid schemes", () => {
    expect(() => parseGid("http://bcx/Person/5")).toThrow(BadURIError);
    expect(() => parseGid("gyd://bcx/Person/5")).toThrow(BadURIError);
    expect(() => parseGid("//bcx/Person/5")).toThrow(BadURIError);
  });
});

describe("URI::GIDAppValidationTest", () => {
  it("nil or blank apps are invalid", () => {
    expect(() => validateApp(null)).toThrow();
    expect(() => validateApp("")).toThrow();
  });

  it("apps containing non alphanumeric characters are invalid", () => {
    expect(() => validateApp("foo&bar")).toThrow();
    expect(() => validateApp("foo:bar")).toThrow();
    expect(() => validateApp("foo_bar")).toThrow();
  });

  it("app with hyphen is allowed", () => {
    expect(validateApp("foo-bar")).toBe("foo-bar");
  });
});

describe("URI::GIDParamsTest", () => {
  it("indifferent key access", () => {
    const uri = buildGid("bcx", "Person", "5", { hello: "world" });
    const gid = parseGid(uri);
    expect(gid.params["hello"]).toBe("world");
  });

  it("integer option", () => {
    const uri = buildGid("bcx", "Person", "5", { integer: "20" });
    const gid = parseGid(uri);
    expect(gid.params["integer"]).toBe("20");
  });

  it("multi value params returns last value", () => {
    const gid = parseGid("gid://bcx/Person/5?multi=one&multi=two");
    expect(gid.params["multi"]).toBe("two");
  });

  it("as String", () => {
    const uri = buildGid("bcx", "Person", "5", { hello: "world" });
    expect(uri).toBe("gid://bcx/Person/5?hello=world");
  });
});
