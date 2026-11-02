import { Autoloaders } from "../autoloaders.js";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import {
  Finisher,
  InterlockHook,
  MonitorHook,
  type FinisherConfig,
  type FinisherReloader,
  type FinisherReloaderInstance,
  type FinisherRoutes,
  type FinisherRoutesReloader,
} from "./finisher.js";
import {
  Dependencies,
  ExecutionWrapper,
  Executor,
  FileUpdateChecker,
  onLoad,
  Reloader,
  resetLoadHooks,
} from "@blazetrails/activesupport";
import {
  Dir,
  FileUtils,
  Monitor,
  Thread,
  ThreadPoolExecutor,
  TimerTask,
} from "@blazetrails/ruby-compat";
import { Root } from "../paths.js";
import { Trails } from "../rails.js";
import type { ConfigurationBlock } from "../trailtie/configuration.js";
import type { Mapper } from "@blazetrails/actionpack";
import { ActiveModel, ValidationError } from "@blazetrails/activemodel";
import { GlobalID, Verifier } from "@blazetrails/globalid";
import { Trailtie as ActiveModelTrailtie } from "../trailties/active-model.js";
import { Trailtie as GlobalIdTrailtie } from "../trailties/global-id.js";
import { Trailtie as ActiveRecordTrailtie } from "../trailties/active-record.js";
import { ActiveRecord, AssociationRelation } from "@blazetrails/activerecord";

class TestApp extends Finisher {
  autoloaders = new Autoloaders();
  sessionStoreArgs: unknown[] | null = null;
  hooks: [unknown, { outer?: boolean } | undefined][] = [];
  executor = {
    registerHook: (hook: unknown, options?: { outer?: boolean }) => {
      this.hooks.push([hook, options]);
    },
  };
  config: FinisherConfig = {
    root: null,
    allowConcurrency: null,
    toPrepareBlocks: [],
    eagerLoad: null,
    eagerLoadNamespaces: [],
    isSessionStore: () => (this.sessionStoreArgs === null ? null : this.sessionStoreArgs[0]),
    sessionStore: (newSessionStore?: unknown, options?: Record<string, unknown>) =>
      (this.sessionStoreArgs = [newSessionStore, options]),
    reloadClassesOnlyOnChange: true,
    fileWatcher: FileUpdateChecker,
    isReloadingEnabled: () => this.reloadingEnabled,
  };
  reloadingEnabled = false;
  watchableFiles: string[] = [];
  railtieName = "test_app_application";
  calls: string[] = [];
  internalRoutes: string[] = [];
  toPrepared: ConfigurationBlock[] = [];
  mountedHelpers: string[] = [];

  private _routes: FinisherRoutes = {
    prepend: (block) => {
      const mapper = {
        get: (path: string, options: { to: string; internal?: boolean }) =>
          this.internalRoutes.push(
            `get ${path} -> ${options.to}${options.internal === true ? " (internal)" : ""}`,
          ),
      } as unknown as Mapper;
      block.call(mapper);
    },
    append: (block) => {
      const mapper = {
        get: (path: string, options: { to: string; internal?: boolean }) =>
          this.internalRoutes.push(
            `get ${path} -> ${options.to}${options.internal === true ? " (internal)" : ""}`,
          ),
      } as unknown as Mapper;
      block.call(mapper);
    },
    defineMountedHelper: (name) => this.mountedHelpers.push(name),
  };

  routesReloaderCalls: string[] = [];
  reloaders: unknown[] = [];
  private _routesReloader: FinisherRoutesReloader = {
    eagerLoad: false,
    runAfterLoadPaths: () => {},
    execute: async () => {
      this.routesReloaderCalls.push("execute");
    },
    executeUnlessLoaded: async () => {
      this.routesReloaderCalls.push("execute_unless_loaded");
      return true;
    },
  };
  routesReloader(): FinisherRoutesReloader {
    return this._routesReloader;
  }
  paths(): Root {
    return new Root(null);
  }

