import { describe, it, expect } from "vitest";
import { bodyFromString } from "@blazetrails/rack";
import { Mapper, Mapping, type MountableApp } from "../routing/mapper.js";
import { Parser } from "../journey/parser.js";
import { Dispatcher, RouteSet } from "../routing/route-set.js";
import { Request } from "../http/request.js";
import type { Pattern } from "../journey/path/pattern.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { assertEqual, assertRaises } from "@blazetrails/activesupport";

class FakeSet extends RouteSet {
  override resourcesPathNames: Record<string, string> = {};

  override requestClass(): typeof Request {
    return Request;
  }

  dispatcherClass(): typeof Dispatcher {
    return Dispatcher;
  }

  defaults(): Record<string, unknown>[] {
    return [...this.routes].map((route) => route.defaults);
  }

  conditions(): Record<string, unknown>[] {
    return [...this.routes].map((route) => route.constraints);
  }

  requirements(): Pattern["requirements"][] {
    return [...this.routes].map((route) => route.path).map((path) => path.requirements);
  }

  asts(): Pattern["spec"][] {
    return [...this.routes].map((route) => route.path).map((path) => path.spec);
  }
}

describe("MapperTest", () => {
  it("initialize", () => {
    expect(() => new Mapper(new FakeSet())).not.toThrow();
  });

  it("scope raises on anchor", () => {
    const fakeset = new FakeSet();
    const mapper = new Mapper(fakeset);
    expect(() => mapper.scope({ anchor: false }, () => {})).toThrow(ArgumentError);
  });

  it("blows up without via", () => {
    const fakeset = new FakeSet();
    const mapper = new Mapper(fakeset);
    expect(() => mapper.match("/", { to: "posts#index", as: "main" })).toThrow(ArgumentError);
  });

  it("unscoped formatted", () => {
    const fakeset = new FakeSet();
    const mapper = new Mapper(fakeset);
    mapper.get("/foo", { to: "posts#index", as: "main", format: true });
    expect(fakeset.defaults()[0]).toEqual({ controller: "posts", action: "index" });
    expect(fakeset.asts()[0].toString()).toBe("/foo.:format");
  });

  it("scoped formatted", () => {
    const fakeset = new FakeSet();
    const mapper = new Mapper(fakeset);
    mapper.scope({ format: true }, () => {
      mapper.get("/foo", { to: "posts#index", as: "main" });
    });
    expect(fakeset.defaults()[0]).toEqual({ controller: "posts", action: "index" });
    expect(fakeset.asts()[0].toString()).toBe("/foo.:format");
  });

  it("random keys", () => {
    const fakeset = new FakeSet();
    const mapper = new Mapper(fakeset);
    mapper.scope({ omg: "awesome" }, () => {
      mapper.get("/", { to: "posts#index", as: "main" });
    });
    expect(fakeset.defaults()[0]).toEqual({ omg: "awesome", controller: "posts", action: "index" });
    expect([...fakeset.routes][0].verb).toBe("GET");
  });

  it("mapping requirements", () => {
    const options = {};
    const scope = new Mapper.Scope({});
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

  it("via scope", () => {
    const fakeset = new FakeSet();
    const mapper = new Mapper(fakeset);
    mapper.scope({ via: ":put" }, () => {
      mapper.match("/", { to: "posts#index", as: "main" });
    });
    expect([...fakeset.routes][0].verb).toBe("PUT");
  });

  it("to scope", () => {
    const fakeset = new FakeSet();
    const mapper = new Mapper(fakeset);
    mapper.scope({ to: "posts#index" }, () => {
      mapper.get("all");
      mapper.post("most");
    });

    expect([...fakeset.routes][0].defaults["to"]).toBe("posts#index");
    expect([...fakeset.routes][1].defaults["to"]).toBe("posts#index");
  });

  it("map slash", () => {
    const fakeset = new FakeSet();
    const mapper = new Mapper(fakeset);
    mapper.get("/", { to: "posts#index", as: "main" });
    expect(fakeset.asts()[0].toString()).toBe("/");
  });

  it("map more slashes", () => {
    const fakeset = new FakeSet();
    const mapper = new Mapper(fakeset);

    mapper.get("/one/two/", { to: "posts#index", as: "main" });
    expect(fakeset.asts()[0].toString()).toBe("/one/two(.:format)");
  });

  it("map wildcard", () => {
    const fakeset = new FakeSet();
    const mapper = new Mapper(fakeset);
    mapper.get("/*path", { to: "pages#show" });
    expect(fakeset.asts()[0].toString()).toBe("/*path(.:format)");
    expect(fakeset.requirements()[0]["path"]).toEqual(/.+?/s);
  });

  it("map wildcard with other element", () => {
    const fakeset = new FakeSet();
    const mapper = new Mapper(fakeset);
    mapper.get("/*path/foo/:bar", { to: "pages#show" });
    expect(fakeset.asts()[0].toString()).toBe("/*path/foo/:bar(.:format)");
    expect(fakeset.requirements()[0]["path"]).toEqual(/.+?/s);
  });

  it("map wildcard with multiple wildcard", () => {
    const fakeset = new FakeSet();
    const mapper = new Mapper(fakeset);
    mapper.get("/*foo/*bar", { to: "pages#show" });
    expect(fakeset.asts()[0].toString()).toBe("/*foo/*bar(.:format)");
    expect(fakeset.requirements()[0]["foo"]).toEqual(/.+?/s);
    expect(fakeset.requirements()[0]["bar"]).toEqual(/.+?/s);
  });

  it("map wildcard with format false", () => {
    const fakeset = new FakeSet();
    const mapper = new Mapper(fakeset);
    mapper.get("/*path", { to: "pages#show", format: false });
    expect(fakeset.asts()[0].toString()).toBe("/*path");
    expect(fakeset.requirements()[0]["path"]).toBeUndefined();
  });

  it("map wildcard with format true", () => {
    const fakeset = new FakeSet();
    const mapper = new Mapper(fakeset);
    mapper.get("/*path", { to: "pages#show", format: true });
    expect(fakeset.asts()[0].toString()).toBe("/*path.:format");
  });

  const app = (_env: Record<string, unknown>) => [200, {}, bodyFromString("")] as const;

  it("can pass anchor to mount", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    m.mount(
      new Map<unknown, unknown>([
        [app, "/path"],
        ["anchor", true],
      ]),
    );
    expect(fakeset.routes.routes[0].path.spec.toString()).toBe("/path");
    expect(fakeset.routes.routes[0].path.anchored).toBeTruthy();
  });

  it("raising error when path is not passed", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    expect(() => m.mount(app)).toThrow(/mount point/);
  });

  it("raising error when rack app is not passed", () => {
    const fakeset = new FakeSet();
    const m = new Mapper(fakeset);
    expect(() => m.mount(10 as unknown as MountableApp, { as: "exciting" })).toThrow(
      /rack application must be specified/,
    );
    expect(() => m.mount(new Map<unknown, unknown>([["as", "exciting"]]))).toThrow(
      /rack application must be specified/,
    );
  });

  it("raising error when invalid on option is given", async () => {
    const fakeset = new FakeSet();
    const mapper = new Mapper(fakeset);
    const error = await assertRaises([ArgumentError], {}, () => {
      mapper.get("/foo", { on: "invalid_option" });
    });

    assertEqual("Unknown scope :invalid_option given to :on", error.message);
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
    routes.draw(function () {
      this.mount(engine, { at: "/foo" });
    });

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
    routes.draw(function () {
      this.mount(engine, { at: "/:tenant" });
    });

    await routes.call({ REQUEST_METHOD: "GET", PATH_INFO: "/acme/widgets" });
    expect(seen).toEqual([
      { SCRIPT_NAME: "/acme", PATH_INFO: "/widgets", path_parameters: { tenant: "acme" } },
    ]);
  });
});
