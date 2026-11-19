import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LazyRouteSet } from "../../lib/engine/lazy-route-set.js";
import { Trails } from "../../lib/trails.js";

describe("LazyRouteSet method_missing_module", () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reload = vi.fn((): boolean => false).mockReturnValueOnce(true);
    Trails.application = { reloadRoutesUnlessLoaded: reload } as never;
  });

  afterEach(() => {
    Trails.application = null;
  });

  it("does not reload routes for a name Ruby answers before method_missing", async () => {
    const appUrlHelpers = new LazyRouteSet().urlHelpers() as unknown as Record<string, unknown>;

    expect(await appUrlHelpers).toBe(appUrlHelpers);
    void appUrlHelpers.toJSON;
    void appUrlHelpers.inspect;
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads routes for a name that misses the url helpers", () => {
    const appUrlHelpers = new LazyRouteSet().urlHelpers() as unknown as Record<string, unknown>;

    expect(appUrlHelpers.rootPath).toBeUndefined();
    expect(reload).toHaveBeenCalledTimes(2);
  });
});

describe("LazyRouteSet url helper modules", () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reload = vi.fn((): boolean => false).mockReturnValueOnce(true);
    Trails.application = { reloadRoutesUnlessLoaded: reload } as never;
  });

  afterEach(() => {
    Trails.application = null;
  });

  it("reloads routes for a name that misses a path-less url helpers module", () => {
    const mod = new LazyRouteSet().generateUrlHelpers(false) as unknown as Record<string, unknown>;

    expect(mod.rootUrl).toBeUndefined();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("prepends respond_to_missing? onto the named route helper modules", () => {
    const { namedRoutes } = new LazyRouteSet();

    expect(typeof namedRoutes.urlHelpersModule.prototype.respondToMissing).toBe("function");
    expect(typeof namedRoutes.pathHelpersModule.prototype.respondToMissing).toBe("function");
  });

  it("reloads routes before route_defined? answers", () => {
    const routes = new LazyRouteSet();

    expect(routes.namedRoutes.isRouteDefined("root_path")).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["urlFor", [{ host: "example.com" }]],
    ["fullUrlFor", [{ host: "example.com" }]],
    ["optimizeRoutesGeneration", []],
    ["polymorphicUrl", [[]]],
    ["polymorphicPath", [[]]],
  ] as const)("reloads routes before %s delegates", (name, args) => {
    const mod = new LazyRouteSet().generateUrlHelpers(true) as unknown as Record<
      string,
      (...a: unknown[]) => unknown
    >;
    const delegate = vi.spyOn(mod._proxy as unknown as Record<string, () => unknown>, name);
    delegate.mockImplementation(() => {
      expect(reload).toHaveBeenCalledTimes(1);
      return "";
    });

    mod[name](...args);
    expect(delegate).toHaveBeenCalledTimes(1);
  });

  it("reloads routes before route_for answers", () => {
    const mod = new LazyRouteSet().generateUrlHelpers(true) as unknown as {
      routeFor(name: string): string;
    };

    expect(() => mod.routeFor("root")).toThrow();
    expect(reload).toHaveBeenCalledTimes(2);
  });
});

describe("LazyRouteSet#routes", () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reload = vi.fn((): boolean => false).mockReturnValueOnce(true);
    Trails.application = { reloadRoutesUnlessLoaded: reload } as never;
  });

  afterEach(() => {
    Trails.application = null;
  });

  it("reloads routes when routes is read", () => {
    const routes = new LazyRouteSet();

    expect(routes.routes().routes).toEqual([]);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
