import {
  Dependencies,
  DescendantsTracker,
  runLoadHooks,
  TopLevel,
  type ExecutionHook,
} from "@blazetrails/activesupport";
import { Base as JobBase, registerJob } from "@blazetrails/activejob";
import {
  File,
  getFs,
  getPath,
  isRegisteredConstant,
  Monitor,
  registerConstant,
} from "@blazetrails/ruby-compat";
import type { Autoloaders } from "../autoloaders.js";
import { Initializable } from "../initializable.js";
import { Trails } from "../rails.js";
import { LazyRouteSet } from "../engine/lazy-route-set.js";
import type { Root } from "../paths.js";
import type { ConfigurationBlock } from "../trailtie/configuration.js";
import type { DrawCallback } from "@blazetrails/actionpack";
import { ActionController, registerController } from "@blazetrails/actionpack";
import { Base, registerModel } from "@blazetrails/activerecord";
import { Inflector } from "../autoloaders/inflector.js";

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

export interface FinisherExecutor {
  registerHook(hook: ExecutionHook, options?: { outer?: boolean }): void;
}

export interface FinisherConfig {
  root: string | null;
  allowConcurrency: boolean | "unsafe" | null;
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
  autoloaders: Autoloaders;
  readonly constructor: { name: string };
  readonly railtieName: string;
  routes(): FinisherRoutes;
  executor: FinisherExecutor;
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
  const autoloader = this.autoloaders.main;
  autoloader.manifestRoot ??= this.config.root;

  const alreadyConfiguredDirs = new Set(autoloader.dirs() as readonly string[]);

  Object.freeze(Dependencies.autoloadPaths);
  for (const path of new Set(Dependencies.autoloadPaths)) {
    if (!(await File.isDirectoryAsync(path))) continue;
    if (alreadyConfiguredDirs.has(path)) continue;

    await autoloader.pushDir(path);
    if (!Dependencies.isEagerLoad(path)) autoloader.doNotEagerLoad(path);
  }

  if (this.config.isReloadingEnabled()) {
    autoloader.enableReloading();
    Dependencies.autoloader = autoloader;
  }

  autoloader.onLoad(_registerAutoloaded);
  await autoloader.setup();
  await autoloader.eagerLoad();

  await loadControllers(this.paths());
  await loadModels(this.paths());
  await loadJobs(this.paths());
  await loadChannels(this.paths());
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
 * @missingRailsCall eager_load_all — CONVERGEABLE trailties-app-scan-retires
 * @missingRailsCall eager_load! — CONVERGEABLE trailties-app-scan-retires
 * @missingRailsCall after_class_unload — CONVERGEABLE trailties-reload-drives-zeitwerk
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

export class MonitorHook {
  private monitor: Monitor;

  constructor(monitor: Monitor = new Monitor()) {
    this.monitor = monitor;
  }

  run(): unknown {
    return this.monitor.enter();
  }

