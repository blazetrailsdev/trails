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
import { Configuration } from "./application/configuration.js";
import { DefaultMiddlewareStack } from "./application/default-middleware-stack.js";
import {
  ActionableExceptions,
  AssumeSSL,
  Callbacks,
  ContentSecurityPolicyMiddleware,
  Cookies,
  DebugExceptions,
  HostAuthorization,
  RequestId,
  ServerTiming,
  ShowExceptions,
  SSL,
  Static,
} from "@blazetrails/actionpack";
import { Engine } from "./engine.js";
import { Trailtie } from "./trailtie.js";
import { Trails } from "./rails.js";
import { HelloWorldApp, buildRoutes } from "./__fixtures__/hello-world/app.js";
import { bodyToString } from "@blazetrails/rack";

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

describe("Trails.application integration (PR 2.6 hello-world fixture)", () => {
  afterEach(() => {
    Trails.application = null;
  });

  it("initializes a registered Application subclass and serves a route through actionpack", async () => {
    Application.register(HelloWorldApp);
    expect(Trails.application).toBeInstanceOf(HelloWorldApp);
    await Trails.initialize();
    expect(Trails.initialized()).toBe(true);
    const [status, , body] = await buildRoutes().call({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/hello",
    });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toBe("hello world");
  });
});

describe("Application::Configuration", () => {
  it("defaults match Rails::Application::Configuration#initialize", () => {
    const c = new Configuration();
    expect(c.considerAllRequestsLocal).toBe(false);
    expect(c.apiOnly).toBe(false);
    expect(c.timeZone).toBe("UTC");
    expect(c.beginningOfWeek).toBe("monday");
    expect(c.logLevel).toBe("debug");
    expect(c.publicFileServer).toEqual({ enabled: true, indexName: "index", headers: null });
    expect(c.assumeSsl).toBe(false);
    expect(c.forceSsl).toBe(false);
    expect(c.hosts).toEqual([]);
    expect(c.filterParameters).toEqual([]);
    expect(c.helpersPaths).toEqual([]);
    expect(c.reloadClassesOnlyOnChange).toBe(true);
    expect(c.autoflushLog).toBe(true);
    expect(c.railtiesOrder).toEqual(["all"]);
    expect(c.rakeEagerLoad).toBe(false);
    expect(c.serverTiming).toBe(false);
    expect(c.yjit).toBe(false);
    expect(c.disableSandbox).toBe(false);
    expect(c.sandboxByDefault).toBe(false);
    expect(c.addAutoloadPathsToLoadPath).toBe(true);
    expect(c.encoding).toBe("utf-8");
    expect(c.requireMasterKey).toBe(false);
  });

  it("paths() appends the application-only 'public' entry on top of EngineConfiguration", () => {
    // Rails: application/configuration.rb#paths adds public, tmp, log, etc.
    // Trails only ports `public` today (the rest follow in PR 2.7-followups).
    const c = new Configuration();
    expect(c.paths().get("public")).toBeDefined();
  });

  it("config.enable_reloading is !config.cache_classes", () => {
    const c = new Configuration();
    c.cacheClasses = true;
    expect(c.enableReloading).toBe(false);
    c.enableReloading = true;
    expect(c.cacheClasses).toBe(false);
    expect(c.reloadingEnabled()).toBe(true);
  });
});

