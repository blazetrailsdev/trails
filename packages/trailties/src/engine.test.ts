// Smoke tests for the `Engine` shell. Full Rails-mirrored
// `railties/test/engine_test.rb` cases land in PR 2.2b alongside the
// `Configuration` defaults and route mounting.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLoadHooks, runLoadHooks } from "@blazetrails/activesupport";
import {
  fsAdapterConfig,
  registerFsAdapter,
  type FsAdapter,
  type PathAdapter,
} from "@blazetrails/ruby-compat";
import { env, setEnv } from "@blazetrails/activesupport/process-adapter";
import { MiddlewareStack, RouteSet } from "@blazetrails/actionpack";
import { Engine } from "./engine.js";
import { loaded } from "./__fixtures__/loaded.js";
import { EngineConfiguration } from "./engine/configuration.js";
import { Trailtie } from "./trailtie.js";
import { Trailties } from "./engine/trailties.js";

const posixPath: PathAdapter = {
  join: (...p) => p.join("/").replace(/\/+/g, "/"),
  dirname: (p) => p.replace(/\/[^/]*$/, "") || "/",
  basename: (p) => p.split("/").pop() ?? "",
  resolve: (...p) =>
    p
      .reduce((o, x) => (!x ? o : x.startsWith("/") ? x : o ? `${o}/${x}` : x), "")
      .replace(/\/+/g, "/"),
  extname: (p) => (p.lastIndexOf(".") > 0 ? p.slice(p.lastIndexOf(".")) : ""),
  isAbsolute: (p) => p.startsWith("/"),
  sep: "/",
};

const FIXED_MTIME = new Date(0);
const stat = (d: boolean) => ({
  isDirectory: () => d,
  isFile: () => !d,
  size: 0,
  mtime: FIXED_MTIME,
});

function installFs(dirs: Set<string>, files: Set<string>): void {
  registerFsAdapter(
    "engine-test",
    {
      cwd: () => "/",
      exists: async (p: string) => dirs.has(p) || files.has(p),
      stat: async (p: string) => {
        if (dirs.has(p)) return stat(true);
        if (files.has(p)) return stat(false);
        throw new Error("ENOENT");
      },
      statSync: () => stat(false),
      realpath: async (p: string) => p,
    } as unknown as FsAdapter,
    posixPath,
  );
  fsAdapterConfig.adapter = "engine-test";
}

const PREV = fsAdapterConfig.adapter;
afterEach(() => {
  fsAdapterConfig.adapter = PREV;
});

