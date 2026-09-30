import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mapper } from "@blazetrails/actionpack";
import { MockRequest } from "@blazetrails/rack";
import { RouteSet, controllerConstants } from "@blazetrails/actionpack";
import { LazyRouteSet } from "./lazy-route-set.js";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Trails } from "../rails.js";

class StubController {}

function assertOperator(o1: object, operator: "respond_to?", o2: string): void {
  expect(rbObjRespondTo(o1, o2), `Expected ${String(o1)} to be ${operator} ${o2}`).toBe(true);
}

function assertNotOperator(o1: string, operator: "in", o2: object): void {
  expect(o1 in o2, `Expected ${o1} to not be ${operator} ${String(o2)}`).toBe(false);
}

describe("LazyRouteSet", () => {
  let routes: LazyRouteSet;
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    routes = new LazyRouteSet();
    reload = vi.fn(async () => true);
    Trails.application = { reloadRoutesUnlessLoaded: reload } as never;
    controllerConstants.set("posts", StubController as never);
  });

  afterEach(() => {
    Trails.application = null;
    vi.restoreAllMocks();
  });

  it("reloads routes when draw is called", () => {
    routes.draw(() => {});
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads routes when recognize_path is called", () => {
    routes.draw((m: Mapper) => {
      m.get("/posts", { to: "posts#index" });
    });
    reload.mockClear();
    routes.recognizePath("/posts");
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("reloads routes when recognize_path_with_request is called", () => {
    routes.draw((m: Mapper) => {
      m.get("/posts", { to: "posts#index" });
    });
    reload.mockClear();
    routes.recognizePathWithRequest(routes.makeRequest(MockRequest.envFor("/posts")), "/posts", {});
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads routes when generate_extras is called", () => {
    routes.draw((m: Mapper) => {
      m.get("/posts", { to: "posts#index", as: "posts" });
    });
    reload.mockClear();
    routes.generateExtras({ useRoute: "posts" });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads routes when call is invoked", async () => {
    const superCall = vi
      .spyOn(RouteSet.prototype, "call")
      .mockResolvedValue([200, {}, []] as never);
    reload.mockClear();
    await routes.call({ REQUEST_METHOD: "GET", PATH_INFO: "/" });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(superCall).toHaveBeenCalledTimes(1);
  });

  it("reloads routes when url helpers are invoked", () => {
    const mod = routes.generateUrlHelpers(true) as unknown as {
      urlFor: (o: Record<string, unknown>) => string;
    };
    expect(() => mod.urlFor({ host: "example.com" })).toThrow();
    expect(reload).toHaveBeenCalled();
  });

  it("tolerates a missing application", () => {
    Trails.application = null;
    expect(() => routes.draw(() => {})).not.toThrow();
  });

  function loadRoutesLazily(): () => Promise<boolean | null> | undefined {
    let loading: Promise<boolean | null> | undefined;
    reload.mockImplementation(() => {
      if (loading) return Promise.resolve(null);
      return (loading = Promise.resolve().then(() => {
        routes.draw((m: Mapper) => {
          m.root({ to: "posts#index" });
        });
        return true;
      }));
    });
    return () => loading;
  }

  it("app lazily loads routes when invoking url helpers", async () => {
    const loading = loadRoutesLazily();
    const appUrlHelpers = routes.urlHelpers() as unknown as { rootPath(): string };

    assertNotOperator("rootPath", "in", appUrlHelpers);
    void appUrlHelpers.rootPath;
    await loading();
    expect(appUrlHelpers.rootPath()).toBe("/");
  });

  it("app lazily loads routes when checking respond_to?", async () => {
    const loading = loadRoutesLazily();
    const appUrlHelpers = routes.urlHelpers();

    assertNotOperator("rootPath", "in", appUrlHelpers);
    rbObjRespondTo(appUrlHelpers, "rootPath");
    await loading();
    assertOperator(appUrlHelpers, "respond_to?", "rootPath");
  });

  it("new_with_config builds an instance of the receiving subclass", () => {
    expect(LazyRouteSet.newWithConfig({})).toBeInstanceOf(LazyRouteSet);
    expect(RouteSet.newWithConfig({})).not.toBeInstanceOf(LazyRouteSet);
  });
});
