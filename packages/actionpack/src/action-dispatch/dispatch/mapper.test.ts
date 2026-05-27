import { describe, it, expect } from "vitest";
import { bodyFromString } from "@blazetrails/rack";
import { Mapper } from "../routing/mapper.js";
import { RouteSet } from "../routing/route-set.js";

// ==========================================================================
// dispatch/mapper_test.rb
//
// Rails-design rationale: MapperTest validates ActionDispatch::Routing::Mapper
// via a FakeSet shim that exposes `asts`, `defaults`, `requirements`, and
// `conditions` from the Journey route table. In Trails the Route object
// carries equivalent data; where Rails inspects `route.path.spec.to_s` for
// the AST string (including format suffix) we inspect `route.path` directly.
// Scope-option propagation (via:, to:, format:, random keys) and automatic
// glob-wildcard requirements are not yet wired; those tests are skipped with
// a "pending:" rationale so test:compare can track them.
// ==========================================================================
describe("MapperTest", () => {
  it("initialize", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/foo", { to: "foo#index" });
    });
    expect(routes.getRoutes().length).toBeGreaterThan(0);
  });

  // Rails: test_scope_raises_on_anchor
  it.skip("scope raises on anchor", () => {
    // pending: scope() does not validate the anchor option — raises ArgumentError in Rails
    const m = new Mapper();
    expect(() => m.scope({ anchor: false } as Parameters<Mapper["scope"]>[0], () => {})).toThrow();
  });

  // Rails: test_blows_up_without_via
  it.skip("blows up without via", () => {
    // pending: match() defaults via to ALL instead of raising when via is omitted
    const m = new Mapper();
    expect(() => m.match("/", { to: "posts#index", as: "main" })).toThrow();
  });

  // Rails: test_unscoped_formatted
  it.skip("unscoped formatted", () => {
    // pending: route.path does not include .:format suffix; format suffix lives in route.formatted
    const m = new Mapper();
    m.get("/foo", { to: "posts#index", as: "main", format: true });
    const route = m.routes[0]!;
    expect(route.defaults).toEqual({ controller: "posts", action: "index" });
    expect(route.path).toBe("/foo.:format");
  });

  // Rails: test_scoped_formatted
  it.skip("scoped formatted", () => {
    // pending: scope(format: true) not wired into _scope
    const m = new Mapper();
    m.scope({ format: true } as Parameters<Mapper["scope"]>[0], () => {
      m.get("/foo", { to: "posts#index", as: "main" });
    });
    const route = m.routes[0]!;
    expect(route.defaults).toEqual({ controller: "posts", action: "index" });
    expect(route.path).toBe("/foo.:format");
  });

  // Rails: test_random_keys
  it.skip("random keys", () => {
    // pending: scope() does not propagate custom option keys into route defaults
    const m = new Mapper();
    m.scope({ omg: "awesome" } as Parameters<Mapper["scope"]>[0], () => {
      m.get("/", { to: "posts#index", as: "main" });
    });
    const route = m.routes[0]!;
    expect(route.defaults).toMatchObject({ omg: "awesome", controller: "posts", action: "index" });
    expect(route.verb).toBe("GET");
  });

  // Rails: test_mapping_requirements
  it.skip("mapping requirements", () => {
    // pending: Mapper::Scope and Mapper::Mapping internal APIs not ported
  });

  // Rails: test_via_scope
  it.skip("via scope", () => {
    // pending: scope(via: ...) not wired into _scope
    const m = new Mapper();
    m.scope({ via: "put" } as Parameters<Mapper["scope"]>[0], () => {
      m.match("/", { to: "posts#index", as: "main" });
    });
    expect(m.routes[0]!.verb).toBe("PUT");
  });

  // Rails: test_to_scope
  it.skip("to scope", () => {
    // pending: scope(to: ...) not wired into _scope; route.defaults does not include :to
    const m = new Mapper();
    m.scope({ to: "posts#index" } as Parameters<Mapper["scope"]>[0], () => {
      m.get("all");
      m.post("most");
    });
    expect((m.routes[0]!.defaults as Record<string, unknown>)["to"]).toBe("posts#index");
    expect((m.routes[1]!.defaults as Record<string, unknown>)["to"]).toBe("posts#index");
  });

  // Rails: test_map_slash
  it("map slash", () => {
    const m = new Mapper();
    m.get("/", { to: "posts#index", as: "main" });
    expect(m.routes[0]!.path).toBe("/");
  });

  // Rails: test_map_more_slashes
  it.skip("map more slashes", () => {
    // pending: route.path does not include the (.:format) suffix automatically
    const m = new Mapper();
    m.get("/one/two/", { to: "posts#index", as: "main" });
    expect(m.routes[0]!.path).toBe("/one/two(.:format)");
  });

  // Rails: test_map_wildcard
  it.skip("map wildcard", () => {
    // pending: glob wildcard requirements (/.+?/ms) not auto-set; path lacks (.:format)
    const m = new Mapper();
    m.get("/*path", { to: "pages#show" });
    const route = m.routes[0]!;
    expect(route.path).toBe("/*path(.:format)");
    expect((route.requirements as Record<string, RegExp>)["path"]).toEqual(/.+?/ms);
  });

  // Rails: test_map_wildcard_with_other_element
  it.skip("map wildcard with other element", () => {
    // pending: glob wildcard requirements not auto-set; path lacks format suffix
    const m = new Mapper();
    m.get("/*path/foo/:bar", { to: "pages#show" });
    const route = m.routes[0]!;
    expect(route.path).toBe("/*path/foo/:bar(.:format)");
    expect((route.requirements as Record<string, RegExp>)["path"]).toEqual(/.+?/ms);
  });

  // Rails: test_map_wildcard_with_multiple_wildcard
  it.skip("map wildcard with multiple wildcard", () => {
    // pending: glob wildcard requirements not auto-set; path lacks format suffix
    const m = new Mapper();
    m.get("/*foo/*bar", { to: "pages#show" });
    const route = m.routes[0]!;
    expect(route.path).toBe("/*foo/*bar(.:format)");
    expect((route.requirements as Record<string, RegExp>)["foo"]).toEqual(/.+?/ms);
    expect((route.requirements as Record<string, RegExp>)["bar"]).toEqual(/.+?/ms);
  });

  // Rails: test_map_wildcard_with_format_false
  it.skip("map wildcard with format false", () => {
    // pending: route.path does not reflect format: false; glob requirements not auto-set
    const m = new Mapper();
    m.get("/*path", { to: "pages#show", format: false });
    const route = m.routes[0]!;
    expect(route.path).toBe("/*path");
    expect((route.requirements as Record<string, unknown>)["path"]).toBeUndefined();
  });

  // Rails: test_map_wildcard_with_format_true
  it.skip("map wildcard with format true", () => {
    // pending: route.path does not include .:format suffix
    const m = new Mapper();
    m.get("/*path", { to: "pages#show", format: true });
    expect(m.routes[0]!.path).toBe("/*path.:format");
  });

  const app = (_env: Record<string, unknown>) => [200, {}, bodyFromString("")] as const;

  it("can pass anchor to mount", () => {
    const m = new Mapper();
    m.mount(app, { at: "/path", anchor: true });
    expect(m.routes[0].path).toBe("/path");
    expect(m.routes[0].anchor).toBe(true);
  });

  it("raising error when path is not passed", () => {
    const m = new Mapper();
    expect(() => m.mount(app)).toThrow(/mount point/);
  });

  it("raising error when rack app is not passed", () => {
    const m = new Mapper();
    expect(() =>
      m.mount(10 as unknown as Parameters<Mapper["mount"]>[0], { as: "exciting" }),
    ).toThrow(/rack application must be specified/);
    expect(() =>
      m.mount(undefined as unknown as Parameters<Mapper["mount"]>[0], { as: "exciting" }),
    ).toThrow(/rack application must be specified/);
  });

  // Rails: test_raising_error_when_invalid_on_option_is_given
  it("raising error when invalid on option is given", () => {
    const m = new Mapper();
    let error: Error | undefined;
    try {
      m.get("/foo", { on: "invalid_option" });
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toBe("Unknown scope :invalid_option given to :on");
  });

  // Rails: test_scope_does_not_destructively_mutate_default_options
  it("scope does not destructively mutate default options", () => {
    const m = new Mapper();
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
