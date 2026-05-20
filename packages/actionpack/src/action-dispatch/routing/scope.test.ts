import { describe, expect, it } from "vitest";

import { Scope } from "./scope.js";

describe("Scope", () => {
  it("root is the ROOT sentinel; isRoot reports children of ROOT", () => {
    expect(Scope.ROOT.isNull()).toBe(true);
    const child = new Scope({ path: "/admin" });
    expect(child.isRoot()).toBe(true);
    expect(child.isNull()).toBe(false);
  });

  it("newChild merges over parent frame and inherits scopeLevel", () => {
    const a = new Scope({ path: "/admin", as: "admin" }, Scope.ROOT, "resources");
    const b = a.newChild({ as: "users" });
    expect(b.get("path")).toBe("/admin");
    expect(b.get("as")).toBe("users");
    expect(b.scopeLevel).toBe("resources");
    expect(b.parent).toBe(a);
  });

  it("newLevel preserves frame, changes scopeLevel", () => {
    const a = new Scope({ path: "/admin" }, Scope.ROOT, "resources");
    const b = a.newLevel("nested");
    expect(b.get("path")).toBe("/admin");
    expect(b.scopeLevel).toBe("nested");
    expect(b.isNested()).toBe(true);
  });

  it("scope-level predicates match Rails RESOURCE_SCOPES / RESOURCE_METHOD_SCOPES", () => {
    expect(new Scope({}, Scope.ROOT, "resource").isResourceScope()).toBe(true);
    expect(new Scope({}, Scope.ROOT, "resources").isResourceScope()).toBe(true);
    expect(new Scope({}, Scope.ROOT, "member").isResourceScope()).toBe(false);
    expect(new Scope({}, Scope.ROOT, "collection").isResourceMethodScope()).toBe(true);
    expect(new Scope({}, Scope.ROOT, "member").isResourceMethodScope()).toBe(true);
    expect(new Scope({}, Scope.ROOT, "new").isResourceMethodScope()).toBe(true);
    expect(new Scope({}, Scope.ROOT, "nested").isResourceMethodScope()).toBe(false);
  });

  it("actionName returns Rails-ordered tuples per scope level", () => {
    const s = (lvl: Parameters<Scope["newLevel"]>[0]) => new Scope({}, Scope.ROOT, lvl);
    expect(s("nested").actionName("np", "pre", "coll", "mem")).toEqual(["np", "pre"]);
    expect(s("collection").actionName("np", "pre", "coll", "mem")).toEqual(["pre", "np", "coll"]);
    expect(s("new").actionName("np", "pre", "coll", "mem")).toEqual(["pre", "new", "np", "mem"]);
    expect(s("member").actionName("np", "pre", "coll", "mem")).toEqual(["pre", "np", "mem"]);
    expect(s("root").actionName("np", "pre", "coll", "mem")).toEqual(["np", "coll", "pre"]);
    expect(s(null).actionName("np", "pre", "coll", "mem")).toEqual(["np", "mem", "pre"]);
  });

  it("iterator yields each frame up to (not including) ROOT", () => {
    const a = new Scope({ path: "/a" });
    const b = a.newChild({ as: "b" });
    const c = b.newChild({ controller: "c" });
    expect([...c]).toEqual([c, b, a]);
    expect([...Scope.ROOT]).toEqual([]);
  });
});
