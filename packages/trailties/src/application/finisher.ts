import { camelize, DescendantsTracker, runLoadHooks, underscore } from "@blazetrails/activesupport";
import { Base as JobBase } from "@blazetrails/activejob";
import { getFs, getPath, registerConstant } from "@blazetrails/ruby-compat";
import { Initializable } from "../initializable.js";
import { Trails } from "../rails.js";
import { LazyRouteSet } from "../engine/lazy-route-set.js";
import type { Root } from "../paths.js";
import type { ConfigurationBlock } from "../trailtie/configuration.js";
import type { DrawCallback } from "@blazetrails/actionpack";
import {
  ActionController,
  controllerConstants,
  type DispatchableControllerClass,
} from "@blazetrails/actionpack";
import { Base, registerModel } from "@blazetrails/activerecord";

export interface FinisherRoutes {
  prepend(block: DrawCallback): void;
  append(block: DrawCallback): void;
  defineMountedHelper(name: string): void;
}

export interface FinisherReloaderInstance {
  requireUnloadLockBang(): void;
  classUnloadBang(block?: () => unknown): unknown;
}

export interface FinisherReloader {
  check: () => boolean;
  toPrepare(block: ConfigurationBlock): void;
  toRun(block: (this: FinisherReloaderInstance) => unknown, options?: { prepend?: boolean }): void;
  toComplete(block: (this: FinisherReloaderInstance) => unknown): void;
  prepareBang(): void;
}

export interface FinisherConfig {
  toPrepareBlocks: ConfigurationBlock[];
  eagerLoad: boolean | null;
  eagerLoadNamespaces: unknown[];
  reloadClassesOnlyOnChange: boolean;
  fileWatcher: unknown;
  isReloadingEnabled(): boolean;
  isSessionStore(): unknown;
  sessionStore(newSessionStore?: unknown, options?: Record<string, unknown>): unknown;
}

export interface FinisherRoutesReloader {
  eagerLoad: boolean;
  runAfterLoadPaths: () => void | Promise<void>;
  execute(): Promise<void>;
  executeUnlessLoaded(): Promise<true | null>;
}

export interface FinisherHost {
  config: FinisherConfig;
  readonly constructor: { name: string };
  readonly railtieName: string;
  routes(): FinisherRoutes;
  reloader: FinisherReloader;
  readonly reloaders: unknown[];
  routesReloader(): FinisherRoutesReloader;
  watchableArgs(): [string[], Record<string, string[]>];
  paths(): Root;
  ensureGeneratorTemplatesAdded(): Promise<void>;
  buildMiddlewareStack(): void;
}

export class Finisher extends Initializable {}

Finisher.initializer("add_generator_templates", async function (this: FinisherHost) {
  await this.ensureGeneratorTemplatesAdded();
});

Finisher.initializer("setup_main_autoloader", async function (this: FinisherHost) {
  for (const [name, klass] of await loadControllers(this.paths())) {
    controllerConstants.set(name, klass);
  }
  for (const klass of controllerConstants.values()) await defineController(klass);
  registerModel(await loadModels(this.paths()));
  await loadJobs(this.paths());
});

Finisher.initializer(
  "setup_default_session_store",
  { before: "build_middleware_stack" },
  function (this: FinisherHost) {
    if (this.config.isSessionStore() == null) {
      const appName = this.constructor.name ? this.railtieName.replace(/_application$/, "") : "";
      this.config.sessionStore(":cookie_store", { key: `_${appName}_session` });
    }
  },
);

Finisher.initializer("build_middleware_stack", function (this: FinisherHost) {
  this.buildMiddlewareStack();
});

Finisher.initializer("define_main_app_helper", function (this: FinisherHost) {
  this.routes().defineMountedHelper("main_app");
});

Finisher.initializer("add_to_prepare_blocks", function (this: FinisherHost) {
  for (const block of this.config.toPrepareBlocks) {
    this.reloader.toPrepare(block);
  }
});

