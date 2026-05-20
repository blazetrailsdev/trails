import { describe, expect, it } from "vitest";

import { Mapper } from "./mapper.js";
import { RouteSet } from "./route-set.js";

describe("Mapper.normalizePath", () => {
  it("collapses duplicate slashes", () => {
    expect(Mapper.normalizePath("foo//bar")).toBe("/foo/bar");
    expect(Mapper.normalizePath("//foo///bar//")).toBe("/foo/bar");
  });

  it("ensures a leading slash", () => {
    expect(Mapper.normalizePath("foo")).toBe("/foo");
    expect(Mapper.normalizePath("foo/bar")).toBe("/foo/bar");
  });

  it("strips trailing slashes", () => {
    expect(Mapper.normalizePath("/foo/")).toBe("/foo");
  });

  it("reorders inner '/((' to '((/'", () => {
    expect(Mapper.normalizePath("/(/:locale)(/:platform)")).toBe("/(:locale)(/:platform)");
  });

  it("reorders leading '(/' back to '/(' when the whole path is optional", () => {
    expect(Mapper.normalizePath("(/:locale)(/:platform)(/:browser)")).toBe(
      "/(:locale)(/:platform)(/:browser)",
    );
  });
});

describe("Mapper.normalizeName", () => {
  it("normalizes path and replaces slashes with underscores", () => {
    expect(Mapper.normalizeName("foo/bar")).toBe("foo_bar");
    expect(Mapper.normalizeName("/foo/bar/")).toBe("foo_bar");
    expect(Mapper.normalizeName("foo//bar")).toBe("foo_bar");
  });
});

