import { afterEach, describe, expect, it } from "vitest";
import { RouteSet, type DrawCallback, type Mapper } from "@blazetrails/actionpack";
import { Dir } from "@blazetrails/ruby-compat/dir";
import { File } from "@blazetrails/ruby-compat/file";
import { FileUtils } from "@blazetrails/ruby-compat/file-utils";
import { RoutesReloader, type RouteSetLike } from "../../lib/application/routes-reloader.js";
import { Trails } from "../../lib/trails.js";

type Counted = RouteSetLike & { calls: string[]; draw(block: DrawCallback): void };
const makeRouteSet = (): Counted => {
  const r: Counted = {
    disableClearAndFinalize: false,
    drawPaths: [],
    calls: [],
    clearBang: () => void r.calls.push("clear"),
    finalizeBang: () => void r.calls.push("finalize"),
    eagerLoadBang: () => void r.calls.push("eagerLoad"),
    draw: (block: DrawCallback) => {
      const mapper = {
        get: (path: string) => void r.calls.push(`get ${path}`),
      } as unknown as Mapper;
      block.call(mapper);
    },
  };
  return r;
};
const trails = new URL("../../lib/trails.js", import.meta.url).href;
const engine = new URL("../../lib/engine.js", import.meta.url).href;
const drawInto = (receiver: string, path: string): string =>
  `import { Trails } from "${trails}";\n` +
  `${receiver}.routes().draw(function () { this.get("${path}", { to: "posts#index" }); });\n`;

