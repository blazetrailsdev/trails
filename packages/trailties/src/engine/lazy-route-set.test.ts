// Unit smoke for LazyRouteSet. Rails' `railties/test/engine/lazy_route_set_test.rb`
// requires a fully-booted application + mounted engine (PR 2.5 / 2.6 / engine
// mounting). Test names here mirror the routing-op being exercised; the full
// Rails-mirrored cases land alongside the Application + engine-mount wiring.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mapper } from "@blazetrails/actionpack";
import { RouteSet } from "@blazetrails/actionpack";
import { LazyRouteSet } from "./lazy-route-set.js";
import { Trails } from "../rails.js";

describe("LazyRouteSet", () => {
  let routes: LazyRouteSet;
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    routes = new LazyRouteSet();
    reload = vi.fn(async () => true);
    Trails.application = { reloadRoutesUnlessLoaded: reload } as never;
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
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads routes when recognize_path_with_request is called", () => {
    routes.draw((m: Mapper) => {
      m.get("/posts", { to: "posts#index" });
    });
    reload.mockClear();
    routes.recognizePathWithRequest({ requestMethod: "GET" }, "/posts");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads routes when generate_extras is called", () => {
    routes.draw((m: Mapper) => {
      m.get("/posts", { to: "posts#index", as: "posts" });
    });
    reload.mockClear();
    routes.generateExtras({ use_route: "posts" });
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

  it("new_with_config builds an instance of the receiving subclass", () => {
    expect(LazyRouteSet.newWithConfig({})).toBeInstanceOf(LazyRouteSet);
    expect(RouteSet.newWithConfig({})).not.toBeInstanceOf(LazyRouteSet);
  });
});
