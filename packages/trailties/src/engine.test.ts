// Smoke tests for the `Engine` shell. Full Rails-mirrored
// `railties/test/engine_test.rb` cases land in PR 2.2b alongside the
// `Configuration` defaults and route mounting.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fsAdapterConfig,
  registerFsAdapter,
  type FsAdapter,
  type PathAdapter,
} from "@blazetrails/activesupport";
import { Engine } from "./engine.js";
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
    expect(BlogEngine.engineName()).toBe("blog_engine");
    expect(BlogEngine.engineName()).toBe(BlogEngine.railtieName());
  });

  it("isolated? defaults to false", () => {
    class PlainEngine extends Engine {}
    Trailtie.register(PlainEngine);
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
    installFs(new Set(["/", "/found", "/found/sub"]), new Set(["/found/lib"]));
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
      expect(cfg.middleware).toEqual([]);
      expect(cfg.javascriptPath).toBe("javascript");
      expect(cfg.routeSetClass).toBeNull();
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
    });

    it("autoload_paths, autoload_once_paths, eager_load_paths are independently writable", () => {
      const cfg = new EngineConfiguration();
      cfg.autoloadPaths.push("/x/auto");
      cfg.autoloadOncePaths.push("/x/once");
      cfg.eagerLoadPaths.push("/x/eager");
      expect(cfg.allAutoloadPaths()).toEqual(["/x/auto"]);
      expect(cfg.allAutoloadOncePaths()).toEqual(["/x/once"]);
      expect(cfg.allEagerLoadPaths()).toEqual(["/x/eager"]);
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
    const blocks: Array<() => void> = [];
    class FakeRouteSet {
      constructor(public cfg: EngineConfiguration) {}
      append(b: () => void): void {
        blocks.push(b);
      }
    }
    class MountedEngine extends Engine {}
    Trailtie.register(MountedEngine);
    expect(MountedEngine.instance().hasRoutes()).toBe(false);
    MountedEngine.instance().config.routeSetClass = FakeRouteSet;
    const r1 = MountedEngine.instance().routes(() => {});
    expect(r1).toBeInstanceOf(FakeRouteSet);
    expect(MountedEngine.instance().routes(() => {})).toBe(r1);
    expect(blocks).toHaveLength(2);
    expect(MountedEngine.instance().hasRoutes()).toBe(true);
  });

  it("generators(block) yields a mutable options bag", () => {
    const cfg = new EngineConfiguration();
    cfg.generators((g) => {
      g.orm = "active_record";
    });
    expect(cfg.generators()).toEqual({ orm: "active_record" });
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
});
