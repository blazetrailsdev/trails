import { Pathname } from "@blazetrails/ruby-compat";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Configuration } from "../../lib/application/configuration.js";
import { Trailtie, type ActionControllerConfig } from "../../lib/trailties/action-controller.js";
import { Deprecators, resetLoadHooks, runLoadHooks } from "@blazetrails/activesupport";
import { Trailtie as BaseTrailtie } from "../../lib/trailtie.js";
import { AbstractController, ActionController, RouteSet } from "@blazetrails/actionpack";
import { extend } from "@blazetrails/ruby-compat";
import { Loader } from "@blazetrails/zeitwerk";

let deprecators: Deprecators;
let app: {
  deprecators: Deprecators;
  routes(): RouteSet;
  helpersPaths(): Promise<string[]>;
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
      async helpersPaths() {
        return this.config.helpersPaths;
      },
      config: Object.assign(new Configuration(new Pathname("/app")), { helpersPaths: [] }),
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
      async helpersPaths() {
        return this.config.helpersPaths;
      },
      config: Object.assign(new Configuration(new Pathname("/app")), { helpersPaths: [root] }),
    };
    savedConfig = structuredClone(
      Trailtie.config.get("actionController") as ActionControllerConfig,
    );
  });

  afterEach(async () => {
    await loader?.unload();
    loader?.unregister();
    loader = null;
    Trailtie.config.set("actionController", savedConfig);
    rmSync(root, { recursive: true, force: true });
  });

  function receivingController(): AbstractController.HelpersClassMethods {
    class HelpersReceiver extends ActionController.Base {}
    return HelpersReceiver;
  }

  let loader: Loader | null = null;

  async function autoload(dirs: string[]): Promise<void> {
    loader = new Loader();
    for (const dir of dirs) await loader.pushDir(dir);
    await loader.setup();
    await loader.eagerLoad();
  }

  async function bootAndInstantiate(klass: AbstractController.HelpersClassMethods): Promise<void> {
    await autoload(app.config.helpersPaths);
    runLoadHooks("action_controller", klass);
    await ActionController.Trailties.Helpers.inherited(klass);
  }

  it("test_all_helpers", async () => {
    const base = receivingController();
    await runTrailtieInitializers(Trailtie, app);
    await bootAndInstantiate(base);

    const methods = extend({}, base._helpers!);
    expect("bareA" in methods).toBe(true);
    expect("stratego" in methods).toBe(true);
    expect("foobar" in methods).toBe(true);
  });

  it("keeps a helper exported as a class, which is a Module", async () => {
    writeFileSync(
      join(root, "klass-helper.ts"),
      "export class KlassHelper { fromKlass() { return 'klass'; } }",
    );
    const base = receivingController();
    await runTrailtieInitializers(Trailtie, app);
    await bootAndInstantiate(base);

    expect("fromKlass" in extend({}, base._helpers!)).toBe(true);
  });

  it("sets helpersPath on the controller from config.helpersPaths", async () => {
    const base = receivingController();
    await runTrailtieInitializers(Trailtie, app);
    await bootAndInstantiate(base);

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
      await bootAndInstantiate(base);

      expect("bareA" in extend({}, base._helpers!)).toBe(false);
      expect("baz" in extend({}, base._helpers!)).toBe(true);
    } finally {
      rmSync(alternate, { recursive: true, force: true });
    }
  });

  it("includes nothing when includeAllHelpers is false", async () => {
    const cfg = Trailtie.config.get("actionController") as ActionControllerConfig;
    Trailtie.config.set("actionController", { ...cfg, includeAllHelpers: false });
    const base = receivingController();

    await runTrailtieInitializers(Trailtie, app);
    runLoadHooks("action_controller", ActionController.Base);
    try {
      await bootAndInstantiate(base);
      expect("bareA" in extend({}, base._helpers!)).toBe(false);
    } finally {
      ActionController.Base.includeAllHelpers = true;
    }
  });

  it("includes nothing when the app has no app/helpers directory", async () => {
    app.config.helpersPaths = [];
    const base = receivingController();

    await runTrailtieInitializers(Trailtie, app);
    await bootAndInstantiate(base);

    expect("bareA" in extend({}, base._helpers!)).toBe(false);
  });
});
