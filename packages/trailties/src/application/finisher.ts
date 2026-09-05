import { runLoadHooks, underscore } from "@blazetrails/activesupport";
import { getFs, getPath } from "@blazetrails/ruby-compat";
import { Initializable } from "../initializable.js";
import { Trails } from "../rails.js";
import { LazyRouteSet } from "../engine/lazy-route-set.js";
import type { Root } from "../paths.js";
import type { ConfigurationBlock } from "../trailtie/configuration.js";
import type { DrawCallback } from "@blazetrails/actionpack";
import { controllerConstants, type DispatchableControllerClass } from "@blazetrails/actionpack";

export interface FinisherRoutes {
  prepend(block: DrawCallback): void;
  append(block: DrawCallback): void;
  defineMountedHelper(name: string): void;
}

export interface FinisherReloaderInstance {
  requireUnloadLockBang(): void;
}

export interface FinisherReloader {
  toPrepare(block: ConfigurationBlock): void;
  toRun(block: (this: FinisherReloaderInstance) => unknown): void;
  prepareBang(): void;
}

export interface FinisherConfig {
  toPrepareBlocks: ConfigurationBlock[];
  eagerLoad: boolean | null;
  eagerLoadNamespaces: unknown[];
  sessionStoreQ(): unknown;
  sessionStore(newSessionStore?: unknown, options?: Record<string, unknown>): unknown;
}

export interface FinisherRoutesReloader {
  eagerLoad: boolean;
  runAfterLoadPaths: () => void | Promise<void>;
  execute(): Promise<void>;
  executeUnlessLoaded(application: unknown): Promise<boolean>;
}

export interface FinisherHost {
  config: FinisherConfig;
  readonly constructor: { name: string };
  readonly railtieName: string;
  routes(): FinisherRoutes;
  reloader: FinisherReloader;
  readonly reloaders: unknown[];
  routesReloader(): FinisherRoutesReloader;
  paths(): Promise<Root>;
  ensureGeneratorTemplatesAdded(): Promise<void>;
  buildMiddlewareStack(): void;
}

export class Finisher extends Initializable {}

Finisher.initializer("add_generator_templates", async function (this: FinisherHost) {
  await this.ensureGeneratorTemplatesAdded();
});

Finisher.initializer("setup_main_autoloader", async function (this: FinisherHost) {
  for (const [name, klass] of await loadControllers(await this.paths())) {
    controllerConstants.set(name, klass);
  }
});

Finisher.initializer(
  "setup_default_session_store",
  { before: "build_middleware_stack" },
  function (this: FinisherHost) {
    if (this.config.sessionStoreQ() == null) {
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
 * @missingRailsCall eager_load_all — CONVERGEABLE port-eager-load-autoloader-arms
 * @missingRailsCall eager_load! — CONVERGEABLE port-eager-load-autoloader-arms
 * @missingRailsCall after_class_unload — CONVERGEABLE port-eager-load-autoloader-arms
 */
Finisher.initializer("eager_load!", function (this: FinisherHost) {
  if (this.config.eagerLoad === true) {
    runLoadHooks("before_eager_load", this);
    for (const namespace of this.config.eagerLoadNamespaces) {
      (namespace as { eagerLoadBang(): void }).eagerLoadBang();
    }
  }
});

Finisher.initializer("finisher_hook", function (this: FinisherHost) {
  runLoadHooks("after_initialize", this);
});

Finisher.initializer("add_internal_routes", function (this: FinisherHost) {
  if (!(Trails.env as unknown as Record<string, () => boolean>)["development?"]()) return;
  this.routes().prepend((mapper) => {
    mapper.get("/rails/info/properties", { to: "rails/info#properties", internal: true });
    mapper.get("/rails/info/routes", { to: "rails/info#routes", internal: true });
    mapper.get("/rails/info/notes", { to: "rails/info#notes", internal: true });
    mapper.get("/rails/info", { to: "rails/info#index", internal: true });
  });

  this.routesReloader().runAfterLoadPaths = () => {
    this.routes().append((mapper) => {
      mapper.get("/", { to: "rails/welcome#index", internal: true });
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
    await reloader.executeUnlessLoaded(this);
  }
});

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
