import { describe, expect, it } from "vitest";
import type { DrawCallback, Mapper } from "@blazetrails/actionpack";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { RoutesReloader, type RouteSetLike } from "./routes-reloader.js";

type Counted = RouteSetLike & { calls: string[] };
const makeRouteSet = (): Counted => {
  const r: Counted = {
    disableClearAndFinalize: false,
    calls: [],
    clearBang: () => void r.calls.push("clear"),
    finalizeBang: () => void r.calls.push("finalize"),
    eagerLoadBang: () => void r.calls.push("eagerLoad"),
  };
  return r;
};

describe("RoutesReloader", () => {
  it("updated? reports a routes file change until execute", async () => {
    const tmp = Dir.mktmpdir("routes_reloader");
    try {
      const routes = `${tmp}/routes.ts`;
      FileUtils.touch(routes, { mtime: new Date(Date.now() - 10_000) });
      const r = new RoutesReloader();
      const a = makeRouteSet();
      r.routeSets.push(a);
      r.paths.push(routes);
      expect(r.isUpdated()).toBe(false);
      FileUtils.touch(routes);
      expect(r.isUpdated()).toBe(true);
      await r.execute();
      expect(r.isUpdated()).toBe(false);
      expect(a.calls).toEqual(["clear", "finalize"]);
    } finally {
      FileUtils.rmRf(tmp);
    }
  });

  it("execute loads the edited routes file, not the previously imported one", async () => {
    const tmp = Dir.mktmpdir("routes_reloader");
    try {
      const routes = `${tmp}/routes.ts`;
      File.write(routes, `export function drawRoutes(mapper) { mapper.get("/before"); }\n`);
      const drawn: string[] = [];
      const r = new RoutesReloader();
      r.routeSets.push({
        ...makeRouteSet(),
        draw: (block: DrawCallback) =>
          block({ get: (path: string) => void drawn.push(path) } as unknown as Mapper),
      });
      r.paths.push(routes);

      await r.execute();
      File.write(routes, `export function drawRoutes(mapper) { mapper.get("/after"); }\n`);
      await r.execute();

      expect(drawn).toEqual(["/before", "/after"]);
    } finally {
      FileUtils.rmRf(tmp);
    }
  });
});