  routes(): FinisherRoutes {
    return this._routes;
  }
  toRun: Array<(this: FinisherReloaderInstance) => unknown> = [];
  toComplete: Array<(this: FinisherReloaderInstance) => unknown> = [];
  reloader: FinisherReloader = {
    check: () => false,
    toPrepare: (block) => this.toPrepared.push(block),
    toRun: (block) => this.toRun.push(block),
    toComplete: (block) => this.toComplete.push(block),
    prepareBang: () => this.calls.push("prepare!"),
  };
  watchableArgs(): [string[], Record<string, string[]>] {
    return [this.watchableFiles, {}];
  }

  ensureGeneratorTemplatesAdded(): void {
    this.calls.push("generator_templates");
  }
  buildMiddlewareStack(): void {
    this.calls.push("middleware_stack");
  }
}

async function run(app: TestApp, name: string): Promise<void> {
  await app.initializers.find((i) => i.name === name)!.run();
}

describe("Finisher", () => {
  const originalEnv = Trails.env.toString();
  beforeEach(() => {
    resetLoadHooks();
  });
  afterEach(() => {
    Trails.env = originalEnv;
  });

  it("registers the ported finisher initializers in Rails order", () => {
    const names = Finisher._ownInitializers().map((i) => i.name);
    expect(names).toEqual([
      "add_generator_templates",
      "setup_main_autoloader",
      "setup_default_session_store",
      "build_middleware_stack",
      "define_main_app_helper",
      "add_to_prepare_blocks",
      "run_prepare_callbacks",
      "eager_load!",
      "finisher_hook",
      "configure_executor_for_concurrency",
      "add_internal_routes",
      "set_routes_reloader_hook",
      "set_clear_dependencies_hook",
    ]);
  });

  it("does not register the intentionally skipped initializers", () => {
    const names = Finisher._ownInitializers().map((i) => i.name);
    expect(names).not.toContain("enable_yjit");
  });

  it("add_generator_templates calls ensureGeneratorTemplatesAdded", async () => {
    const app = new TestApp();
    await run(app, "add_generator_templates");
    expect(app.calls).toEqual(["generator_templates"]);
  });

  it("setup_default_session_store sets a cookie store keyed on the app name", async () => {
    const app = new TestApp();
    await run(app, "setup_default_session_store");
    expect(app.sessionStoreArgs).toEqual([":cookie_store", { key: "_test_app_session" }]);
  });

  it("setup_default_session_store leaves a configured session store alone", async () => {
    const app = new TestApp();
    app.sessionStoreArgs = [":disabled", {}];
    await run(app, "setup_default_session_store");
    expect(app.sessionStoreArgs).toEqual([":disabled", {}]);
  });

  it("build_middleware_stack calls buildMiddlewareStack", async () => {
    const app = new TestApp();
    await run(app, "build_middleware_stack");
    expect(app.calls).toEqual(["middleware_stack"]);
  });

  it("define_main_app_helper defines the main_app mounted helper", async () => {
    const app = new TestApp();
    await run(app, "define_main_app_helper");
    expect(app.mountedHelpers).toEqual(["main_app"]);
  });

  it("add_to_prepare_blocks forwards config.toPrepareBlocks to the reloader", async () => {
    const app = new TestApp();
    const block: ConfigurationBlock = () => {};
    app.config.toPrepareBlocks.push(block);
    await run(app, "add_to_prepare_blocks");
    expect(app.toPrepared).toEqual([block]);
  });

  it("run_prepare_callbacks runs reloader.prepare!", async () => {
    const app = new TestApp();
    await run(app, "run_prepare_callbacks");
    expect(app.calls).toEqual(["prepare!"]);
  });

  it("add_internal_routes prepends rails/info routes in development", async () => {
    Trails.env = "development";
    const app = new TestApp();
    await run(app, "add_internal_routes");
    expect(app.internalRoutes).toEqual([
      "get /rails/info/properties -> rails/info#properties (internal)",
      "get /rails/info/routes -> rails/info#routes (internal)",
      "get /rails/info/notes -> rails/info#notes (internal)",
      "get /rails/info -> rails/info#index (internal)",
    ]);
  });

  it("add_internal_routes appends the welcome route via run_after_load_paths", async () => {
    Trails.env = "development";
    const app = new TestApp();
    await run(app, "add_internal_routes");
    app.internalRoutes.length = 0;
    await app.routesReloader().runAfterLoadPaths();
    expect(app.internalRoutes).toEqual(["get / -> rails/welcome#index (internal)"]);
  });

  it("add_internal_routes is a no-op outside development", async () => {
    Trails.env = "production";
    const app = new TestApp();
    await run(app, "add_internal_routes");
    expect(app.internalRoutes).toEqual([]);
  });

  it("runs all finisher initializers in declared order via runInitializers", async () => {
    Trails.env = "production";
    const app = new TestApp();
    await app.runInitializers();
    expect(app.calls).toEqual(["generator_templates", "middleware_stack", "prepare!"]);
    expect(app.routesReloaderCalls).toEqual(["execute_unless_loaded"]);
  });

  it("set_routes_reloader_hook copies config.eagerLoad onto the reloader", async () => {
    const app = new TestApp();
    app.config.eagerLoad = true;
    await run(app, "set_routes_reloader_hook");
    expect(app.routesReloader().eagerLoad).toBe(true);
    expect(app.routesReloaderCalls).toEqual(["execute_unless_loaded"]);
  });

  it("set_routes_reloader_hook pushes the routes reloader onto app.reloaders", async () => {
    const app = new TestApp();
    await run(app, "set_routes_reloader_hook");
    expect(app.reloaders).toEqual([app.routesReloader()]);
  });

  it("set_routes_reloader_hook registers a to_run block that reloads the routes", async () => {
    const app = new TestApp();
    await run(app, "set_routes_reloader_hook");
    expect(app.toRun).toHaveLength(1);

    const seen: unknown[] = [];
    onLoad("after_routes_loaded", (target) => seen.push(target));
    let locked = false;
    const instance: FinisherReloaderInstance = {
      requireUnloadLockBang: () => {
        locked = true;
      },
      classUnloadBang: (block) => block?.(),
    };
    await app.toRun[0].call(instance);
    expect(locked).toBe(true);
    expect(app.routesReloaderCalls).toEqual(["execute_unless_loaded", "execute"]);
    expect(seen).toEqual([instance]);
    resetLoadHooks();
  });

  it("eager_load! runs the before_eager_load hooks and the eager load namespaces", async () => {
    const app = new TestApp();
    const seen: string[] = [];
    onLoad("before_eager_load", () => {
      seen.push("before_eager_load");
    });
    app.config.eagerLoad = true;
    app.config.eagerLoadNamespaces = [{ eagerLoadBang: () => seen.push("namespace") }];
    await run(app, "eager_load!");
    expect(seen).toEqual(["before_eager_load", "namespace"]);
    resetLoadHooks();
  });

  it("eager_load! eager loads the ActiveModel, GlobalID and ActiveRecord namespaces", async () => {
    const app = new TestApp();
    app.config.eagerLoad = true;
    app.config.eagerLoadNamespaces = ActiveModelTrailtie.config.eagerLoadNamespaces;
    expect(app.config.eagerLoadNamespaces).toBe(GlobalIdTrailtie.config.eagerLoadNamespaces);
    expect(app.config.eagerLoadNamespaces).toBe(ActiveRecordTrailtie.config.eagerLoadNamespaces);
    expect(app.config.eagerLoadNamespaces).toContain(ActiveRecord);
    await run(app, "eager_load!");
    expect(ActiveModel.ValidationError).toBe(ValidationError);
    expect(GlobalID.Verifier).toBe(Verifier);
    expect(ActiveRecord.AssociationRelation).toBe(AssociationRelation);
  });

  it("eager_load! finishes each namespace's eager load before finisher_hook runs", async () => {
    const app = new TestApp();
    const seen: string[] = [];
    onLoad("after_initialize", () => {
      seen.push("after_initialize");
    });
    app.config.eagerLoad = true;
    app.config.eagerLoadNamespaces = [
      {
        eagerLoadBang: async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
          seen.push("namespace");
        },
      },
    ];
    await run(app, "eager_load!");
    await run(app, "finisher_hook");
    expect(seen).toEqual(["namespace", "after_initialize"]);
    resetLoadHooks();
  });

  it("eager_load! is a no-op when config.eagerLoad is false", async () => {
    const app = new TestApp();
    const seen: string[] = [];
    app.config.eagerLoadNamespaces = [{ eagerLoadBang: () => seen.push("namespace") }];
    await run(app, "eager_load!");
    expect(seen).toEqual([]);
  });

  it("finisher_hook runs the after_initialize load hooks", async () => {
    const app = new TestApp();
    const seen: unknown[] = [];
    onLoad("after_initialize", (base: unknown) => {
      seen.push(base);
    });
    await run(app, "finisher_hook");
    expect(seen).toEqual([app]);
    resetLoadHooks();
  });

  describe("set_clear_dependencies_hook", () => {
    let tmp: string;
    beforeEach(() => {
      tmp = Dir.mktmpdir("finisher");
    });
    afterEach(() => {
      FileUtils.rmRf(tmp);
    });

    it("sets reloader.check to report a watched file change", async () => {
      const app = new TestApp();
      app.reloadingEnabled = true;
      const file = `${tmp}/index.html.tse`;
      FileUtils.touch(file, { mtime: new Date(Date.now() - 10_000) });
      const watcher = new FileUpdateChecker([file], {}, () => {});
      app.reloaders.push(watcher);
      app.reloader = class extends Reloader {} as unknown as FinisherReloader;
      await run(app, "set_clear_dependencies_hook");

      expect(app.reloader.check()).toBe(false);
      FileUtils.touch(file);
      expect(app.reloader.check()).toBe(true);

      await watcher.execute();
      expect(app.reloader.check()).toBe(false);
    });

    it("runs the file watcher under class_unload! before any other to_run block", async () => {
      const app = new TestApp();
      app.reloadingEnabled = true;
      const file = `${tmp}/user.ts`;
      FileUtils.touch(file, { mtime: new Date(Date.now() - 10_000) });
      app.watchableFiles = [file];
      const klass = class extends Reloader {};
      const order: string[] = [];
      klass.toRun(() => void order.push("view"));
      klass.beforeClassUnload(() => void order.push("class_unload"));
      app.reloader = klass as unknown as FinisherReloader;
      await run(app, "set_clear_dependencies_hook");

      expect(app.reloaders).toHaveLength(1);
      expect(klass.check()).toBe(false);
      FileUtils.touch(file);
      expect(klass.check()).toBe(true);

      await klass.runBang();
      expect(order).toEqual(["class_unload", "view"]);
      expect(klass.check()).toBe(false);
    });

    it("always reloads when reload_classes_only_on_change is false", async () => {
      const app = new TestApp();
      app.reloadingEnabled = true;
      app.config.reloadClassesOnlyOnChange = false;
      await run(app, "set_clear_dependencies_hook");
      expect(app.reloader.check()).toBe(true);
      expect(app.reloaders).toEqual([]);
      expect(app.toComplete).toHaveLength(1);
    });

    it("never reloads when reloading is disabled", async () => {
      const app = new TestApp();
      await run(app, "set_clear_dependencies_hook");
      expect(app.reloader.check()).toBe(false);
      expect(app.reloaders).toEqual([]);
      expect(app.toRun).toEqual([]);
    });
  });
});

