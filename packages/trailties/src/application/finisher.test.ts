// Mirrors railties/test/application/initializers/finisher_test.rb.
// The ported subset of finisher initializers is exercised against a
// mock host so we don't need the full Application shell (PR 2.5).
import { afterEach, describe, it, expect } from "vitest";
import {
  Finisher,
  type FinisherConfig,
  type FinisherReloader,
  type FinisherRoutes,
} from "./finisher.js";
import { Trails } from "../rails.js";
import type { ConfigurationBlock } from "../trailtie/configuration.js";
import type { Mapper } from "@blazetrails/actionpack";

class TestApp extends Finisher {
  config: FinisherConfig = { toPrepareBlocks: [] };
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
    defineMountedHelper: (name) => this.mountedHelpers.push(name),
  };

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

function run(app: TestApp, name: string): void {
  app.initializers.find((i) => i.name === name)!.run();
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
      "add_internal_routes",
      "build_middleware_stack",
      "define_main_app_helper",
      "add_to_prepare_blocks",
      "run_prepare_callbacks",
    ]);
  });

  it("does not register the intentionally skipped initializers", () => {
    const names = Finisher._ownInitializers().map((i) => i.name);
    for (const skipped of [
      "eager_load!",
      "setup_main_autoloader",
      "setup_default_session_store",
      "finisher_hook",
      "configure_executor_for_concurrency",
      "set_routes_reloader_hook",
      "set_clear_dependencies_hook",
      "enable_yjit",
    ]) {
      expect(names).not.toContain(skipped);
    }
  });

  it("add_generator_templates calls ensureGeneratorTemplatesAdded", () => {
    const app = new TestApp();
    run(app, "add_generator_templates");
    expect(app.calls).toEqual(["generator_templates"]);
  });

  it("build_middleware_stack calls buildMiddlewareStack", () => {
    const app = new TestApp();
    run(app, "build_middleware_stack");
    expect(app.calls).toEqual(["middleware_stack"]);
  });

  it("define_main_app_helper defines the main_app mounted helper", () => {
    const app = new TestApp();
    run(app, "define_main_app_helper");
    expect(app.mountedHelpers).toEqual(["main_app"]);
  });

  it("add_to_prepare_blocks forwards config.toPrepareBlocks to the reloader", () => {
    const app = new TestApp();
    const block: ConfigurationBlock = () => {};
    app.config.toPrepareBlocks.push(block);
    run(app, "add_to_prepare_blocks");
    expect(app.toPrepared).toEqual([block]);
  });

  it("run_prepare_callbacks runs reloader.prepare!", () => {
    const app = new TestApp();
    run(app, "run_prepare_callbacks");
    expect(app.calls).toEqual(["prepare!"]);
  });

  it("add_internal_routes prepends rails/info routes in development", () => {
    Trails.env = "development";
    const app = new TestApp();
    run(app, "add_internal_routes");
    expect(app.internalRoutes).toEqual([
      "get /rails/info/properties -> rails/info#properties (internal)",
      "get /rails/info/routes -> rails/info#routes (internal)",
      "get /rails/info/notes -> rails/info#notes (internal)",
      "get /rails/info -> rails/info#index (internal)",
    ]);
  });

  it("add_internal_routes is a no-op outside development", () => {
    Trails.env = "production";
    const app = new TestApp();
    run(app, "add_internal_routes");
    expect(app.internalRoutes).toEqual([]);
  });

  it("runs all finisher initializers in declared order via runInitializers", () => {
    Trails.env = "production";
    const app = new TestApp();
    app.runInitializers();
    expect(app.calls).toEqual(["generator_templates", "middleware_stack", "prepare!"]);
  });
});
