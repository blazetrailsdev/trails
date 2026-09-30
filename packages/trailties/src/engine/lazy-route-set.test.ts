import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mapper } from "@blazetrails/actionpack";
import { MockRequest } from "@blazetrails/rack";
import { RouteSet, controllerConstants } from "@blazetrails/actionpack";
import { LazyRouteSet } from "./lazy-route-set.js";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Trails } from "../rails.js";

class StubController {}

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

  describe("when the application's routes are not loaded yet", () => {
    let loading: Promise<boolean | null> | undefined;

    beforeEach(() => {
      loading = undefined;
      let loaded = false;
      reload.mockImplementation(() => {
        if (loaded) return (loading ??= Promise.resolve(null));
        loaded = true;
        return (loading = Promise.resolve().then(() => {
          routes.draw((m: Mapper) => {
            m.root({ to: "posts#index" });
          });
          return true;
        }));
      });
    });

    it("app lazily loads routes when invoking url helpers", async () => {
      const appUrlHelpers = routes.urlHelpers() as unknown as { rootPath(): string };

      expect("rootPath" in appUrlHelpers).toBe(false);
      expect(appUrlHelpers.rootPath).toBeUndefined();
      expect(reload).toHaveBeenCalled();
      await loading;
      expect(appUrlHelpers.rootPath()).toBe("/");
    });

    it("app lazily loads routes when checking respond_to?", async () => {
      const appUrlHelpers = routes.urlHelpers();

      expect("rootPath" in appUrlHelpers).toBe(false);
      expect(rbObjRespondTo(appUrlHelpers, "rootPath")).toBe(false);
      expect(reload).toHaveBeenCalled();
      await loading;
      expect(rbObjRespondTo(appUrlHelpers, "rootPath")).toBe(true);
    });
  });

  it("new_with_config builds an instance of the receiving subclass", () => {
    expect(LazyRouteSet.newWithConfig({})).toBeInstanceOf(LazyRouteSet);
    expect(RouteSet.newWithConfig({})).not.toBeInstanceOf(LazyRouteSet);
  });
});
