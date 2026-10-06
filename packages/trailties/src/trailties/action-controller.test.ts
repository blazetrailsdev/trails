import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Configuration } from "../application/configuration.js";
import { Trailtie, type ActionControllerConfig } from "./action-controller.js";
import { Deprecators, resetLoadHooks, runLoadHooks } from "@blazetrails/activesupport";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import { AbstractController, ActionController, RouteSet } from "@blazetrails/actionpack";
import { extend } from "@blazetrails/ruby-compat";

let deprecators: Deprecators;
let app: {
  deprecators: Deprecators;
  routes(): RouteSet;
  config: Configuration;
};

describe("ActionController::Trailtie", () => {
  let savedConfig: ActionControllerConfig;

  beforeEach(() => {
    deprecators = new Deprecators();
    const routes = new RouteSet();
    app = {
      deprecators,
      routes: () => routes,
      config: Object.assign(new Configuration("/app"), { helpersPaths: [] }),
    };
    savedConfig = structuredClone(
      Trailtie.config.get("actionController") as ActionControllerConfig,
    );
  });

  afterEach(() => {
    Trailtie.config.set("actionController", savedConfig);
  });

  it("ActionController::Railtie is registered in the global subclasses list", () => {
    expect(BaseTrailtie.subclasses()).toContain(Trailtie);
  });

  it("runInitializers registers the ActionController deprecator", async () => {
    await runTrailtieInitializers(Trailtie, app);
    expect(deprecators.get("actionController")).toBe(ActionController.deprecator());
  });

  it("seeds config.actionController with the Rails default OrderedOptions block", () => {
    const cfg = Trailtie.config.get("actionController") as ActionControllerConfig;
    expect(cfg.raiseOnOpenRedirects).toBe(false);
    expect(cfg.logQueryTagsAroundActions).toBe(true);
    expect(cfg.wrapParametersByDefault).toBe(false);
    expect(cfg.includeAllHelpers).toBe(true);
  });
});

describe("action_controller.set_helpers_path", () => {
  let root: string;
  let savedConfig: ActionControllerConfig;

  beforeEach(() => {
    resetLoadHooks();
    deprecators = new Deprecators();
    const routes = new RouteSet();
    root = mkdtempSync(join(tmpdir(), "include-all-helpers-"));
    mkdirSync(join(root, "fun"), { recursive: true });
    writeFileSync(join(root, "abc-helper.ts"), "export const AbcHelper = { bareA: () => 'a' };");
    writeFileSync(
      join(root, "fun", "games-helper.ts"),
      "export const GamesHelper = { stratego: () => 'Iz guuut!' };",
    );
    writeFileSync(
      join(root, "fun", "pdf-helper.ts"),
      "export const PdfHelper = { foobar: () => 'baz' };",
    );
    app = {
      deprecators,
      routes: () => routes,
      config: Object.assign(new Configuration("/app"), { helpersPaths: [root] }),
    };
    savedConfig = structuredClone(
      Trailtie.config.get("actionController") as ActionControllerConfig,
    );
  });

  afterEach(() => {
    Trailtie.config.set("actionController", savedConfig);
    rmSync(root, { recursive: true, force: true });
  });

  function receivingController(): AbstractController.HelpersClassMethods {
    class HelpersReceiver extends ActionController.Base {}
    return HelpersReceiver as unknown as AbstractController.HelpersClassMethods;
  }

  function bootAndInstantiate(klass: AbstractController.HelpersClassMethods): void {
    runLoadHooks("action_controller", klass);
    new (klass as unknown as new () => unknown)();
  }

  it("test_all_helpers", async () => {
    const base = receivingController();
    await runTrailtieInitializers(Trailtie, app);
    bootAndInstantiate(base);

    const methods = extend({}, base._helpers!);
    expect("bareA" in methods).toBe(true);
    expect("stratego" in methods).toBe(true);
    expect("foobar" in methods).toBe(true);
  });

  it("sets helpersPath on the controller from config.helpersPaths", async () => {
    const base = receivingController();
    await runTrailtieInitializers(Trailtie, app);
    bootAndInstantiate(base);

    expect((base as ActionController.HelpersPathControllerClass).helpersPath).toEqual([root]);
  });

  it("test_all_helpers_with_alternate_helper_dir", async () => {
    const alternate = mkdtempSync(join(tmpdir(), "alternate-helpers-"));
    writeFileSync(
      join(alternate, "foo-helper.ts"),
      "export const FooHelper = { baz: () => 'baz' };",
    );
    app.config.helpersPaths = [alternate];
    const base = receivingController();

    try {
      await runTrailtieInitializers(Trailtie, app);
      bootAndInstantiate(base);

      expect("bareA" in extend({}, base._helpers!)).toBe(false);
      expect("baz" in extend({}, base._helpers!)).toBe(true);
    } finally {
      rmSync(alternate, { recursive: true, force: true });
    }
  });

  it("raises when the file does not export the helper constant Rails would name", async () => {
    writeFileSync(join(root, "typo-helper.ts"), "export const TypoHelpeR = { oops: () => 1 };");
    const base = receivingController();

    await runTrailtieInitializers(Trailtie, app);

    expect(() => bootAndInstantiate(base)).toThrow("uninitialized constant TypoHelper");
    expect("oops" in extend({}, base._helpers!)).toBe(false);
  });

  it("includes nothing when includeAllHelpers is false", async () => {
    const cfg = Trailtie.config.get("actionController") as ActionControllerConfig;
    Trailtie.config.set("actionController", { ...cfg, includeAllHelpers: false });
    const base = receivingController();

    await runTrailtieInitializers(Trailtie, app);
    runLoadHooks("action_controller", ActionController.Base);
    try {
      bootAndInstantiate(base);
      expect("bareA" in extend({}, base._helpers!)).toBe(false);
    } finally {
      ActionController.Base.includeAllHelpers = true;
    }
  });

  it("includes nothing when the app has no app/helpers directory", async () => {
    app.config.helpersPaths = [];
    const base = receivingController();

    await runTrailtieInitializers(Trailtie, app);
    bootAndInstantiate(base);

    expect("bareA" in extend({}, base._helpers!)).toBe(false);
  });
});
