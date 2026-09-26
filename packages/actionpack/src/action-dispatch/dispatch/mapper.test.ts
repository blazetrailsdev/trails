import { describe, it, expect } from "vitest";
import { bodyFromString } from "@blazetrails/rack";
import { Mapper, Mapping } from "../routing/mapper.js";
import { Scope } from "../routing/scope.js";
import { Parser } from "../journey/parser.js";
import { RouteSet } from "../routing/route-set.js";
import { ArgumentError } from "@blazetrails/activemodel";

class FakeSet extends RouteSet {
  override resourcesPathNames: Record<string, string> = {};
}

describe("MapperTest", () => {
  it("initialize", () => {
    expect(() => new Mapper(new FakeSet())).not.toThrow();
  });

  it.skip("scope raises on anchor", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    expect(() => m.scope({ anchor: false } as Parameters<Mapper["scope"]>[0], () => {})).toThrow();
  });

  it("blows up without via", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    expect(() => m.match("/", { to: "posts#index", as: "main" })).toThrow(ArgumentError);
  });

  it.skip("unscoped formatted", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    m.get("/foo", { to: "posts#index", as: "main", format: true });
    const route = fakeset.getRoutes()[0];
    expect(route.defaults).toEqual({ controller: "posts", action: "index" });
    expect(route.path).toBe("/foo.:format");
  });

  it.skip("scoped formatted", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    m.scope({ format: true } as Parameters<Mapper["scope"]>[0], () => {
      m.get("/foo", { to: "posts#index", as: "main" });
    });
    const route = fakeset.getRoutes()[0];
    expect(route.defaults).toEqual({ controller: "posts", action: "index" });
    expect(route.path).toBe("/foo.:format");
  });

  it.skip("random keys", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    m.scope({ omg: "awesome" } as Parameters<Mapper["scope"]>[0], () => {
      m.get("/", { to: "posts#index", as: "main" });
    });
    const route = fakeset.getRoutes()[0];
    expect(route.defaults).toMatchObject({ omg: "awesome", controller: "posts", action: "index" });
    expect(route.verb).toBe("GET");
  });

  it("mapping requirements", () => {
    const options = {};
    const scope = new Scope({});
    const ast = Parser.parse("/store/:name(*rest)")!;
    const m = Mapping.build(
      scope,
      new FakeSet(),
      ast,
      "foo",
      "bar",
      undefined,
      ["get"],
      undefined,
      {},
      true,
      options,
    );
    expect(m.requirements["rest"]).toEqual(/.+?/s);
  });

  it.skip("via scope", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    m.scope({ via: "put" } as Parameters<Mapper["scope"]>[0], () => {
      m.match("/", { to: "posts#index", as: "main" });
    });
    expect(fakeset.getRoutes()[0].verb).toBe("PUT");
  });

  it.skip("to scope", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    m.scope({ to: "posts#index" } as Parameters<Mapper["scope"]>[0], () => {
      m.get("all");
      m.post("most");
    });
    expect((fakeset.getRoutes()[0].defaults as Record<string, unknown>)["to"]).toBe("posts#index");
    expect((fakeset.getRoutes()[1].defaults as Record<string, unknown>)["to"]).toBe("posts#index");
  });

  it("map slash", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    m.get("/", { to: "posts#index", as: "main" });
    expect(fakeset.getRoutes()[0].path).toBe("/");
  });

  it("map more slashes", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    m.get("/one/two/", { to: "posts#index", as: "main" });
    expect(fakeset.getRoutes()[0].path).toBe("/one/two(.:format)");
  });

  it.skip("map wildcard", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    m.get("/*path", { to: "pages#show" });
    const route = fakeset.getRoutes()[0];
    expect(route.path).toBe("/*path(.:format)");
    expect((route.requirements as Record<string, RegExp>)["path"]).toEqual(/.+?/ms);
  });

  it.skip("map wildcard with other element", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    m.get("/*path/foo/:bar", { to: "pages#show" });
    const route = fakeset.getRoutes()[0];
    expect(route.path).toBe("/*path/foo/:bar(.:format)");
    expect((route.requirements as Record<string, RegExp>)["path"]).toEqual(/.+?/ms);
  });

  it.skip("map wildcard with multiple wildcard", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    m.get("/*foo/*bar", { to: "pages#show" });
    const route = fakeset.getRoutes()[0];
    expect(route.path).toBe("/*foo/*bar(.:format)");
    expect((route.requirements as Record<string, RegExp>)["foo"]).toEqual(/.+?/ms);
    expect((route.requirements as Record<string, RegExp>)["bar"]).toEqual(/.+?/ms);
  });

  it("map wildcard with format false", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    m.get("/*path", { to: "pages#show", format: false });
    const route = fakeset.getRoutes()[0];
    expect(route.path).toBe("/*path");
    expect((route.requirements as Record<string, unknown>)["path"]).toBeUndefined();
  });

  it("map wildcard with format true", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    m.get("/*path", { to: "pages#show", format: true });
    expect(fakeset.getRoutes()[0].path).toBe("/*path.:format");
  });

  const app = (_env: Record<string, unknown>) => [200, {}, bodyFromString("")] as const;

  it("can pass anchor to mount", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    m.mount(app, { at: "/path", anchor: true });
    expect(fakeset.getRoutes()[0].path).toBe("/path");
    expect(fakeset.getRoutes()[0].anchor).toBe(true);
  });

  it("raising error when path is not passed", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    expect(() => m.mount(app)).toThrow(/mount point/);
  });

  it("raising error when rack app is not passed", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    expect(() =>
      m.mount(10 as unknown as Parameters<Mapper["mount"]>[0], { as: "exciting" }),
    ).toThrow(/rack application must be specified/);
    expect(() =>
      m.mount(undefined as unknown as Parameters<Mapper["mount"]>[0], { as: "exciting" }),
    ).toThrow(/rack application must be specified/);
  });

  it("raising error when invalid on option is given", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    let error: Error | undefined;
    try {
      m.get("/foo", { on: "invalid_option" });
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toBe("Unknown scope :invalid_option given to :on");
  });

  it("scope does not destructively mutate default options", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    const frozen = Object.freeze({ foo: "bar" });
    expect(() =>
      m.scope({ defaults: frozen } as Parameters<Mapper["scope"]>[0], () => {}),
    ).not.toThrow();
  });
});

