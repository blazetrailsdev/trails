// Smoke tests for the `Application` shell (PR 2.5a). Full Rails-mirrored
// `railties/test/application/*` cases land in PR 2.5b alongside
// `Configuration` defaults and the default middleware stack.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  NullLogger,
  Executor,
  NullStore,
  onLoad,
  Reloader,
  resetLoadHooks,
  runLoadHooks,
  setTrailsRoot,
  trailsRoot,
} from "@blazetrails/activesupport";
import {
  fsAdapterConfig,
  registerFsAdapter,
  type FsAdapter,
  type PathAdapter,
} from "@blazetrails/ruby-compat";
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
  Executor as ActionDispatchExecutor,
  HostAuthorization,
  Reloader as ActionDispatchReloader,
  RequestId,
  ServerTiming,
  ShowExceptions,
  SSL,
  Static,
  Session,
  ActionController,
} from "@blazetrails/actionpack";
import { Engine } from "./engine.js";
import { Collection } from "./initializable.js";
import { Root } from "./paths.js";
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
      readFile: async (p: string) => {
        if (!files.has(p)) throw new Error("ENOENT");
        return "";
      },
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

  describe("ensure_generator_templates_added", () => {
    it("unshifts the existent lib/templates paths ahead of the configured ones", async () => {
      installFs(new Set(["/", "/app", "/app/lib", "/app/lib/templates"]), new Set());
      class TemplatesApp extends Application {}
      Application.register(TemplatesApp);
      const app = TemplatesApp.instance();
      app.config.setRoot("/app");
      const templates = app.config.generators().templates as string[];
      templates.push("/configured");

      await app.ensureGeneratorTemplatesAdded();

      expect(templates).toEqual(["/app/lib/templates", "/configured"]);
    });

    it("skips a lib/templates path that does not exist", async () => {
      installFs(new Set(["/", "/app"]), new Set());
      class NoTemplatesApp extends Application {}
      Application.register(NoTemplatesApp);
      const app = NoTemplatesApp.instance();
      app.config.setRoot("/app");
      const templates = app.config.generators().templates as string[];

      await app.ensureGeneratorTemplatesAdded();

      expect(templates).toEqual([]);
    });
  });

  describe("initialize!", () => {
    // A LazyRouteSet routing op reads `Trails.application`, which memoizes
    // `@application ||= app_class.instance` (`rails.rb`); clear it so the next
    // registration is what the following test sees.
    afterEach(() => {
      Trails.application = null;
    });

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

    it("publishes the discovered root to the ActiveRecord seam (trailsRoot)", async () => {
      installFs(new Set(["/", "/app", "/app/src"]), new Set(["/app/config.ts"]), "/cwd");
      setTrailsRoot(null);
      class RootPubApp extends Application {}
      RootPubApp.calledFrom("/app/src");
      Application.register(RootPubApp);
      try {
        await RootPubApp.instance().initialize();
        expect(trailsRoot()).toBe("/app");
      } finally {
        setTrailsRoot(null);
      }
    });

    it("publishes config.root override (not the discovered root) to trailsRoot", async () => {
      installFs(
        new Set(["/", "/app", "/app/src", "/override"]),
        new Set(["/app/config.ts"]),
        "/cwd",
      );
      setTrailsRoot(null);
      class RootOverrideApp extends Application {}
      RootOverrideApp.calledFrom("/app/src");
      Application.register(RootOverrideApp);
      const app = RootOverrideApp.instance();
      app.config.setRoot("/override");
      try {
        await app.initialize();
        expect(trailsRoot()).toBe("/override");
      } finally {
        setTrailsRoot(null);
      }
    });

    it("expands a relative config.root override before publishing to trailsRoot", async () => {
      installFs(new Set(["/", "/cwd", "/cwd/rel", "/app", "/app/src"]), new Set([]), "/cwd");
      setTrailsRoot(null);
      class RelRootApp extends Application {}
      RelRootApp.calledFrom("/app/src");
      Application.register(RelRootApp);
      const app = RelRootApp.instance();
      app.config.setRoot("rel");
      try {
        await app.initialize();
        // Rails: `root= -> Pathname.new(value).expand_path` against cwd (/cwd).
        expect(trailsRoot()).toBe("/cwd/rel");
      } finally {
        setTrailsRoot(null);
      }
    });

    it("keeps trailsRoot in sync with a config.setRoot after boot (live read)", async () => {
      installFs(new Set(["/", "/app", "/app/src", "/later"]), new Set(["/app/config.ts"]), "/cwd");
      setTrailsRoot(null);
      class LiveRootApp extends Application {}
      LiveRootApp.calledFrom("/app/src");
      Application.register(LiveRootApp);
      const app = LiveRootApp.instance();
      try {
        await app.initialize();
        expect(trailsRoot()).toBe("/app");
        // Rails reads Rails.root live from application.config.root.
        app.config.setRoot("/later");
        expect(trailsRoot()).toBe("/later");
      } finally {
        setTrailsRoot(null);
      }
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

    it("splices Finisher initializers after the inherited Engine ones", () => {
      class IApp6 extends Application {}
      Application.register(IApp6);
      const names = IApp6.instance().initializers.map((i) => i.name);
      expect(names.slice(-11)).toEqual([
        "add_generator_templates",
        "setup_main_autoloader",
        "setup_default_session_store",
        "build_middleware_stack",
        "define_main_app_helper",
        "add_to_prepare_blocks",
        "run_prepare_callbacks",
        "eager_load!",
        "finisher_hook",
        "add_internal_routes",
        "set_routes_reloader_hook",
      ]);
    });

    it("builds the middleware stack and draws routes when booted", async () => {
      class IApp7 extends Application {}
      Application.register(IApp7);
      const app = IApp7.instance();
      await app.initialize();
      expect(app.config.middleware.middlewares.length).toBeGreaterThan(0);
      expect(app.config.middleware.middlewares.map((m) => m.klass)).toContain(RequestId);
      expect(app.routes().isEmpty()).toBe(true);
      app.routes().draw((mapper) => {
        mapper.get("/hello", "hello#index");
      });
      expect(app.routes().isEmpty()).toBe(false);
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

describe("Trails.application integration (boot-app fixture)", () => {
  afterEach(() => {
    Trails.application = null;
    Application.appClass = null;
  });

  it("boots the app through the initializer chain and serves a controller action", async () => {
    const { BootApp } = await import("./__fixtures__/boot-app/config/application.js");
    const app = Trails.application!;
    app.config.setRoot(new URL("./__fixtures__/boot-app", import.meta.url).pathname);

    await Trails.initialize();

    expect(app).toBeInstanceOf(BootApp);
    // `make_routes_lazy` (`engine.rb:591-593`) selects `LazyRouteSet` in a
    // local env, so `set_routes_reloader_hook` skips the eager load
    // (`application/finisher.rb:164-177`) and the first request draws them.
    expect(app.routesReloader().loaded).toBe(false);
    const [status, , body] = await app.app()({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/posts",
    });
    expect(status).toBe(200);
    expect(JSON.parse(await bodyToString(body))).toEqual({ posts: [] });
    expect(app.routesReloader().loaded).toBe(true);

    const [nestedStatus, , nestedBody] = await app.app()({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/admin/sessions",
    });
    expect(nestedStatus).toBe(200);
    expect(JSON.parse(await bodyToString(nestedBody))).toEqual({ scope: "admin" });
  });

  it("assigns the drawn route set to the controller's _routes", async () => {
    const { BootApp } = await import("./__fixtures__/boot-app/config/application.js");
    class BootAppRoutes extends BootApp {}
    Application.register(BootAppRoutes);
    // The file-wide `resetLoadHooks()` above drops the `:action_controller`
    // hook `action_controller/base.ts:1115` fired at import, so replay it —
    // otherwise the `on_load` block below never runs.
    runLoadHooks("action_controller", ActionController.Base);
    const app = Trails.application!;
    app.config.setRoot(new URL("./__fixtures__/boot-app", import.meta.url).pathname);

    await Trails.initialize();

    // `action_controller.set_configs` (`action_controller/railtie.rb:69-71`)
    // includes `app.routes.url_helpers`, whose `included` block is
    // `redefine_singleton_method(:_routes) { routes }` (`route_set.rb:610-612`).
    expect(ActionController.Base._routes).toBe(app.routes());
    // `build_view_context_class` (`action_view/rendering.rb:61-64`) reads that
    // `_routes` to mix the same helpers into the view context, so a template
    // calls a named route helper as a bare identifier.
    const [status, , body] = await app.app()({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/posts/show",
      HTTP_ACCEPT: "*/*",
    });
    expect(status).toBe(200);
    expect(await bodyToString(body)).toContain('<a href="/posts">All posts</a>');
  });

  it("renders the dev error page through DebugExceptions rather than an ad-hoc catch", async () => {
    const { BootApp } = await import("./__fixtures__/boot-app/config/application.js");
    class BootAppDebug extends BootApp {}
    Application.register(BootAppDebug);
    const app = Trails.application!;
    app.config.setRoot(new URL("./__fixtures__/boot-app", import.meta.url).pathname);
    app.config.considerAllRequestsLocal = true;
    await Trails.initialize();

    const [status] = await app.app()({ REQUEST_METHOD: "GET", PATH_INFO: "/boom" });
    expect(status).toBe(500);
  });
});

describe("Application::Configuration", () => {
  it("config.session_store writes the store and reads it back resolved", () => {
    const c = new Configuration();
    expect(c.sessionStoreQ()).toBeNull();
    expect(c.sessionStore()).toBeNull();

    c.sessionStore(":cookie_store", { key: "_myapp_session" });
    expect(c.sessionStoreQ()).toBe(":cookie_store");
    expect(c.sessionStore()).toBe(Session.CookieStore);
    expect(c.sessionOptions).toEqual({ key: "_myapp_session" });
  });

  it("config.session_store :disabled reads back as nil", () => {
    const c = new Configuration();
    c.sessionStore(":disabled");
    expect(c.sessionStoreQ()).toBe(":disabled");
    expect(c.sessionStore()).toBeNull();
  });

  it("config.session_store with custom custom stores search for it inside the ActionDispatch::Session namespace", () => {
    class MyCustomStore extends Session.CookieStore {}
    Session.sessionStoreConstants.set("MyCustomStore", MyCustomStore);
    try {
      const c = new Configuration();
      c.sessionStore(":my_custom_store");
      expect(c.sessionStore()).toBe(MyCustomStore);
    } finally {
      Session.sessionStoreConstants.delete("MyCustomStore");
    }
  });

  it("config.session_store with unknown store raises helpful error", () => {
    const c = new Configuration();
    c.sessionStore(":nonexistent_store");
    expect(() => c.sessionStore()).toThrow(/Unable to resolve session store :nonexistent_store/);
  });

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
    expect(c.railtiesOrder).toEqual([":all"]);
    expect(c.rakeEagerLoad).toBe(false);
    expect(c.serverTiming).toBe(false);
    expect(c.yjit).toBe(false);
    expect(c.disableSandbox).toBe(false);
    expect(c.sandboxByDefault).toBe(false);
    expect(c.addAutoloadPathsToLoadPath).toBe(true);
    expect(c.encoding).toBe("utf-8");
    expect(c.requireMasterKey).toBe(false);
  });

  it("config.load_defaults 5.0 assigns the 5.0 framework defaults", () => {
    const c = new Configuration();
    c.set("activeRecord", {});
    c.set("actionController", {});
    c.set("activeSupport", {});

    c.loadDefaults("5.0");

    expect(c.sslOptions).toEqual({ hsts: { subdomains: true } });
    expect(c.get("activeRecord")).toEqual({ belongsToRequiredByDefault: true });
    expect(c.get("activeSupport")).toEqual({ toTimePreservesTimezone: ":offset" });
    expect(c.get("actionController")).toEqual({
      perFormCsrfTokens: true,
      forgeryProtectionOriginCheck: true,
    });
    expect(c.loadedConfigVersion).toBe("5.0");
  });

  it("config.load_defaults includes defaults for versions prior to the target version", () => {
    const c = new Configuration();
    c.set("activeRecord", { encryption: {} });

    c.loadDefaults("7.2");

    expect(c.yjit).toBe(true);
    expect(c.addAutoloadPathsToLoadPath).toBe(false);
    expect(c.precompileFilterParameters).toBe(true);
    expect(c.domTestingDefaultHtmlVersion).toBe(":html4");
    expect(c.sslOptions).toEqual({ hsts: { subdomains: true } });
    expect((c.get("activeRecord") as Record<string, unknown>).belongsToRequiredByDefault).toBe(
      true,
    );
    expect(c.loadedConfigVersion).toBe("7.2");
  });

  it("config.load_defaults skips a framework that has not registered its config", () => {
    const c = new Configuration();
    expect(() => c.loadDefaults("8.0")).not.toThrow();
    // `assets` is the one framework slot no loaded trailtie seeds — Rails'
    // `config.assets` comes from Sprockets/Propshaft, which trails has no port
    // of, so `respond_to?(:assets)` is false and `load_defaults` skips it.
    expect(c.get("assets")).toBeUndefined();
  });

  it("config.load_defaults raises on an unknown version", () => {
    const c = new Configuration();
    expect(() => c.loadDefaults("4.2")).toThrow('Unknown version "4.2"');
  });

  it("config.autoload_lib adds lib to the expected paths (array ignore)", () => {
    const c = new Configuration();
    c.setRoot("/app");
    c.autoloadLib({ ignore: ["tasks", "generators"] });

    expect(c.autoloadPaths).toContain("/app/lib");
    expect(c.eagerLoadPaths).toContain("/app/lib");
  });

  it("config.autoload_lib adds lib to the expected paths (empty array ignore)", () => {
    const c = new Configuration();
    c.setRoot("/app");
    c.autoloadLib({ ignore: [] });

    expect(c.autoloadPaths).toContain("/app/lib");
    expect(c.eagerLoadPaths).toContain("/app/lib");
  });

  it("config.autoload_lib adds lib to the expected paths (scalar ignore)", () => {
    const c = new Configuration();
    c.setRoot("/app");
    c.autoloadLib({ ignore: "tasks" });

    expect(c.autoloadPaths).toContain("/app/lib");
    expect(c.eagerLoadPaths).toContain("/app/lib");
  });

  it("setting priority for engines with config.railties_order", () => {
    class BukkitsEngine extends Engine {}
    class BlogEngine extends Engine {}
    class OrderApp extends Application {}
    const app = OrderApp.instance();
    app.config.railtiesOrder = [BukkitsEngine, BlogEngine, ":all", ":main_app"];

    expect(app.orderedRailties()).toEqual([
      BukkitsEngine.instance(),
      BlogEngine.instance(),
      expect.any(Array),
      app,
    ]);
  });

  it("railties_order adds :all with lowest priority if not given", () => {
    class Bukkits2Engine extends Engine {}
    class OrderApp2 extends Application {}
    const app = OrderApp2.instance();
    app.config.railtiesOrder = [Bukkits2Engine];

    const order = app.orderedRailties();
    expect(order[0]).toBe(Bukkits2Engine.instance());
    expect(order[order.length - 1]).toEqual(expect.any(Array));
    expect(order.flat()).toContain(app);
  });

  it("railtiesInitializers walks ordered_railties in reverse", () => {
    class RiApp extends Application {}
    const app = RiApp.instance();
    app.config.railtiesOrder = [":all", ":main_app"];

    const current = new Collection();
    expect(app.railtiesInitializers(current)).toEqual(expect.any(Collection));
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
  const paths = (() => {
    const root = new Root("/app");
    root.add("public");
    return root;
  })();
  const buildApp = () => ({
    config: new Configuration(),
    executor: class extends Executor {},
    reloader: class extends Reloader {},
  });

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

  it("always includes ActionDispatch::Executor, wired to app.executor", () => {
    const app = buildApp();
    const stack = new DefaultMiddlewareStack(app, app.config, paths).buildStack();
    const entry = stack.middlewares.find((m) => m.klass === ActionDispatchExecutor);
    expect(entry?.args[0]).toBe(app.executor);
  });

  it("includes ActionDispatch::Reloader, wired to app.reloader, only when reloading is enabled", () => {
    const app = buildApp();
    app.config.enableReloading = true;
    const stack = new DefaultMiddlewareStack(app, app.config, paths).buildStack();
    expect(stack.middlewares.find((m) => m.klass === ActionDispatchReloader)?.args[0]).toBe(
      app.reloader,
    );
    expect(build((c) => (c.enableReloading = false))).not.toContain(ActionDispatchReloader);
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
    app.config.sessionStore(FakeSessionStore);
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