  complete(_state: unknown): void {
    this.monitor.exit();
  }
}

export const InterlockHook = {
  run(): unknown {
    return Dependencies.interlock.startRunning();
  },

  complete(_state: unknown): unknown {
    return Dependencies.interlock.doneRunning();
  },
};

Finisher.initializer("configure_executor_for_concurrency", function (this: FinisherHost) {
  if (this.config.allowConcurrency === false) {
    this.executor.registerHook(new MonitorHook(), { outer: true });
  } else if (this.config.allowConcurrency === "unsafe") {
    return;
  } else {
    if (this.config.isReloadingEnabled()) {
      this.executor.registerHook(InterlockHook, { outer: true });
    }
  }
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
 * @missingRailsCall _autoloaded_tracked_classes — CONVERGEABLE trailties-reload-drives-zeitwerk
 * @missingRailsCall clear — CONVERGEABLE trailties-reload-drives-zeitwerk
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

export async function _registerAutoloaded(cpath: unknown, value: unknown): Promise<void> {
  if (typeof value !== "function") return;
  const cname = cpath as string;
  if (value.prototype instanceof ActionController.Metal) {
    registerController(cname, value as typeof ActionController.Metal);
  } else if (value.prototype instanceof Base) {
    registerModel(cname, value as typeof Base);
  } else if (value.prototype instanceof JobBase) {
    registerJob(cname, value as typeof JobBase);
  } else if (TopLevel.ActionCable != null) {
    const { ActionCable, registerChannel, registerConnection } =
      await import("@blazetrails/actioncable");
    if (value.prototype instanceof ActionCable.Channel.Base) {
      registerChannel(cname, value as typeof ActionCable.Channel.Base);
    } else if (value.prototype instanceof ActionCable.Connection.Base) {
      registerConnection(cname, value as typeof ActionCable.Connection.Base);
    }
  }
}

/** @noRailsEquivalent PERMANENT */
async function loadControllers(paths: Root): Promise<void> {
  for (const [prefix, klass] of await loadAppClasses(
    paths,
    "controllers",
    ActionController.Metal,
  )) {
    if (prefix) registerController(`${prefix}${klass.name}`, klass);
    else registerController(klass);
    await defineController(klass);
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
  for (const [prefix, klass] of await loadAppClasses(paths, "jobs", JobBase)) {
    if (prefix) registerJob(`${prefix}${klass.name}`, klass);
    else registerJob(klass);
  }
}

/** @noRailsEquivalent PERMANENT */
async function loadChannels(paths: Root): Promise<void> {
  if (TopLevel.ActionCable == null) return;

  const { ActionCable, registerChannel, registerConnection } =
    await import("@blazetrails/actioncable");
  for (const [prefix, klass] of await loadAppClasses(paths, "channels", ActionCable.Channel.Base)) {
    if (prefix) registerChannel(`${prefix}${klass.name}`, klass);
    else registerChannel(klass);
  }
  for (const [prefix, klass] of await loadAppClasses(
    paths,
    "channels",
    ActionCable.Connection.Base,
  )) {
    if (prefix) registerConnection(`${prefix}${klass.name}`, klass);
    else registerConnection(klass);
  }
}

/** @internal */
async function loadAppClasses<T extends abstract new (...args: never[]) => unknown>(
  paths: Root,
  root: string,
  base: T,
): Promise<[string, T][]> {
  const out: [string, T][] = [];
  const node = paths.get("app");
  if (!node) return out;

  const p = getPath();
  for (const dir of await node.existentDirectories()) {
    if (p.basename(dir) === root) await collectAppClasses(dir, "", base, out);
  }
  return out;
}

/** @internal */
async function collectAppClasses<T extends abstract new (...args: never[]) => unknown>(
  dir: string,
  prefix: string,
  base: T,
  out: [string, T][],
): Promise<void> {
  const fs = getFs();
  const p = getPath();
  for (const entry of await fs.readdir!(dir)) {
    const full = p.join(dir, entry);
    if ((await fs.stat!(full)).isDirectory()) {
      const namespace = `${prefix}${Inflector.camelize(entry.replace(/-/g, "_"), full)}`;
      if (!isRegisteredConstant(namespace)) registerConstant(namespace, {});
      await collectAppClasses(full, `${namespace}::`, base, out);
      continue;
    }
    if (!/\.(?:ts|js)$/.test(entry) || /\.d\.ts$/.test(entry)) continue;
    const mod = (await import(p.pathToFileURL!(full).href)) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (
        typeof value === "function" &&
        value.prototype instanceof base &&
        !out.some(([, klass]) => klass === value)
      ) {
        out.push([prefix, value as T]);
      }
    }
  }
}

/** @noRailsEquivalent PERMANENT */
async function loadModels(paths: Root): Promise<void> {
  const node = paths.get("app/models");
  if (!node) return;

  const out: [string, typeof Base][] = [];
  for (const dir of await node.existentDirectories()) {
    await collectModels(dir, "", out);
  }
  for (const [prefix, model] of out) {
    if (prefix) registerModel(`${prefix}${model.name}`, model);
    else registerModel(model);
  }
}

/** @internal */
async function collectModels(
  dir: string,
  prefix: string,
  out: [string, typeof Base][],
): Promise<void> {
  const fs = getFs();
  const p = getPath();
  if (!fs.readdir || !fs.stat || !p.pathToFileURL) return;

  for (const entry of await fs.readdir(dir)) {
    const full = p.join(dir, entry);
    if ((await fs.stat(full)).isDirectory()) {
      if (prefix === "" && entry === "concerns") continue;
      const namespace = `${prefix}${Inflector.camelize(entry.replace(/-/g, "_"), full)}`;
      if (!isRegisteredConstant(namespace)) registerConstant(namespace, {});
      await collectModels(full, `${namespace}::`, out);
      continue;
    }
    if (!/\.(?:ts|js)$/.test(entry) || /\.d\.ts$/.test(entry)) continue;
    const mod = (await import(p.pathToFileURL(full).href)) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (
        typeof value === "function" &&
        value.prototype instanceof Base &&
        !out.some(([, model]) => model === value)
      ) {
        out.push([prefix, value as typeof Base]);
      }
    }
  }
}