describe("Application::DefaultMiddlewareStack", () => {
  const paths = { public: () => "/public" };
  const buildApp = () => ({ config: new Configuration() });

  const build = (mutate: (c: Configuration) => void = () => {}) => {
    const app = buildApp();
    mutate(app.config);
    return new DefaultMiddlewareStack(app, app.config, paths)
      .buildStack()
      .middlewares.map((m) => m.klass);
  };

  it("default stack always includes RequestId, ShowExceptions, DebugExceptions, Callbacks, Static", () => {
    const k = build();
    expect(k).toEqual(
      expect.arrayContaining([RequestId, ShowExceptions, DebugExceptions, Callbacks, Static]),
    );
  });

  it("includes HostAuthorization only when config.hosts is non-empty", () => {
    expect(build()).not.toContain(HostAuthorization);
    expect(build((c) => (c.hosts = ["example.com"]))).toContain(HostAuthorization);
  });

  it("includes AssumeSSL when config.assume_ssl is true", () => {
    expect(build((c) => (c.assumeSsl = true))).toContain(AssumeSSL);
  });

  it("includes SSL middleware when config.force_ssl is true", () => {
    expect(build((c) => (c.forceSsl = true))).toContain(SSL);
  });

  it("excludes Static when public_file_server.enabled is false", () => {
    expect(build((c) => (c.publicFileServer.enabled = false))).not.toContain(Static);
  });

  it("includes ServerTiming only when config.server_timing is true", () => {
    expect(build()).not.toContain(ServerTiming);
    expect(build((c) => (c.serverTiming = true))).toContain(ServerTiming);
  });

  it("includes ActionableExceptions only when consider_all_requests_local is true", () => {
    expect(build()).not.toContain(ActionableExceptions);
    expect(build((c) => (c.considerAllRequestsLocal = true))).toContain(ActionableExceptions);
  });

  it("includes Cookies + ContentSecurityPolicyMiddleware unless api_only", () => {
    expect(build()).toEqual(expect.arrayContaining([Cookies, ContentSecurityPolicyMiddleware]));
    const apiOnly = build((c) => (c.apiOnly = true));
    expect(apiOnly).not.toContain(Cookies);
    expect(apiOnly).not.toContain(ContentSecurityPolicyMiddleware);
  });

  it("show_exceptions_app falls back to a PublicExceptions instance when exceptions_app is unset", () => {
    const app = buildApp();
    const stack = new DefaultMiddlewareStack(app, app.config, paths).buildStack();
    expect(stack.middlewares.find((m) => m.klass === ShowExceptions)?.args[0]).toBeTruthy();
  });

  it("forces session_options.secure when force_ssl + session_store and secure not explicit", () => {
    const app = buildApp();
    class FakeSessionStore {}
    app.config.forceSsl = true;
    app.config.sessionStore = FakeSessionStore;
    new DefaultMiddlewareStack(app, app.config, paths).buildStack();
    expect(app.config.sessionOptions.secure).toBe(true);
  });
});

describe("Application key/message/credentials wiring", () => {
  beforeEach(() => resetLoadHooks());
  afterEach(() => {
    fsAdapterConfig.adapter = PREV;
    resetLoadHooks();
    Application.appClass = null;
  });

  const setSecret = (app: Application, s: string) => {
    app.config.secretKeyBase = s;
  };

  it("routes_reloader memoized, key_generator/message_verifier work, config_for rejects non-database, Configuration defaults null", async () => {
    expect(new Configuration().credentials).toEqual({ contentPath: null, keyPath: null });
    expect(new Configuration().secretKeyBase).toBeNull();
    class A extends Application {}
    Application.register(A);
    const app = A.instance();
    expect(app.routesReloader()).toBe(app.routesReloader());
    expect(() => app.keyGenerator()).toThrow(/secret_key_base/);
    setSecret(app, "test-secret");
    const gen = app.keyGenerator();
    expect(gen.generateKey("salt", 16)).toBeInstanceOf(Buffer);
    expect(app.keyGenerator()).toBe(gen);
    const v = app.messageVerifier("cookies");
    expect(v.verify(v.generate({ foo: 1 }))).toEqual({ foo: 1 });
    await expect(app.configFor("exception_notification")).rejects.toThrow(/only "database"/);
  });

  it("credentials prefers env-specific config/credentials/{env}.yml.enc, else config/credentials.yml.enc", async () => {
    const b = "/app/config/credentials";
    installFs(
      new Set(["/", "/app", "/app/config", b]),
      new Set(["/app/config.ts", `${b}/development.yml.enc`, `${b}/development.key`]),
    );
    class A extends Application {}
    A.calledFrom("/app");
    Application.register(A);
    let f = await A.instance().credentials();
    expect([f.contentPath, f.keyPath]).toEqual([
      `${b}/development.yml.enc`,
      `${b}/development.key`,
    ]);
    installFs(new Set(["/", "/o", "/o/config"]), new Set(["/o/config.ts"]));
    class B extends Application {}
    B.calledFrom("/o");
    Application.register(B);
    f = await B.instance().credentials();
    expect([f.contentPath, f.keyPath, f.envKey]).toEqual([
      "/o/config/credentials.yml.enc",
      "/o/config/master.key",
      "RAILS_MASTER_KEY",
    ]);
  });
});
