// Mirrors `railties/test/application/routes_reloading_test.rb` for the
// subset of behavior the trailties RoutesReloader implements.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onLoad, resetLoadHooks } from "@blazetrails/activesupport";
import { RoutesReloader, type RouteSetLike } from "./routes-reloader.js";

type Counted = RouteSetLike & { calls: string[] };
const makeRouteSet = (): Counted => {
  const r: Counted = { disableClearAndFinalize: false, calls: [] };
  r.clear = () => void r.calls.push("clear");
  r.finalize = () => void r.calls.push("finalize");
  r.eagerLoad = () => void r.calls.push("eagerLoad");
  return r;
};

describe("RoutesReloader", () => {
  beforeEach(() => resetLoadHooks());
  afterEach(() => resetLoadHooks());

  it("test_reload_clears_finalizes_eager_loads_and_runs_after_load_paths", async () => {
    const r = new RoutesReloader();
    expect([r.paths, r.routeSets, r.externalRoutes]).toEqual([[], [], []]);
    expect(r.eagerLoad).toBe(false);
    expect(r.loaded).toBe(false);
    const a = makeRouteSet();
    r.routeSets.push(a);
    r.paths.push("/routes-a", "/routes-b");
    r.eagerLoad = true;
    const loaded: string[] = [];
    const after = vi.fn();
    r.runAfterLoadPaths = after;
    await r.reload((p) => void loaded.push(p));
    expect(loaded).toEqual(["/routes-a", "/routes-b"]);
    expect(after).toHaveBeenCalledOnce();
    expect(a.calls).toEqual(["clear", "finalize", "eagerLoad"]);
    expect(a.disableClearAndFinalize).toBe(false);
  });

  it("test_reload_reverts_disable_flag_even_when_loader_throws", async () => {
    const r = new RoutesReloader();
    const a = makeRouteSet();
    r.routeSets.push(a);
    r.paths.push("/boom");
    const boom = (): never => {
      throw new Error("load failed");
    };
    await expect(r.reload(boom)).rejects.toThrow(/load failed/);
    expect(a.disableClearAndFinalize).toBe(false);
  });

  it("test_execute_unless_loaded_runs_once_and_fires_after_routes_loaded", async () => {
    const r = new RoutesReloader();
    const fired: unknown[] = [];
    onLoad("after_routes_loaded", (a) => void fired.push(a));
    const app = { tag: "app" };
    expect([await r.executeUnlessLoaded(app), r.loaded, fired]).toEqual([true, true, [app]]);
    expect(await r.executeUnlessLoaded(app)).toBe(false);
    expect(fired).toEqual([app]);
  });
});
