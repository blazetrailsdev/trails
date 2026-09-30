import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LazyRouteSet } from "./lazy-route-set.js";
import { Trails } from "../rails.js";

describe("LazyRouteSet method_missing_module", () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reload = vi.fn(async () => true);
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
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