describe("configure_executor_for_concurrency", () => {
  const name = "configure_executor_for_concurrency";

  it("registers an outer MonitorHook when concurrency is off", async () => {
    const app = new TestApp();
    app.config.allowConcurrency = false;
    await run(app, name);
    expect(app.hooks[0][0]).toBeInstanceOf(MonitorHook);
    expect(app.hooks[0][1]).toEqual({ outer: true });
  });

  it("registers nothing when concurrency is unsafe", async () => {
    const app = new TestApp();
    app.config.allowConcurrency = "unsafe";
    app.reloadingEnabled = true;
    await run(app, name);
    expect(app.hooks).toEqual([]);
  });

  it("registers an outer InterlockHook only when reloading", async () => {
    const app = new TestApp();
    await run(app, name);
    expect(app.hooks).toEqual([]);
    app.reloadingEnabled = true;
    await run(app, name);
    expect(app.hooks).toEqual([[InterlockHook, { outer: true }]]);
  });
});

describe("InterlockHook", () => {
  it("shares the interlock from run to complete", async () => {
    await InterlockHook.run();
    const held = await Dependencies.interlock.rawState((data) => data.get(Thread.current()));
    expect(held?.sharing).toBe(1);
    await InterlockHook.complete(null);
    const left = await Dependencies.interlock.rawState((data) => data.get(Thread.current()));
    expect(left?.sharing ?? 0).toBe(0);
  });
});

