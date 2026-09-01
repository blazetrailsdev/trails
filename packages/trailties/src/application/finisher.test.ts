// Mirrors railties/test/application/initializers/finisher_test.rb.
// The ported subset of finisher initializers is exercised against a
// mock host so we don't need the full Application shell (PR 2.5).
import { afterEach, describe, it, expect } from "vitest";
import {
  Finisher,
  type FinisherConfig,
  type FinisherReloader,
  type FinisherRoutes,
  type FinisherRoutesReloader,
} from "./finisher.js";
import { onLoad, resetLoadHooks } from "@blazetrails/activesupport";
import { Root } from "../paths.js";
import { Trails } from "../rails.js";
import type { ConfigurationBlock } from "../trailtie/configuration.js";
import type { Mapper } from "@blazetrails/actionpack";

class TestApp extends Finisher {
  sessionStoreArgs: unknown[] | null = null;
  config: FinisherConfig = {
    toPrepareBlocks: [],
    eagerLoad: null,
    eagerLoadNamespaces: [],
    sessionStoreQ: () => (this.sessionStoreArgs === null ? null : this.sessionStoreArgs[0]),
    sessionStore: (newSessionStore?: unknown, options?: Record<string, unknown>) =>
      (this.sessionStoreArgs = [newSessionStore, options]),
  };
  railtieName = "test_app_application";
  calls: string[] = [];
  internalRoutes: string[] = [];
  toPrepared: ConfigurationBlock[] = [];
  mountedHelpers: string[] = [];

  private _routes: FinisherRoutes = {
    prepend: (block) =>
      block({
        get: (path: string, options: { to: string; internal?: boolean }) =>
          this.internalRoutes.push(
            `get ${path} -> ${options.to}${options.internal === true ? " (internal)" : ""}`,
          ),
      } as unknown as Mapper),
    append: (block) =>
      block({
        get: (path: string, options: { to: string; internal?: boolean }) =>
          this.internalRoutes.push(
            `get ${path} -> ${options.to}${options.internal === true ? " (internal)" : ""}`,
          ),
      } as unknown as Mapper),
    defineMountedHelper: (name) => this.mountedHelpers.push(name),
  };

  routesReloaderCalls: string[] = [];
  private _routesReloader: FinisherRoutesReloader = {
    eagerLoad: false,
    runAfterLoadPaths: () => {},
    executeUnlessLoaded: async () => {
      this.routesReloaderCalls.push("execute_unless_loaded");
      return true;
    },
  };
  routesReloader(): FinisherRoutesReloader {
    return this._routesReloader;
  }
  async paths(): Promise<Root> {
    return new Root(null);
  }

  routes(): FinisherRoutes {
    return this._routes;
  }
  reloader: FinisherReloader = {
    toPrepare: (block) => this.toPrepared.push(block),
    prepareBang: () => this.calls.push("prepare!"),
  };

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
      "add_internal_routes",
      "set_routes_reloader_hook",
    ]);
  });

  it("does not register the intentionally skipped initializers", () => {
    const names = Finisher._ownInitializers().map((i) => i.name);
    for (const skipped of [
      "configure_executor_for_concurrency",
      "set_clear_dependencies_hook",
      "enable_yjit",
    ]) {
      expect(names).not.toContain(skipped);
    }
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
});