describe("RoutesReloader", () => {
  afterEach(() => {
    Trails.application = null;
  });

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
      await r.prefetchBang();
      r.execute();
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
      File.write(routes, drawInto("Trails.application", "/before"));
      const r = new RoutesReloader();
      const a = makeRouteSet();
      Trails.application = { routes: () => a } as never;
      r.routeSets.push(a);
      r.paths.push(routes);

      await r.prefetchBang();
      r.execute();
      File.write(routes, drawInto("Trails.application", "/after"));
      await r.prefetchBang();
      r.execute();

      expect(a.calls.filter((c) => c.startsWith("get"))).toEqual(["get /before", "get /after"]);
    } finally {
      FileUtils.rmRf(tmp);
    }
  });

  it("execute_unless_loaded draws the prefetched routes in line", async () => {
    const tmp = Dir.mktmpdir("routes_reloader");
    try {
      const routes = `${tmp}/routes.ts`;
      File.write(routes, drawInto("Trails.application", "/posts"));
      const r = new RoutesReloader();
      const a = makeRouteSet();
      Trails.application = { routes: () => a } as never;
      r.routeSets.push(a);
      r.paths.push(routes);

      await r.prefetchBang();
      expect(a.calls).toEqual([]);
      expect(r.executeUnlessLoaded()).toBe(true);

      expect(a.calls).toEqual(["clear", "get /posts", "finalize"]);
      expect(Object.hasOwn(a, "draw")).toBe(true);
    } finally {
      FileUtils.rmRf(tmp);
    }
  });

  it("draws a nested config/routes file in line after execute_unless_loaded", async () => {
    const tmp = Dir.mktmpdir("routes_reloader");
    try {
      const routes = `${tmp}/routes.ts`;
      FileUtils.mkdirP(`${tmp}/routes`);
      File.write(
        `${tmp}/routes/admin.ts`,
        'export function drawRoutes() { this.get("/admin", { to: "admin#index" }); }\n',
      );
      File.write(
        routes,
        `import { Trails } from "${trails}";\n` +
          'Trails.application.routes().draw(function () { this.draw("admin"); });\n',
      );
      const set = new RouteSet();
      set.drawPaths.push(`${tmp}/routes`);
      Trails.application = { routes: () => set } as never;
      const r = new RoutesReloader();
      r.routeSets.push(set);
      r.paths.push(routes);

      await r.prefetchBang();
      r.executeUnlessLoaded();

      expect(set.routes().routes.map((route) => route.path.spec.toString())).toContain(
        "/admin(.:format)",
      );
    } finally {
      FileUtils.rmRf(tmp);
    }
  });

  it("execute_if_updated draws the edited routes file, not the prefetched one", async () => {
    const tmp = Dir.mktmpdir("routes_reloader");
    try {
      const routes = `${tmp}/routes.ts`;
      File.write(routes, drawInto("Trails.application", "/before"));
      FileUtils.touch(routes, { mtime: new Date(Date.now() - 10_000) });
      const r = new RoutesReloader();
      const a = makeRouteSet();
      Trails.application = { routes: () => a } as never;
      r.routeSets.push(a);
      r.paths.push(routes);
      await r.prefetchBang();
      r.execute();

      File.write(routes, drawInto("Trails.application", "/after"));
      expect(await r.executeIfUpdated()).toBe(true);

      expect(a.calls.filter((c) => c.startsWith("get"))).toEqual(["get /before", "get /after"]);
    } finally {
      FileUtils.rmRf(tmp);
    }
  });

  it("concurrent prefetches run in turn and restore draw", async () => {
    const tmp = Dir.mktmpdir("routes_reloader");
    try {
      const routes = `${tmp}/routes.ts`;
      File.write(routes, drawInto("Trails.application", "/posts"));
      const r = new RoutesReloader();
      const a = makeRouteSet();
      const draw = Object.getOwnPropertyDescriptor(a, "draw");
      Trails.application = { routes: () => a } as never;
      r.routeSets.push(a);
      r.paths.push(routes);

      const first = r.prefetchBang();
      File.write(routes, drawInto("Trails.application", "/edited"));
      await Promise.all([first, r.prefetchBang()]);
      r.reloadBang();

      expect(a.calls.filter((c) => c.startsWith("get"))).toEqual(["get /edited"]);

      expect(Object.getOwnPropertyDescriptor(a, "draw")).toEqual(draw);
    } finally {
      FileUtils.rmRf(tmp);
    }
  });

  it("reload! raises when the routes files were never prefetched", () => {
    const r = new RoutesReloader();
    const a = makeRouteSet();
    r.routeSets.push(a);
    r.paths.push("/nonexistent/routes.ts");

    expect(() => r.reloadBang()).toThrow(/not prefetched/);
    expect(a.disableClearAndFinalize).toBe(false);
  });

  it("a failed prefetch drops the previous recording", async () => {
    const tmp = Dir.mktmpdir("routes_reloader");
    try {
      const routes = `${tmp}/routes.ts`;
      File.write(routes, drawInto("Trails.application", "/before"));
      const r = new RoutesReloader();
      const a = makeRouteSet();
      Trails.application = { routes: () => a } as never;
      r.routeSets.push(a);
      r.paths.push(routes);
      await r.prefetchBang();

      File.write(routes, `throw new Error("load failed");\n`);
      await expect(r.prefetchBang()).rejects.toThrow(/load failed/);

      expect(() => r.reloadBang()).toThrow(/not prefetched/);
    } finally {
      FileUtils.rmRf(tmp);
    }
  });

  it("an engine's routes file draws into the engine's route set, not the application's", async () => {
    const tmp = Dir.mktmpdir("routes_reloader");
    try {
      File.write(
        `${tmp}/blog-engine.ts`,
        `import { Engine } from "${engine}";\n` +
          `export class BlogEngine extends Engine {}\n` +
          `Engine.register(BlogEngine, import.meta.dirname);\n`,
      );
      FileUtils.mkdirP(`${tmp}/lib`);
      File.write(`${tmp}/app-routes.ts`, drawInto("Trails.application", "/posts"));
      File.write(
        `${tmp}/engine-routes.ts`,
        `import { BlogEngine } from "./blog-engine.ts";\n` + drawInto("BlogEngine", "/blog"),
      );
      const { BlogEngine } = (await import(`${tmp}/blog-engine.ts`)) as {
        BlogEngine: { instance(): { routes(): RouteSetLike & { routes(): { length: number } } } };
      };
      const engineRoutes = BlogEngine.instance().routes();
      const app = makeRouteSet();
      Trails.application = { routes: () => app } as never;

      const r = new RoutesReloader();
      r.routeSets.push(app, engineRoutes);
      r.paths.push(`${tmp}/app-routes.ts`, `${tmp}/engine-routes.ts`);
      await r.prefetchBang();
      r.reloadBang();

      expect(app.calls).toEqual(["clear", "get /posts", "finalize"]);
      expect(engineRoutes.routes().length).toBe(1);
    } finally {
      FileUtils.rmRf(tmp);
    }
  });
});