describe("scope-merge helpers", () => {
  const m = new Mapper();

  it("mergePathScope concatenates and normalizes", () => {
    expect(m.mergePathScope("/foo", "bar")).toBe("/foo/bar");
    expect(m.mergePathScope(undefined, "foo")).toBe("/foo");
  });

  it("mergeAsScope joins with underscore, falls back to child", () => {
    expect(m.mergeAsScope("admin", "users")).toBe("admin_users");
    expect(m.mergeAsScope(undefined, "users")).toBe("users");
  });

  it("mergeModuleScope joins with slash, falls back to child", () => {
    expect(m.mergeModuleScope("admin", "users")).toBe("admin/users");
    expect(m.mergeModuleScope(undefined, "users")).toBe("users");
  });

  it("mergeControllerScope/mergeActionScope/mergeViaScope/mergeFormatScope/mergeToScope return child", () => {
    expect(m.mergeControllerScope("old", "new")).toBe("new");
    expect(m.mergeActionScope("old", "new")).toBe("new");
    expect(m.mergeViaScope("get", ["post"])).toEqual(["post"]);
    expect(m.mergeFormatScope("json", "xml")).toBe("xml");
    expect(m.mergeToScope("a", "b")).toBe("b");
  });

  it("mergeOptionsScope merges child over parent", () => {
    expect(m.mergeOptionsScope({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
    expect(m.mergeOptionsScope(undefined, { c: 4 })).toEqual({ c: 4 });
  });

  it("mergeBlocksScope appends child to copy of parent", () => {
    const a = () => {};
    const b = () => {};
    expect(m.mergeBlocksScope([a], b)).toEqual([a, b]);
    expect(m.mergeBlocksScope(undefined, b)).toEqual([b]);
    expect(m.mergeBlocksScope([a], undefined)).toEqual([a]);
  });

  it("mergeShallowScope reduces to boolean child (Rails: parent is dropped)", () => {
    expect(m.mergeShallowScope(true, true)).toBe(true);
    expect(m.mergeShallowScope(true, undefined)).toBe(false);
    expect(m.mergeShallowScope(false, "anything")).toBe(true);
  });
});

describe("Mapper public DSL additions", () => {
  it("nested throws outside a resource scope", () => {
    const m = new Mapper();
    expect(() => m.nested(() => {})).toThrow(/can't use nested outside resource\(s\) scope/);
  });

  it("nested runs inside a resources block", () => {
    const m = new Mapper();
    let ran = false;
    m.resources("posts", () => {
      m.nested(() => {
        ran = true;
      });
    });
    expect(ran).toBe(true);
  });

  it("shallow preserves the outer path prefix on its frame", () => {
    const m = new Mapper();
    let observedInside: string | undefined;
    m.scope("/admin", () => {
      m.shallow(() => {
        observedInside = m["currentPrefix"]();
      });
    });
    expect(observedInside).toBe("/admin");
  });

  it("draw runs a callback form", () => {
    const m = new Mapper();
    let inner: Mapper | undefined;
    m.draw((inside) => {
      inner = inside;
    });
    expect(inner).toBe(m);
  });

  it("draw throws on the string (file-load) form", () => {
    const m = new Mapper();
    expect(() => m.draw("admin")).toThrow(/file-based draw is not supported/);
  });

  it("defaultUrlOptions getter/setter round-trip", () => {
    const m = new Mapper();
    m.defaultUrlOptions = { host: "example.com" };
    expect(m.defaultUrlOptions).toEqual({ host: "example.com" });
  });

  it("defaultUrlOptions delegates to an attached set", () => {
    const set: { defaultUrlOptions: Record<string, unknown> } = { defaultUrlOptions: {} };
    const m = new Mapper(set);
    m.defaultUrlOptions = { port: 3000 };
    expect(set.defaultUrlOptions).toEqual({ port: 3000 });
    expect(m.defaultUrlOptions).toEqual({ port: 3000 });
  });

  it("setMemberMappingsForResource emits canonical member routes for the parent resource actions", () => {
    const m = new Mapper();
    let before = 0;
    m.resources("posts", () => {
      before = m.routes.length;
      m.setMemberMappingsForResource();
    });
    const added = m.routes.slice(before, before + 5);
    expect(added.map((r) => `${r.verb} ${r.path}#${r.action}`)).toEqual([
      "GET /posts/:id/edit#edit",
      "GET /posts/:id#show",
      "PATCH /posts/:id#update",
      "PUT /posts/:id#update",
      "DELETE /posts/:id#destroy",
    ]);
    expect(added.every((r) => r.controller === "posts")).toBe(true);
  });

  it("shallow inside a namespace preserves the namespace prefix on member paths", () => {
    const m = new Mapper();
    m.namespace("admin", () => {
      m.resources("posts", { shallow: true }, () => {
        m.resources("comments");
      });
    });
    const commentShow = m.routes.find(
      (r) => r.action === "show" && r.controller.endsWith("comments"),
    );
    expect(commentShow?.path).toBe("/admin/comments/:id");
  });

  it("setMemberMappingsForResource is a safe no-op outside a resource scope", () => {
    const m = new Mapper();
    expect(() => m.setMemberMappingsForResource()).not.toThrow();
    expect(m.routes).toEqual([]);
  });
});

describe("Mapper#mount", () => {
  const app = (_env: Record<string, unknown>) => [200, {}, [""]] as const;

  it("test_can_pass_anchor_to_mount", () => {
    const m = new Mapper();
    m.mount(app, { at: "/path", anchor: true });
    expect(m.routes[0].path).toBe("/path");
    expect(m.routes[0].anchor).toBe(true);
  });

  it("test_raising_error_when_path_is_not_passed", () => {
    const m = new Mapper();
    expect(() => m.mount(app)).toThrow(/mount point/);
  });

  it("test_raising_error_when_rack_app_is_not_passed", () => {
    const m = new Mapper();
    expect(() =>
      m.mount(10 as unknown as Parameters<Mapper["mount"]>[0], { as: "exciting" }),
    ).toThrow(/rack application must be specified/);
    expect(() =>
      m.mount(undefined as unknown as Parameters<Mapper["mount"]>[0], { as: "exciting" }),
    ).toThrow(/rack application must be specified/);
  });

  it("defaults anchor to false so prefix paths match nested URLs", () => {
    const m = new Mapper();
    m.mount(app, { at: "/foo" });
    expect(m.routes[0].path).toBe("/foo");
    expect(m.routes[0].anchor).toBe(false);
  });

  it("stores the mounted app on the route for dispatch", () => {
    const m = new Mapper();
    m.mount(app, { at: "/foo" });
    expect(m.routes[0].app).toBe(app);
  });

  it("RouteSet#call forwards a matched request to the mounted app with SCRIPT_NAME/PATH_INFO rewritten", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const engine = (env: Record<string, unknown>) => {
      seen.push({ SCRIPT_NAME: env["SCRIPT_NAME"], PATH_INFO: env["PATH_INFO"] });
      return [200, { "content-type": "text/plain" }, ["engine-ok"]];
    };
    const routes = new RouteSet();
    routes.draw((r) => r.mount(engine, { at: "/foo" }));

    const res = await routes.call({ REQUEST_METHOD: "GET", PATH_INFO: "/foo/bar" });
    expect(res[0]).toBe(200);
    expect(seen).toEqual([{ SCRIPT_NAME: "/foo", PATH_INFO: "/bar" }]);
  });
});
