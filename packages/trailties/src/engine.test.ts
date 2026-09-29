import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLoadHooks, runLoadHooks } from "@blazetrails/activesupport";
import {
  fsAdapterConfig,
  registerFsAdapter,
  type FsAdapter,
  type PathAdapter,
} from "@blazetrails/ruby-compat";
import { env, setEnv } from "@blazetrails/ruby-compat";
import { RouteSet } from "@blazetrails/actionpack";
import { MockRequest } from "@blazetrails/rack";
import { Engine } from "./engine.js";
import { loaded } from "./__fixtures__/loaded.js";
import { EngineConfiguration } from "./engine/configuration.js";
import { MiddlewareStackProxy } from "./configuration.js";
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
  atime: FIXED_MTIME,
  mtime: FIXED_MTIME,
});

function installFs(dirs: Set<string>, files: Set<string>): void {
  const norm = (p: string) => p.replace(/\/+/g, "/");
  registerFsAdapter(
    "engine-test",
    {
      cwd: () => "/",
      exists: async (p: string) => dirs.has(norm(p)) || files.has(norm(p)),
      stat: async (p: string) => {
        if (dirs.has(norm(p))) return stat(true);
        if (files.has(norm(p))) return stat(false);
        throw new Error("ENOENT");
      },
      existsSync: (p: string) => dirs.has(norm(p)) || files.has(norm(p)),
      statSync: (p: string) => {
        if (dirs.has(norm(p))) return stat(true);
        if (files.has(norm(p))) return stat(false);
        throw new Error("ENOENT");
      },
      realpath: async (p: string) => p,
    } as unknown as FsAdapter,
    posixPath,
  );
  fsAdapterConfig.adapter = "engine-test";
}

const fixtureRoot = new URL("./__fixtures__/initializer-engine", import.meta.url).pathname;

const PREV = fsAdapterConfig.adapter;
afterEach(() => {
  fsAdapterConfig.adapter = PREV;
});