Finisher.initializer("run_prepare_callbacks", function (this: FinisherHost) {
  this.reloader.prepareBang();
});

/**
 * @missingRailsCall eager_load_all — PERMANENT
 * @missingRailsCall eager_load! — PERMANENT
 * @missingRailsCall after_class_unload — PERMANENT
 */
Finisher.initializer("eager_load!", async function (this: FinisherHost) {
  if (this.config.eagerLoad === true) {
    runLoadHooks("before_eager_load", this);
    for (const namespace of this.config.eagerLoadNamespaces) {
      await (namespace as { eagerLoadBang(): Promise<void> }).eagerLoadBang();
    }
  }
});

Finisher.initializer("finisher_hook", function (this: FinisherHost) {
  runLoadHooks("after_initialize", this);
});

Finisher.initializer("add_internal_routes", function (this: FinisherHost) {
  if (!Trails.env["development?"]()) return;
  this.routes().prepend(function () {
    this.get("/rails/info/properties", { to: "rails/info#properties", internal: true });
    this.get("/rails/info/routes", { to: "rails/info#routes", internal: true });
    this.get("/rails/info/notes", { to: "rails/info#notes", internal: true });
    this.get("/rails/info", { to: "rails/info#index", internal: true });
  });

  this.routesReloader().runAfterLoadPaths = () => {
    this.routes().append(function () {
      this.get("/", { to: "rails/welcome#index", internal: true });
    });
  };
});

Finisher.initializer("set_routes_reloader_hook", async function (this: FinisherHost) {
  const reloader = this.routesReloader();
  reloader.eagerLoad = this.config.eagerLoad === true;
  this.reloaders.push(reloader);

  this.reloader.toRun(function (this: FinisherReloaderInstance) {
    this.requireUnloadLockBang();
    return reloader.execute().then(() => {
      runLoadHooks("after_routes_loaded", this);
    });
  });

  if (!(this.routes() instanceof LazyRouteSet) || this.config.eagerLoad === true) {
    await reloader.executeUnlessLoaded();
  }
});

/**
 * @missingRailsCall _autoloaded_tracked_classes — PERMANENT
 * @missingRailsCall clear — PERMANENT
 */
Finisher.initializer(
  "set_clear_dependencies_hook",
  { group: "all" },
  function (this: FinisherHost) {
    const callback = (): void => {};

    if (this.config.isReloadingEnabled()) {
      if (this.config.reloadClassesOnlyOnChange) {
        this.reloader.check = () => {
          return this.reloaders
            .map((r) => (r as { isUpdated(): boolean }).isUpdated())
            .some((u) => u);
        };
      } else {
        this.reloader.check = () => true;
      }
    } else {
      this.reloader.check = () => false;
    }

    if (this.config.isReloadingEnabled()) {
      if (this.config.reloadClassesOnlyOnChange) {
        const FileWatcher = this.config.fileWatcher as new (
          files: string[],
          dirs: Record<string, string[]>,
          block: () => void,
        ) => { execute(): Promise<void> };
        const reloader = new FileWatcher(...this.watchableArgs(), callback);
        this.reloaders.push(reloader);

        this.reloader.toRun(
          function (this: FinisherReloaderInstance) {
            return this.classUnloadBang(() => {
              return reloader.execute();
            });
          },
          { prepend: true },
        );
      } else {
        this.reloader.toComplete(function (this: FinisherReloaderInstance) {
          return this.classUnloadBang(callback);
        });
      }
    } else {
      DescendantsTracker.disableClearBang();
    }
  },
);

/** @noRailsEquivalent PERMANENT */
async function loadControllers(paths: Root): Promise<Map<string, DispatchableControllerClass>> {
  const out = new Map<string, DispatchableControllerClass>();
  const node = paths.get("app/controllers");
  if (!node) return out;

  for (const dir of await node.existentDirectories()) {
    await collectControllers(dir, "", out);
  }
  return out;
}

