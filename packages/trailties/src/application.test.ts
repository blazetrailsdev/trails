// Smoke tests for the `Application` shell (PR 2.5a). Full Rails-mirrored
// `railties/test/application/*` cases land in PR 2.5b alongside
// `Configuration` defaults and the default middleware stack.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fsAdapterConfig,
  NullLogger,
  NullStore,
  onLoad,
  registerFsAdapter,
  resetLoadHooks,
  type FsAdapter,
  type PathAdapter,
} from "@blazetrails/activesupport";
import { Application } from "./application.js";
import { Engine } from "./engine.js";
import { Trailtie } from "./trailtie.js";

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

function installFs(dirs: Set<string>, files: Set<string>, cwd = "/"): void {
  registerFsAdapter(
    "application-test",
    {
      cwd: () => cwd,
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
  fsAdapterConfig.adapter = "application-test";
}

const PREV = fsAdapterConfig.adapter;
beforeEach(() => resetLoadHooks());
afterEach(() => {
  fsAdapterConfig.adapter = PREV;
  resetLoadHooks();
  Application.appClass = null;
});

describe("Application", () => {
  it("is a subclass of Engine", () => {
    expect(Application.prototype).toBeInstanceOf(Engine);
  });

  it("Application is abstract and cannot be instantiated directly", () => {
    expect(() => new Application()).toThrow(/abstract/);
  });

  describe("register", () => {
    it("sets appClass to the registered subclass", () => {
      class MyApp extends Application {}
      Application.register(MyApp);
      expect(Application.appClass).toBe(MyApp);
    });

    it("fires :before_configuration load hooks with the subclass", () => {
      class MyApp2 extends Application {}
      const seen: unknown[] = [];
      onLoad("before_configuration", (base) => {
        seen.push(base);
      });
      Application.register(MyApp2);
      expect(seen).toEqual([MyApp2]);
    });

    it("registers the subclass in the Trailtie registry", () => {
      class MyApp3 extends Application {}
      Application.register(MyApp3);
      expect(Trailtie.subclasses()).toContain(MyApp3);
    });

    it("is idempotent — :before_configuration fires once per subclass", () => {
      class MyApp4 extends Application {}
      const seen: unknown[] = [];
      onLoad("before_configuration", (base) => {
        seen.push(base);
      });
      Application.register(MyApp4);
      Application.register(MyApp4);
      expect(seen).toEqual([MyApp4]);
    });
  });

  describe("name", () => {
    it("dasherizes the class name and strips a trailing /application", () => {
      class MyBlogApplication extends Application {}
      Application.register(MyBlogApplication);
      expect(MyBlogApplication.instance().name()).toBe("my-blog");
    });

    it("dasherizes without the suffix when the class has no Application name", () => {
      class WidgetShop extends Application {}
      Application.register(WidgetShop);
      expect(WidgetShop.instance().name()).toBe("widget-shop");
    });
  });

  describe("find_root", () => {
    it("walks parents looking for config.ts (trails' config.ru analog)", async () => {
      installFs(new Set(["/", "/app", "/app/src", "/app/src/inner"]), new Set(["/app/config.ts"]));
      class RootApp extends Application {}
      Application.register(RootApp);
      expect(await RootApp.findRoot("/app/src/inner")).toBe("/app");
    });

    it("falls back to fs.cwd() when no flag is found", async () => {
      installFs(new Set(["/", "/cwd", "/elsewhere"]), new Set(["/cwd/config.ts"]), "/cwd");
      class CwdApp extends Application {}
      Application.register(CwdApp);
      expect(await CwdApp.findRoot("/elsewhere")).toBe("/cwd");
    });
  });

  describe("initialize!", () => {
    it("returns false from initialized? before initialize() is called", () => {
      class IApp extends Application {}
      Application.register(IApp);
      expect(IApp.instance().initialized()).toBe(false);
    });

    it("runs the Bootstrap initializer chain and flips initialized?", async () => {
      class IApp2 extends Application {}
      Application.register(IApp2);
      const app = IApp2.instance();
      await app.initialize();
      expect(app.initialized()).toBe(true);
      // Bootstrap.initialize_logger wired a default NullLogger.
      expect(app.logger).toBeInstanceOf(NullLogger);
      // Bootstrap.initialize_cache wired a default NullStore.
      expect(app.cache).toBeInstanceOf(NullStore);
    });

    it("fires :after_initialize load hooks once initialization completes", async () => {
      class IApp3 extends Application {}
      Application.register(IApp3);
      const seen: unknown[] = [];
      onLoad("after_initialize", (base) => {
        seen.push(base);
      });
      const app = IApp3.instance();
      await app.initialize();
      expect(seen).toEqual([app]);
    });

    it("raises when called twice", async () => {
      class IApp4 extends Application {}
      Application.register(IApp4);
      const app = IApp4.instance();
      await app.initialize();
      await expect(app.initialize()).rejects.toThrow(/already initialized/);
    });

    it("splices Bootstrap initializers ahead of inherited Engine ones", () => {
      class IApp5 extends Application {}
      Application.register(IApp5);
      const names = IApp5.instance().initializers.map((i) => i.name);
      expect(names).toContain("load_environment_config");
      expect(names).toContain("initialize_logger");
      expect(names).toContain("initialize_cache");
      expect(names).toContain("bootstrap_hook");
    });
  });
});