describe("Engine", () => {
  it("Engine is abstract and cannot be instantiated directly", () => {
    expect(() => new Engine()).toThrow(
      "Rails::Engine is abstract, you cannot instantiate it directly.",
    );
  });

  it("engine_name aliases railtie_name", () => {
    class BlogEngine extends Engine {}
    Engine.register(BlogEngine, "/");
    expect(BlogEngine.engineName()).toBe("blog_engine");
    expect(BlogEngine.engineName()).toBe(BlogEngine.railtieName());
  });

  it("isolated? defaults to false", () => {
    class PlainEngine extends Engine {}
    Engine.register(PlainEngine, "/");
    expect(PlainEngine.isolated()).toBe(false);
    expect(PlainEngine.instance().isolated()).toBe(false);
  });

  describe("find_root_with_flag", () => {
    beforeEach(() =>
      installFs(new Set(["/", "/app", "/app/sub", "/app/sub/deep"]), new Set(["/app/lib"])),
    );

    it("walks parents until the flag is found", async () => {
      expect(Engine.findRootWithFlag("lib", "/app/sub/deep")).toBe("/app");
    });
    it("returns the fallback when nothing matches", async () => {
      expect(Engine.findRootWithFlag("missing", "/app/sub", "/fallback")).toBe("/fallback");
    });
    it("throws when no flag and no fallback", () => {
      expect(() => Engine.findRootWithFlag("missing", "/app/sub")).toThrow(/Could not find root/);
    });
    it("find_root uses 'lib' as the flag", async () => {
      expect(Engine.findRoot("/app")).toBe("/app");
    });
  });

  it("paths declares the Rails default layout (root memoized once resolved)", async () => {
    installFs(new Set(["/", "/blog", "/blog/sub"]), new Set(["/blog/lib"]));
    class PathsEngine extends Engine {}
    Engine.register(PathsEngine, "/blog/sub");
    const inst = PathsEngine.instance();
    const paths = inst.paths();
    for (const k of ["app", "app/models", "lib", "config/routes.ts", "db/migrate", "vendor"]) {
      expect(paths.get(k), k).toBeDefined();
    }
    expect(paths.get("lib")!.isLoadPath()).toBe(true);
    expect(paths.get("vendor")!.isLoadPath()).toBe(true);
    expect(inst.paths()).toBe(paths);
  });

  it("find() locates the engine whose root matches", async () => {
    installFs(
      new Set(["/", "/found", "/found/sub", "/blog", "/blog/sub"]),
      new Set(["/lib", "/found/lib", "/blog/sub/lib"]),
    );
    class FoundEngine extends Engine {}
    Engine.register(FoundEngine, "/found/sub");
    expect(FoundEngine.instance().root()).toBe("/found");
    expect(await Engine.find("/found")).toBe(FoundEngine.instance());
    expect(await Engine.find("/elsewhere")).toBeUndefined();
  });

  it("helpersPaths returns only existing app/helpers directories", async () => {
    installFs(new Set(["/", "/blog", "/blog/app", "/blog/app/helpers"]), new Set(["/blog/lib"]));
    class HelpersEngine extends Engine {}
    Engine.register(HelpersEngine, "/blog");
    expect(await HelpersEngine.instance().helpersPaths()).toEqual(["/blog/app/helpers"]);
  });

  describe("EngineConfiguration", () => {
    it("defaults match Rails Engine::Configuration", () => {
      const cfg = new EngineConfiguration();
      expect(cfg.root).toBeNull();
      expect(cfg.middleware).toBeInstanceOf(MiddlewareStackProxy);
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
      Engine.register(DefaultEndpointEngine, fixtureRoot);
      const engine = DefaultEndpointEngine.instance();
      expect(engine.endpoint()).toBe(engine.routes());
    });

    it("returns the registered endpoint", () => {
      class MountedEngine extends Engine {}
      Engine.register(MountedEngine, fixtureRoot);
      const rack = async () => [200, {}, ["OK"]] as const;
      MountedEngine.endpoint(rack as never);
      expect(MountedEngine.instance().endpoint()).toBe(rack);
    });

    it("engine is a rack app and can have its own middleware stack", async () => {
      class Upcaser {
        constructor(private app: (env: never) => Promise<[number, object, string[]]>) {}
        async call(env: never): Promise<[number, object, string[]]> {
          const response = await this.app(env);
          response[2] = response[2].map((part) => part.toUpperCase());
          return response;
        }
      }

      class StackEngine extends Engine {}
      Engine.register(StackEngine, fixtureRoot);
      StackEngine.endpoint((async () => [200, {}, ["Hello World"]]) as never);
      (StackEngine.config.middleware as MiddlewareStackProxy).use(Upcaser as never);

      const response = await StackEngine.instance().call(MockRequest.envFor("/bukkits"));
      expect(response[2]).toEqual(["HELLO WORLD"]);
    });
  });

  describe("load_server", () => {
    it("invokes the registered server blocks and returns self", () => {
      class ServerEngine extends Engine {}
      Engine.register(ServerEngine, fixtureRoot);
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
      Engine.register(ServerAppEngine, fixtureRoot);
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
      Engine.register(PlainNamespacedEngine, fixtureRoot);
      expect(PlainNamespacedEngine.instance().tableNamePrefix()).toBeNull();
    });

    it("returns the explicit option when set", () => {
      class ShopEngine extends Engine {}
      Engine.register(ShopEngine, fixtureRoot);
      ShopEngine.instance().config.tableNamePrefix = "shop_";
      expect(ShopEngine.instance().tableNamePrefix()).toBe("shop_");
    });

    it("falls back to `${engine_name}_` when isolated and unset", () => {
      class IsoEngine extends Engine {}
      Engine.register(IsoEngine, fixtureRoot);
      IsoEngine.isolated(true);
      expect(IsoEngine.instance().tableNamePrefix()).toBe("iso_engine_");
    });
  });

  it("config.eager_load_namespaces accumulates across engines", () => {
    class A extends Engine {}
    class B extends Engine {}
    Engine.register(A, fixtureRoot);
    Engine.register(B, fixtureRoot);
    const before = A.instance().config.eagerLoadNamespaces.length;
    A.instance().config.eagerLoadNamespaces.push("ANs");
    B.instance().config.eagerLoadNamespaces.push("BNs");
    expect(A.instance().config.eagerLoadNamespaces).toBe(B.instance().config.eagerLoadNamespaces);
    expect(A.instance().config.eagerLoadNamespaces.length).toBe(before + 2);
  });

  it("routes lazily instantiates routeSetClass, append-buffers blocks, and hasRoutes flips", () => {
    class MountedEngine extends Engine {}
    Engine.register(MountedEngine, fixtureRoot);
    expect(MountedEngine.instance().hasRoutes()).toBe(false);
    const r1 = MountedEngine.instance().routes((mapper) => {
      mapper.get("/mounted", { to: "mounted#index" });
    });
    expect(r1).toBeInstanceOf(RouteSet);
    expect(MountedEngine.instance().routes(() => {})).toBe(r1);
    expect(MountedEngine.instance().hasRoutes()).toBe(true);
  });

  it("generators(block) yields a mutable options bag", () => {
    const cfg = new EngineConfiguration();
    cfg.generators((g) => {
      (g as unknown as { orm: string }).orm = "active_record";
    });
    expect(cfg.generators().options.get("rails")).toEqual({ orm: "active_record" });
    expect(cfg.generators().templates).toEqual([]);
  });

  it("railties returns a Trailties collection over registered subclasses", () => {
    class RailtiesEngine extends Engine {}
    Engine.register(RailtiesEngine, fixtureRoot);
    const inst = RailtiesEngine.instance();
    const collection = inst.railties();
    expect(collection).toBeInstanceOf(Trailties);
    expect(Array.from(collection)).toContain(inst);
    expect(collection.minus([inst])).not.toContain(inst);
  });

  it("add_routing_paths registers the routes file and route set on the reloader", async () => {
    class RoutingEngine extends Engine {}
    Engine.register(RoutingEngine, fixtureRoot);
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
    Engine.register(ViewEngine, fixtureRoot);
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
    Engine.register(RenderEngine, fixtureRoot);
    const engine = RenderEngine.instance();
    engine.config.setRoot(new URL("./__fixtures__/boot-app", import.meta.url).pathname);
    await engine.initializers.find((i) => i.name === "add_view_paths")!.run();

    class PostsController extends ActionController.Base {}
    PostsController.layout(false);
    runLoadHooks("action_controller", PostsController);

    const controller = new PostsController();
    controller.setResponseBang(new Response());
    await controller.render({ action: "index" });
    expect(controller.responseBody).toBe("posts#index\n");
    resetLoadHooks();
  });

  describe("remaining Engine initializers", () => {
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
      Engine.register(InitializersEngine, fixtureRoot);
      const engine = InitializersEngine.instance();

      await engine.initializers.find((i) => i.name === "load_config_initializers")!.run();

      expect(loaded).toEqual(["a-foo", "b-bar"]);
    });

    it("initializers are executed after application configuration initializers", () => {
      class OrderingEngine extends Engine {}
      Engine.register(OrderingEngine, fixtureRoot);
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
      Engine.register(EnvironmentEngine, fixtureRoot);
      const engine = EnvironmentEngine.instance();

      await engine.initializers.find((i) => i.name === "load_environment_config")!.run();

      expect(loaded).toEqual(["environments/test"]);
    });

    it("prepend_helpers_path unshifts app/helpers onto the application config", async () => {
      class HelpersEngine extends Engine {}
      Engine.register(HelpersEngine, fixtureRoot);
      const engine = HelpersEngine.instance();
      const app = { config: { helpersPaths: ["existing"] } };

      await engine.initializers.find((i) => i.name === "prepend_helpers_path")!.run(app);

      expect(app.config.helpersPaths).toHaveLength(2);
      expect(app.config.helpersPaths[0]).toMatch(/app\/helpers$/);
      expect(app.config.helpersPaths[1]).toBe("existing");
    });

    it("prepend_helpers_path skips an isolated engine that is not the application", async () => {
      class IsolatedEngine extends Engine {}
      Engine.register(IsolatedEngine, fixtureRoot);
      IsolatedEngine.isolated(true);
      const engine = IsolatedEngine.instance();
      const app = { config: { helpersPaths: [] as string[] } };

      await engine.initializers.find((i) => i.name === "prepend_helpers_path")!.run(app);

      expect(app.config.helpersPaths).toEqual([]);
    });

    it("loading seed data", async () => {
      class SeedEngine extends Engine {}
      Engine.register(SeedEngine, fixtureRoot);
      const engine = SeedEngine.instance();

      await engine.loadSeed();

      expect(loaded).toEqual(["seeds"]);
    });

    it("skips nonexistent seed data", async () => {
      class NoSeedEngine extends Engine {}
      Engine.register(NoSeedEngine, fixtureRoot);
      const engine = NoSeedEngine.instance();
      engine.config.setRoot("/nonexistent-engine-root");

      await expect(engine.loadSeed()).resolves.toBeUndefined();
      expect(loaded).toEqual([]);
    });

    it("loading seed data is wrapped by the executor", async () => {
      class WrappedSeedEngine extends Engine {}
      Engine.register(
        WrappedSeedEngine,
        new URL("./__fixtures__/seed-engine", import.meta.url).pathname,
      );
      const engine = WrappedSeedEngine.instance();
      const wrapped: string[] = [];
      const app = {
        reloader: {
          wrap(block: () => void | Promise<void>): void | Promise<void> {
            wrapped.push("wrap");
            return block();
          },
        },
      };

      engine.initializers.find((i) => i.name === "wrap_reloader_around_load_seed")!.run(app);
      await engine.loadSeed();

      expect(wrapped).toEqual(["wrap"]);
      expect(loaded).toEqual(["wrapped-seeds"]);
    });
  });
});
