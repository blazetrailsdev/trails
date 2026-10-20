import { describe, expect, it } from "vitest";
import { GID } from "./uri/gid.js";

describe("URI::GID class wrapper", () => {
  it("GID.parse exposes app / modelName / modelId / params", () => {
    const gid = GID.parse("gid://bcx/Person/5?hello=world");
    expect(gid.app).toBe("bcx");
    expect(gid.modelName).toBe("Person");
    expect(gid.modelId).toBe("5");
    expect(gid.params!.get("hello")).toBe("world");
    expect(gid.toString()).toBe("gid://bcx/Person/5?hello=world");
  });

  it("GID.create builds from app + model instance", () => {
    const gid = GID.create(
      "bcx",
      new (class Person {
        id = 5;
      })(),
    );
    expect(gid.toString()).toBe("gid://bcx/Person/5");
  });

  it("GID.build accepts a components-hash with composite primary key", () => {
    const gid = GID.build({
      app: "bcx",
      modelName: "CompositePrimaryKeyModel",
      modelId: ["tenant", "id"],
      params: { db: "primary" },
    });
    expect(gid.toString()).toBe("gid://bcx/CompositePrimaryKeyModel/tenant/id?db=primary");
    expect(gid.modelId).toEqual(["tenant", "id"]);
  });

  it("GID.validateApp rejects invalid app names", () => {
    expect(() => GID.validateApp(null)).toThrow();
    expect(() => GID.validateApp("foo_bar")).toThrow();
    expect(GID.validateApp("foo-bar")).toBe("foo-bar");
  });

  it("GID#deconstructKeys answers the live components", () => {
    const gid = GID.parse("gid://bcx/Person/5?k=v");
    const a = gid.deconstructKeys(null);
    expect([a.app, a.modelName, a.modelId, a.params]).toEqual(["bcx", "Person", "5", gid.params]);
  });
});