describe("MonitorHook", () => {
  it("excludes a second thread's executor until the first completes", async () => {
    const executor = class extends Executor {};
    executor.registerHook(new MonitorHook(), { outer: true });
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const first = new Thread(() =>
      executor.wrap(async () => {
        order.push("first");
        await gate;
        order.push("first done");
      }),
    );
    await Thread.pass();
    const second = new Thread(() =>
      executor.wrap(async () => {
        order.push("second");
      }),
    );
    await Thread.pass();
    release();
    await first.join();
    await second.join();
    expect(order).toEqual(["first", "first done", "second"]);
  });

  it("holds its monitor from run to complete", () => {
    const monitor = new Monitor();
    const hook = new MonitorHook(monitor);
    hook.run();
    expect(monitor.isMonOwned()).toBe(true);
    hook.complete(null);
    expect(monitor.isMonOwned()).toBe(false);
  });
});

describe("executor.wrap on pool threads outside a request", () => {
  const pause = () => new Promise((resolve) => setTimeout(resolve, 5));

  function pool(): ThreadPoolExecutor {
    return new ThreadPoolExecutor({ minThreads: 0, maxThreads: 2, maxQueue: 0 });
  }

  it("excludes concurrent flows under allow_concurrency = false", async () => {
    class PoolExecutor extends ExecutionWrapper {}
    PoolExecutor.registerHook(new MonitorHook(), { outer: true });
    const events: string[] = [];
    const threads = new Set<Thread>();
    const executor = pool();
    for (const name of ["a", "b"]) {
      executor.post(() =>
        PoolExecutor.wrap(async () => {
          threads.add(Thread.current());
          events.push(`enter ${name}`);
          await pause();
          events.push(`leave ${name}`);
        }),
      );
    }

    executor.shutdown();
    await executor.waitForTermination();

    expect(events).toEqual(["enter a", "leave a", "enter b", "leave b"]);
    expect(threads.size).toBe(2);
  });

  it("blocks a reload through InterlockHook while a flow runs", async () => {
    class PoolExecutor extends ExecutionWrapper {}
    PoolExecutor.registerHook(InterlockHook, { outer: true });
    const events: string[] = [];
    const executor = pool();
    executor.post(() =>
      PoolExecutor.wrap(async () => {
        events.push("running");
        await pause();
        await pause();
        events.push("done");
      }),
    );
    await pause();

    await Dependencies.interlock.unloading(() => {
      events.push("unloading");
    });
    executor.shutdown();
    await executor.waitForTermination();

    expect(events).toEqual(["running", "done", "unloading"]);
  });

  it("excludes overlapping TimerTask flows started on one thread", async () => {
    class PoolExecutor extends ExecutionWrapper {}
    PoolExecutor.registerHook(new MonitorHook(), { outer: true });
    const events: string[] = [];
    const threads = new Set<Thread>();
    const finished: Promise<void>[] = [];
    const tasks = ["a", "b"].map((name) => {
      let finish!: () => void;
      finished.push(new Promise((resolve) => (finish = resolve)));
      return new TimerTask({ executionInterval: 0.001, runNow: true }, (task) => {
        task.shutdown();
        return PoolExecutor.wrap(async () => {
          threads.add(Thread.current());
          events.push(`enter ${name}`);
          await pause();
          events.push(`leave ${name}`);
          finish();
        });
      });
    });

    for (const task of tasks) task.execute();
    await Promise.all(finished);

    expect(events).toEqual(["enter a", "leave a", "enter b", "leave b"]);
    expect(threads.size).toBe(2);
    expect(threads.has(Thread.current())).toBe(false);
  });
});
