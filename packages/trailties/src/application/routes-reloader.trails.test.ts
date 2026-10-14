import { afterEach, describe, expect, it } from "vitest";
import type { DrawCallback, Mapper } from "@blazetrails/actionpack";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { RoutesReloader, type RouteSetLike } from "./routes-reloader.js";
import { Trails } from "../rails.js";

type Counted = RouteSetLike & { calls: string[]; draw(block: DrawCallback): void };
const makeRouteSet = (): Counted => {
  const r: Counted = {
    disableClearAndFinalize: false,
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
const rails = new URL("../rails.js", import.meta.url).href;
const engine = new URL("../engine.js", import.meta.url).href;
const drawInto = (receiver: string, path: string): string =>
  `import { Trails } from "${rails}";\n` +
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
      File.write(routes, drawInto("Trails.application", "/before"));
      const r = new RoutesReloader();
      const a = makeRouteSet();
      Trails.application = { routes: () => a } as never;
      r.routeSets.push(a);
      r.paths.push(routes);

      await r.execute();
      File.write(routes, drawInto("Trails.application", "/after"));
      await r.execute();

      expect(a.calls.filter((c) => c.startsWith("get"))).toEqual(["get /before", "get /after"]);
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
        BlogEngine: { instance(): { routes(): RouteSetLike & { routes: { length: number } } } };
      };
      const engineRoutes = BlogEngine.instance().routes();
      const app = makeRouteSet();
      Trails.application = { routes: () => app } as never;

      const r = new RoutesReloader();
      r.routeSets.push(app, engineRoutes);
      r.paths.push(`${tmp}/app-routes.ts`, `${tmp}/engine-routes.ts`);
      await r.reloadBang();

      expect(app.calls).toEqual(["clear", "get /posts", "finalize"]);
      expect(engineRoutes.routes.length).toBe(1);
    } finally {
      FileUtils.rmRf(tmp);
    }
  });
});
