import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onLoad, resetLoadHooks } from "@blazetrails/activesupport";
import type { DrawCallback, Mapper } from "@blazetrails/actionpack";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { RoutesReloader, type RouteSetLike } from "./routes-reloader.js";
import { Trails } from "../rails.js";

type Counted = RouteSetLike & { calls: string[] };
const makeRouteSet = (): Counted => {
  const r: Counted = {
    disableClearAndFinalize: false,
    calls: [],
    clearBang: () => void r.calls.push("clear"),
    finalizeBang: () => void r.calls.push("finalize"),
    eagerLoadBang: () => void r.calls.push("eagerLoad"),
    draw: (block: DrawCallback) =>
      block({ get: (path: string) => void r.calls.push(`get ${path}`) } as unknown as Mapper),
  };
  return r;
};

describe("RoutesReloader", () => {
  let tmp: string;
  beforeEach(() => {
    resetLoadHooks();
    tmp = Dir.mktmpdir("routes_reloader");
  });
  afterEach(() => {
    resetLoadHooks();
    FileUtils.rmRf(tmp);
    Trails.application = null;
  });

  it("test_reload_clears_finalizes_eager_loads_and_runs_after_load_paths", async () => {
    const r = new RoutesReloader();
    expect([r.paths, r.routeSets, r.externalRoutes]).toEqual([[], [], []]);
    expect(r.eagerLoad).toBe(false);
    expect(r.loaded).toBe(false);
    const a = makeRouteSet();
    r.routeSets.push(a);
    for (const name of ["a", "b"]) {
      File.write(
        `${tmp}/routes-${name}.ts`,
        `export function drawRoutes(mapper) { mapper.get("/${name}"); }\n`,
      );
      r.paths.push(`${tmp}/routes-${name}.ts`);
    }
    r.eagerLoad = true;
    const after = vi.fn();
    r.runAfterLoadPaths = after;
    await r.reloadBang();
    expect(after).toHaveBeenCalledOnce();
    expect(a.calls).toEqual(["clear", "get /a", "get /b", "finalize", "eagerLoad"]);
    expect(a.disableClearAndFinalize).toBe(false);
  });

  it("test_reload_reverts_disable_flag_even_when_loader_throws", async () => {
    const r = new RoutesReloader();
    const a = makeRouteSet();
    r.routeSets.push(a);
    File.write(`${tmp}/boom.ts`, `throw new Error("load failed");\n`);
    r.paths.push(`${tmp}/boom.ts`);
    await expect(r.reloadBang()).rejects.toThrow(/load failed/);
    expect(a.disableClearAndFinalize).toBe(false);
  });

  it("test_execute_unless_loaded_runs_once_and_fires_after_routes_loaded", async () => {
    const r = new RoutesReloader();
    const fired: unknown[] = [];
    onLoad("after_routes_loaded", (a) => void fired.push(a));
    const app = { tag: "app" };
    Trails.application = app as never;
    expect([await r.executeUnlessLoaded(), r.loaded, fired]).toEqual([true, true, [app]]);
    expect(await r.executeUnlessLoaded()).toBeNull();
    expect(fired).toEqual([app]);
  });
});