/** @internal */
async function collectControllers(
  dir: string,
  prefix: string,
  out: Map<string, DispatchableControllerClass>,
): Promise<void> {
  const fs = getFs();
  const p = getPath();
  if (!fs.readdir || !fs.stat || !p.pathToFileURL) return;

  for (const entry of await fs.readdir(dir)) {
    const full = p.join(dir, entry);
    if ((await fs.stat(full)).isDirectory()) {
      await collectControllers(full, `${prefix}${underscore(entry.replace(/-/g, "_"))}/`, out);
      continue;
    }
    const match = entry.match(/^(.+)[-_]controller\.(?:ts|js)$/);
    if (!match) continue;
    const mod = (await import(p.pathToFileURL(full).href)) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (typeof value === "function" && value.name.endsWith("Controller")) {
        const name = `${prefix}${underscore(match[1].replace(/-/g, "_"))}`;
        out.set(name, value as DispatchableControllerClass);
      }
    }
  }
}

const definedControllers = new WeakSet<object>();

/** @noRailsEquivalent PERMANENT */
async function defineController(klass: object): Promise<void> {
  const base = ActionController.Base;
  if (!((klass as { prototype: unknown }).prototype instanceof base)) return;

  const superclass = Object.getPrototypeOf(klass) as object;
  if (superclass !== base) await defineController(superclass);

  if (definedControllers.has(klass)) return;
  definedControllers.add(klass);
  await ActionController.Railties.Helpers.inherited(
    klass as ActionController.HelpersPathControllerClass,
  );
}

/** @noRailsEquivalent PERMANENT */
async function loadJobs(paths: Root): Promise<void> {
  const node = paths.get("app");
  if (!node) return;

  const p = getPath();
  for (const dir of await node.existentDirectories()) {
    if (p.basename(dir) === "jobs") await collectJobs(dir, "");
  }
}

/** @internal */
async function collectJobs(dir: string, prefix: string): Promise<void> {
  const fs = getFs();
  const p = getPath();
  for (const entry of await fs.readdir!(dir)) {
    const full = p.join(dir, entry);
    if ((await fs.stat!(full)).isDirectory()) {
      await collectJobs(full, `${prefix}${camelize(underscore(entry.replace(/-/g, "_")))}::`);
      continue;
    }
    const match = entry.match(/^(.+)\.(?:ts|js)$/);
    if (!match || /\.d\.ts$/.test(entry)) continue;
    const mod = (await import(p.pathToFileURL!(full).href)) as Record<string, unknown>;
    const cname = camelize(underscore(match[1].replace(/-/g, "_")));
    const value = mod[cname];
    if (typeof value === "function" && value.prototype instanceof JobBase) {
      registerConstant(`${prefix}${cname}`, value);
    }
  }
}

/** @noRailsEquivalent PERMANENT */
async function loadModels(paths: Root): Promise<(typeof Base)[]> {
  const out: (typeof Base)[] = [];
  const node = paths.get("app/models");
  if (!node) return out;

  for (const dir of await node.existentDirectories()) {
    await collectModels(dir, true, out);
  }
  return out;
}

/** @internal */
async function collectModels(dir: string, root: boolean, out: (typeof Base)[]): Promise<void> {
  const fs = getFs();
  const p = getPath();
  if (!fs.readdir || !fs.stat || !p.pathToFileURL) return;

  for (const entry of await fs.readdir(dir)) {
    const full = p.join(dir, entry);
    if ((await fs.stat(full)).isDirectory()) {
      if (root && entry === "concerns") continue;
      await collectModels(full, false, out);
      continue;
    }
    if (!/\.(?:ts|js)$/.test(entry) || /\.d\.ts$/.test(entry)) continue;
    const mod = (await import(p.pathToFileURL(full).href)) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (
        typeof value === "function" &&
        value.prototype instanceof Base &&
        !out.includes(value as typeof Base)
      ) {
        out.push(value as typeof Base);
      }
    }
  }
}