describe("Mapper#mount dispatch", () => {
  it("forwards a matched request to the mounted app with SCRIPT_NAME/PATH_INFO rewritten", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const engine = (env: Record<string, unknown>) => {
      seen.push({ SCRIPT_NAME: env["SCRIPT_NAME"], PATH_INFO: env["PATH_INFO"] });
      return [200, { "content-type": "text/plain" }, bodyFromString("engine-ok")];
    };
    const routes = new RouteSet();
    routes.draw((r) => r.mount(engine, { at: "/foo" }));

    const res = await routes.call({ REQUEST_METHOD: "GET", PATH_INFO: "/foo/bar" });
    expect(res[0]).toBe(200);
    expect(seen).toEqual([{ SCRIPT_NAME: "/foo", PATH_INFO: "/bar" }]);
  });

  it("dynamic mount points get SCRIPT_NAME from Journey's matched prefix", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const engine = (env: Record<string, unknown>) => {
      seen.push({
        SCRIPT_NAME: env["SCRIPT_NAME"],
        PATH_INFO: env["PATH_INFO"],
        path_parameters: env["action_dispatch.request.path_parameters"],
      });
      return [200, {}, bodyFromString("")];
    };
    const routes = new RouteSet();
    routes.draw((r) => r.mount(engine, { at: "/:tenant" }));

    await routes.call({ REQUEST_METHOD: "GET", PATH_INFO: "/acme/widgets" });
    expect(seen).toEqual([
      { SCRIPT_NAME: "/acme", PATH_INFO: "/widgets", path_parameters: { tenant: "acme" } },
    ]);
  });
});