describe("Engine", () => {
  it("Engine is abstract and cannot be instantiated directly", () => {
    expect(() => new Engine()).toThrow(/abstract/);
  });

  it("engine_name aliases railtie_name", () => {
    class BlogEngine extends Engine {}
    Trailtie.register(BlogEngine);
    BlogEngine.calledFrom("/");
    expect(BlogEngine.engineName()).toBe("blog_engine");
    expect(BlogEngine.engineName()).toBe(BlogEngine.railtieName());
  });

  it("isolated? defaults to false", () => {
    class PlainEngine extends Engine {}
    Trailtie.register(PlainEngine);
    PlainEngine.calledFrom("/");
    expect(PlainEngine.isolated()).toBe(false);
    expect(PlainEngine.instance().isolated()).toBe(false);
  });

  describe("find_root_with_flag", () => {
    beforeEach(() =>
      installFs(new Set(["/", "/app", "/app/sub", "/app/sub/deep"]), new Set(["/app/lib"])),
    );

    it("walks parents until the flag is found", async () => {
      expect(await Engine.findRootWithFlag("lib", "/app/sub/deep")).toBe("/app");
    });
    it("returns the fallback when nothing matches", async () => {
      expect(await Engine.findRootWithFlag("missing", "/app/sub", "/fallback")).toBe("/fallback");
    });
    it("throws when no flag and no fallback", async () => {
      await expect(Engine.findRootWithFlag("missing", "/app/sub")).rejects.toThrow(
        /Could not find root/,
      );
    });
    it("find_root uses 'lib' as the flag", async () => {
      expect(await Engine.findRoot("/app")).toBe("/app");
    });
  });

  it("paths declares the Rails default layout (root memoized once resolved)", async () => {
    installFs(new Set(["/", "/blog", "/blog/sub"]), new Set(["/blog/lib"]));
    class PathsEngine extends Engine {}
    Trailtie.register(PathsEngine);
    PathsEngine.calledFrom("/blog/sub");
    const inst = PathsEngine.instance();
    const paths = await inst.paths();
    for (const k of ["app", "app/models", "lib", "config/routes.ts", "db/migrate", "vendor"]) {
      expect(paths.get(k), k).toBeDefined();
    }
    expect(paths.get("lib")!.isLoadPath()).toBe(true);
    expect(paths.get("vendor")!.isLoadPath()).toBe(true);
    expect(await inst.paths()).toBe(paths);
  });

  it("find() locates the engine whose root matches", async () => {
    installFs(
      new Set(["/", "/found", "/found/sub", "/blog", "/blog/sub"]),
      new Set(["/lib", "/found/lib", "/blog/sub/lib"]),
    );
    class FoundEngine extends Engine {}
    Trailtie.register(FoundEngine);
    FoundEngine.calledFrom("/found/sub");
    expect(await FoundEngine.instance().root()).toBe("/found");
    expect(await Engine.find("/found")).toBe(FoundEngine.instance());
    expect(await Engine.find("/elsewhere")).toBeUndefined();
  });

  it("helpersPaths returns only existing app/helpers directories", async () => {
    installFs(new Set(["/", "/blog", "/blog/app", "/blog/app/helpers"]), new Set(["/blog/lib"]));
    class HelpersEngine extends Engine {}
    Trailtie.register(HelpersEngine);
    HelpersEngine.calledFrom("/blog");
    expect(await HelpersEngine.instance().helpersPaths()).toEqual(["/blog/app/helpers"]);
  });

  describe("EngineConfiguration", () => {
    it("defaults match Rails Engine::Configuration", () => {
      const cfg = new EngineConfiguration();
      expect(cfg.root).toBeNull();
      expect(cfg.middleware.middlewares).toEqual([]);
      expect(cfg.javascriptPath).toBe("javascript");
      expect(cfg.routeSetClass).toBe(RouteSet);
      expect(cfg.defaultScope).toBeNull();
      expect(cfg.autoloadPaths).toEqual([]);
      expect(cfg.autoloadOncePaths).toEqual([]);
      expect(cfg.eagerLoadPaths).toEqual([]);
      expect(cfg.tableNamePrefix).toBeNull();
    });

    it("root= re-expands paths.path", () => {
      const cfg = new EngineConfiguration(null);
      const paths = cfg.paths();
      expect(paths.path).toBeNull();
      cfg.setRoot("/blog");
      expect(cfg.root).toBe("/blog");
      expect(paths.path).toBe("/blog");
      expect(cfg.paths()).toBe(paths);
    });

    it("paths declares the Rails default layout", () => {
      const paths = new EngineConfiguration("/blog").paths();
      for (const k of ["app", "app/models", "lib", "config/routes.ts", "db/migrate", "vendor"]) {
        expect(paths.get(k), k).toBeDefined();
      }
      expect(paths.get("lib")!.isLoadPath()).toBe(true);
      expect(paths.get("vendor")!.isLoadPath()).toBe(true);
      expect(paths.get("app")!.isEagerLoad()).toBe(true);
      expect(paths.get("app/models")!.isEagerLoad()).toBe(true);
      expect(paths.get("app/views")!.isEagerLoad()).toBe(false);
      expect(paths.get("test/mailers/previews")!.isAutoload()).toBe(true);
      expect(paths.get("app")!.isAutoload()).toBe(false);
    });

    it("all_autoload_paths unions the paths registry contribution", async () => {
      installFs(new Set(["/blog", "/blog/test/mailers/previews"]), new Set());
      const cfg = new EngineConfiguration("/blog");
      cfg.autoloadPaths.push("/x/auto");
      expect(await cfg.allAutoloadPaths()).toEqual(["/x/auto", "/blog/test/mailers/previews"]);
      expect(await cfg.allAutoloadOncePaths()).toEqual([]);
    });

    it("autoload_paths, autoload_once_paths, eager_load_paths are independently writable", async () => {
      // Non-existent root: paths().eagerLoad() contributes nothing, so the
      // custom eager_load_paths entries come back alone.
      const cfg = new EngineConfiguration("/nonexistent-engine-root");
      cfg.autoloadPaths.push("/x/auto");
      cfg.autoloadOncePaths.push("/x/once");
      cfg.eagerLoadPaths.push("/x/eager");
      expect(await cfg.allAutoloadPaths()).toEqual(["/x/auto"]);
      expect(await cfg.allAutoloadOncePaths()).toEqual(["/x/once"]);
      expect(await cfg.allEagerLoadPaths()).toEqual(["/x/eager"]);
    });
  });

  describe("endpoint", () => {
    it("it provides routes as default endpoint", () => {
      class DefaultEndpointEngine extends Engine {}
      Trailtie.register(DefaultEndpointEngine);
      const engine = DefaultEndpointEngine.instance();
      expect(engine.endpoint()).toBe(engine.routes());
    });

    it("returns the registered endpoint", () => {
      class MountedEngine extends Engine {}
      Trailtie.register(MountedEngine);
      const rack = async () => [200, {}, ["OK"]] as const;
      MountedEngine.endpoint(rack as never);
      expect(MountedEngine.instance().endpoint()).toBe(rack);
    });

    it("engine is a rack app and can have its own middleware stack", async () => {
      const stack = new MiddlewareStack();
      class Tagger {
        constructor(private app: (env: never) => Promise<[number, object, string[]]>) {}
        async call(env: never): Promise<[number, object, string[]]> {
          const [status, headers, body] = await this.app(env);
          return [status, headers, [...body, "!"]];
        }
      }
      stack.use(Tagger as never);

      class StackEngine extends Engine {}
      Trailtie.register(StackEngine);
      StackEngine.endpoint((async () => [200, {}, ["OK"]]) as never);

      const app = stack.build(StackEngine.instance().endpoint());
      expect(await app({} as never)).toEqual([200, {}, ["OK", "!"]]);
    });
  });

  describe("load_server", () => {
    it("invokes the registered server blocks and returns self", () => {
      class ServerEngine extends Engine {}
      Trailtie.register(ServerEngine);
      const seen: unknown[] = [];
      ServerEngine.server((app: unknown) => {
        seen.push(app);
      });
      const engine = ServerEngine.instance();
      expect(engine.loadServer()).toBe(engine);
      expect(seen).toEqual([engine]);
    });

    it("passes the given app to the server blocks", () => {
      class ServerAppEngine extends Engine {}
      Trailtie.register(ServerAppEngine);
      const seen: unknown[] = [];
      ServerAppEngine.server((app: unknown) => {
        seen.push(app);
      });
      const other = {};
      ServerAppEngine.instance().loadServer(other);
      expect(seen).toEqual([other]);
    });
  });

  describe("tableNamePrefix", () => {
    it("defaults to null when not isolated and unset", () => {
      class PlainNamespacedEngine extends Engine {}
      Trailtie.register(PlainNamespacedEngine);
      expect(PlainNamespacedEngine.instance().tableNamePrefix()).toBeNull();
    });

    it("returns the explicit option when set", () => {
      class ShopEngine extends Engine {}
      Trailtie.register(ShopEngine);
      ShopEngine.instance().config.tableNamePrefix = "shop_";
      expect(ShopEngine.instance().tableNamePrefix()).toBe("shop_");
    });

    it("falls back to `${engine_name}_` when isolated and unset", () => {
      class IsoEngine extends Engine {}
      Trailtie.register(IsoEngine);
      IsoEngine.isolated(true);
      expect(IsoEngine.instance().tableNamePrefix()).toBe("iso_engine_");
    });
  });

  it("config.eager_load_namespaces accumulates across engines", () => {
    class A extends Engine {}
    class B extends Engine {}
    Trailtie.register(A);
    Trailtie.register(B);
    const before = A.instance().config.eagerLoadNamespaces.length;
    A.instance().config.eagerLoadNamespaces.push("ANs");
    B.instance().config.eagerLoadNamespaces.push("BNs");
    expect(A.instance().config.eagerLoadNamespaces).toBe(B.instance().config.eagerLoadNamespaces);
    expect(A.instance().config.eagerLoadNamespaces.length).toBe(before + 2);
  });

  it("routes lazily instantiates routeSetClass, append-buffers blocks, and hasRoutes flips", () => {
    class MountedEngine extends Engine {}
    Trailtie.register(MountedEngine);
    expect(MountedEngine.instance().hasRoutes()).toBe(false);
    const r1 = MountedEngine.instance().routes((mapper) => {
      mapper.get("/mounted", "mounted#index");
    });
    expect(r1).toBeInstanceOf(RouteSet);
    expect(MountedEngine.instance().routes(() => {})).toBe(r1);
    expect(MountedEngine.instance().hasRoutes()).toBe(true);
  });

  it("generators(block) yields a mutable options bag", () => {
    const cfg = new EngineConfiguration();
    cfg.generators((g) => {
      g.orm = "active_record";
    });
    expect(cfg.generators()).toEqual({ orm: "active_record", templates: [] });
  });

  it("railties returns a Trailties collection over registered subclasses", () => {
    class RailtiesEngine extends Engine {}
    Trailtie.register(RailtiesEngine);
    const inst = RailtiesEngine.instance();
    const collection = inst.railties();
    expect(collection).toBeInstanceOf(Trailties);
    expect(Array.from(collection)).toContain(inst);
    expect(collection.minus([inst])).not.toContain(inst);
  });

  it("add_routing_paths registers the routes file and route set on the reloader", async () => {
    class RoutingEngine extends Engine {}
    Trailtie.register(RoutingEngine);
    const engine = RoutingEngine.instance();
    engine.config.setRoot(new URL("./__fixtures__/boot-app", import.meta.url).pathname);
    const reloader = { paths: [] as string[], routeSets: [] as unknown[], externalRoutes: [] };
    const appRoutes = new RouteSet();

    await engine.initializers
      .find((i) => i.name === "add_routing_paths")!
      .run({ routes: () => appRoutes, routesReloader: () => reloader });

    expect(reloader.paths).toHaveLength(1);
    expect(reloader.paths[0]).toMatch(/config\/routes\.ts$/);
    expect(reloader.routeSets).toEqual([engine.routes()]);
    expect(engine.routes().drawPaths).toEqual(appRoutes.drawPaths);
    expect(appRoutes.drawPaths[0]).toMatch(/config\/routes$/);
  });

  it("add_view_paths prepends app/views onto the action_controller load hook", async () => {
    resetLoadHooks();
    class ViewEngine extends Engine {}
    Trailtie.register(ViewEngine);
    const engine = ViewEngine.instance();
    engine.config.setRoot(new URL("./__fixtures__/boot-app", import.meta.url).pathname);

    await engine.initializers.find((i) => i.name === "add_view_paths")!.run();

    const prepended: string[][] = [];
    runLoadHooks("action_controller", {
      prependViewPath: (views: string[]) => prepended.push(views),
    });
    expect(prepended).toHaveLength(1);
    expect(prepended[0][0]).toMatch(/app\/views$/);
    resetLoadHooks();
  });

  it("add_view_paths renders through the prepended path", async () => {
    resetLoadHooks();
    const { ActionController, ActionView, Response } = await import("@blazetrails/actionpack");
    ActionView.TemplateHandlers.registerTemplateHandler("raw", new ActionView.RawHandler());

    class RenderEngine extends Engine {}
    Trailtie.register(RenderEngine);
    const engine = RenderEngine.instance();
    engine.config.setRoot(new URL("./__fixtures__/boot-app", import.meta.url).pathname);
    await engine.initializers.find((i) => i.name === "add_view_paths")!.run();

    class PostsController extends ActionController.Base {}
    PostsController.layout = false;
    runLoadHooks("action_controller", PostsController);

    const controller = new PostsController();
    controller.setResponseBang(new Response());
    await controller.renderAsync({ action: "index" });
    expect(controller.body).toBe("posts#index\n");
    resetLoadHooks();
  });

  describe("remaining Engine initializers", () => {
    const fixtureRoot = new URL("./__fixtures__/initializer-engine", import.meta.url).pathname;
    let previousEnv: string | undefined;

    beforeEach(() => {
      previousEnv = env.TRAILS_ENV;
      setEnv("TRAILS_ENV", "test");
      loaded.length = 0;
    });
    afterEach(() => {
      setEnv("TRAILS_ENV", previousEnv);
    });

    it("initializers", async () => {
      class InitializersEngine extends Engine {}
      Trailtie.register(InitializersEngine);
      const engine = InitializersEngine.instance();
      engine.config.setRoot(fixtureRoot);

      await engine.initializers.find((i) => i.name === "load_config_initializers")!.run();

      expect(loaded).toEqual(["a-foo", "b-bar"]);
    });

    it("initializers are executed after application configuration initializers", () => {
      class OrderingEngine extends Engine {}
      Trailtie.register(OrderingEngine);
      OrderingEngine.initializer("dummy_initializer", () => {});
      const names = OrderingEngine.instance()
        .initializers.tsort()
        .map((i) => i.name);

      expect(names.lastIndexOf("load_config_initializers")).toBeLessThan(
        names.indexOf("dummy_initializer"),
      );
    });

    it("load_environment_config requires config/environments/$env", async () => {
      class EnvironmentEngine extends Engine {}
      Trailtie.register(EnvironmentEngine);
      const engine = EnvironmentEngine.instance();
      engine.config.setRoot(fixtureRoot);

      await engine.initializers.find((i) => i.name === "load_environment_config")!.run();

      expect(loaded).toEqual(["environments/test"]);
    });

    it("prepend_helpers_path unshifts app/helpers onto the application config", async () => {
      class HelpersEngine extends Engine {}
      Trailtie.register(HelpersEngine);
      const engine = HelpersEngine.instance();
      engine.config.setRoot(fixtureRoot);
      const app = { config: { helpersPaths: ["existing"] } };

      await engine.initializers.find((i) => i.name === "prepend_helpers_path")!.run(app);

      expect(app.config.helpersPaths).toHaveLength(2);
      expect(app.config.helpersPaths[0]).toMatch(/app\/helpers$/);
      expect(app.config.helpersPaths[1]).toBe("existing");
    });

    it("prepend_helpers_path skips an isolated engine that is not the application", async () => {
      class IsolatedEngine extends Engine {}
      Trailtie.register(IsolatedEngine);
      IsolatedEngine.isolated(true);
      const engine = IsolatedEngine.instance();
      engine.config.setRoot(fixtureRoot);
      const app = { config: { helpersPaths: [] as string[] } };

      await engine.initializers.find((i) => i.name === "prepend_helpers_path")!.run(app);

      expect(app.config.helpersPaths).toEqual([]);
    });
  });
});
