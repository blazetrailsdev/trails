import {
  Callbacks as ASCallbacks,
  defineCallbacks,
  extend,
  include,
  Notifications,
  onLoad,
  type Extended,
  type Included,
} from "@blazetrails/activesupport";
import { File, getFs, getPath } from "@blazetrails/ruby-compat";
import type { DrawCallback, RackApp, RackAppObject, RouteSet } from "@blazetrails/actionpack";
import { Root } from "./paths.js";
import type { RouteSetLike } from "./application/routes-reloader.js";
import { Trailtie } from "./trailtie.js";
import { setRubyClassPath } from "./ruby-class-path-slot.js";
import { Trailties } from "./engine/trailties.js";
import { EngineConfiguration } from "./engine/configuration.js";
import type { MiddlewareStackProxy } from "./configuration.js";
import { LazyRouteSet } from "./engine/lazy-route-set.js";
import { _Trails } from "./trails-slot.js";
import { readOwnState, writeOwnState } from "./trailtie/per-class-state.js";

export class Engine extends Trailtie {
  declare static setCallback: Extended<typeof ASCallbacks.ClassMethods>["setCallback"];
  declare runCallbacks: Included<typeof ASCallbacks.InstanceMethods>["runCallbacks"];

  private _railtiesCollection?: Trailties;
  private _allLoadPathsCache?: string[];
  private _routes?: RouteSet;

  static calledFrom(value?: string): string | undefined {
    if (value !== undefined) writeOwnState(this, "_calledFrom", value);
    return readOwnState<string>(this, "_calledFrom");
  }
  static endpoint(endpoint?: RackApp | RackAppObject): RackApp | RackAppObject | undefined {
    if (endpoint) writeOwnState(this, "_endpoint", endpoint);
    return readOwnState<RackApp | RackAppObject>(this, "_endpoint");
  }

  static isolated(value?: boolean): boolean {
    if (value !== undefined) writeOwnState(this, "_isolated", value);
    return readOwnState<boolean>(this, "_isolated") === true;
  }

  static engineName(name?: string): string {
    return this.railtieName(name);
  }

  static engineSubclasses(): Array<typeof Engine> {
    return Trailtie.subclasses().filter((k): k is typeof Engine => k.prototype instanceof Engine);
  }

  static async find(path: string): Promise<Engine | undefined> {
    const p = getPath();
    const fs = getFs();
    const expanded = await realpathOr(fs, p.resolve(path));
    for (const klass of this.engineSubclasses()) {
      const engine = klass.instance();
      const root = await engine.root();
      if ((await realpathOr(fs, p.resolve(root))) === expanded) return engine;
    }
    return undefined;
  }

  /** @internal */
  static async findRootWithFlag(
    flag: string,
    rootPath: string | undefined,
    defaultValue?: string,
  ): Promise<string> {
    while (rootPath && File.isDirectory(rootPath) && !File.isExist(`${rootPath}/${flag}`)) {
      const parent = File.dirname(rootPath);
      rootPath = parent !== rootPath ? parent : undefined;
    }
    const root = rootPath && File.isExist(`${rootPath}/${flag}`) ? rootPath : defaultValue;
    if (!root) throw new Error(`Could not find root path for ${this.name}`);
    return File.realpath(root);
  }

  static findRoot(from: string): Promise<string> {
    return this.findRootWithFlag("lib", from);
  }

  engineName(): string {
    return (this.constructor as typeof Engine).engineName();
  }
  isolated(): boolean {
    return (this.constructor as typeof Engine).isolated();
  }

  async root(): Promise<string> {
    const klass = this.constructor as typeof Engine;
    return await klass.findRoot(klass.calledFrom() as string);
  }

  override get config(): EngineConfiguration {
    const cfg = this._config;
    if (cfg instanceof EngineConfiguration) return cfg;
    const newCfg = new EngineConfiguration(null);
    this._config = newCfg;
    return newCfg;
  }

  tableNamePrefix(): string | null {
    return this.config.tableNamePrefix ?? this.defaultTableNamePrefix();
  }

  private defaultTableNamePrefix(): string | null {
    return this.isolated() ? `${this.engineName()}_` : null;
  }

  async paths(): Promise<Root> {
    const cfg = this.config;
    if (cfg.root === null) cfg.setRoot(await this.root());
    return cfg.paths();
  }

  async helpersPaths(): Promise<string[]> {
    const node = (await this.paths()).get("app/helpers");
    return node ? await node.existent() : [];
  }

  railties(): Trailties {
    if (!this._railtiesCollection) this._railtiesCollection = new Trailties();
    return this._railtiesCollection;
  }

  routes(block?: DrawCallback): RouteSet {
    this._routes ??= this.config.routeSetClass.newWithConfig(this.config);
    if (block) this._routes.append(block);
    return this._routes;
  }
  hasRoutes(): boolean {
    return this._routes !== undefined;
  }

  loadServer(app: unknown = this): this {
    this.runServerBlocks(app);
    return this;
  }

  endpoint(): RackApp | RackAppObject {
    return (this.constructor as typeof Engine).endpoint() ?? this.routes();
  }

  async loadConfigInitializer(initializer: string): Promise<void> {
    const { pathToFileURL } = getPath();
    await Notifications.instrumentAsync(
      "load_config_initializer.railties",
      { initializer },
      async () => {
        await import(pathToFileURL!(initializer).href);
      },
    );
  }

  async loadSeed(): Promise<void> {
    const seedFile = ((await (await this.paths()).get("db/seeds.ts")?.existent()) ?? [])[0];
    if (seedFile !== undefined) {
      const { pathToFileURL } = getPath();
      await this.runCallbacks("load_seed", async () => {
        await import(pathToFileURL!(seedFile).href);
      });
    }
  }

  /** @internal */
  buildMiddleware(): MiddlewareStackProxy {
    return this.config.middleware as MiddlewareStackProxy;
  }

  /** @internal */
  async _allLoadPaths(addAutoloadPathsToLoadPath = true): Promise<string[]> {
    if (this._allLoadPathsCache) return this._allLoadPathsCache;
    const paths = await this.paths();
    const cfg = this.config;
    const out = [...(await paths.loadPaths())];
    if (addAutoloadPathsToLoadPath) {
      for (const p of await cfg.allAutoloadPaths()) out.push(p);
      for (const p of await cfg.allAutoloadOncePaths()) out.push(p);
    }
    this._allLoadPathsCache = Array.from(new Set(out));
    return this._allLoadPathsCache;
  }
}

export interface EngineInitializerApp {
  config: { helpersPaths: string[] };
  routes(): { drawPaths: string[] };
  routesReloader(): {
    paths: string[];
    routeSets: RouteSetLike[];
    externalRoutes: string[];
  };
}

Engine.initializer(
  "load_environment_config",
  { before: "load_environment_hook", group: "all" },
  async function (this: Engine) {
    const { pathToFileURL } = getPath();
    for (const environment of (await (await this.paths()).get("config/environments")?.existent()) ??
      []) {
      await import(pathToFileURL!(environment).href);
    }
  },
);

Engine.initializer("make_routes_lazy", { before: "bootstrap_hook" }, function (this: Engine) {
  if (_Trails!.env.isLocal()) this.config.routeSetClass = LazyRouteSet;
});

Engine.initializer("add_routing_paths", async function (this: Engine, ...args: unknown[]) {
  const app = args[0] as EngineInitializerApp;
  const paths = await this.paths();
  const routingPaths = (await paths.get("config/routes.ts")?.existent()) ?? [];
  const externalPaths = paths.get("config/routes")?.toAry() ?? [];
  this.routes().drawPaths.push(...externalPaths);
  app.routes().drawPaths.push(...externalPaths);

  if (this.hasRoutes() || routingPaths.length > 0) {
    app.routesReloader().paths.unshift(...routingPaths);
    app.routesReloader().routeSets.push(this.routes());
    app.routesReloader().externalRoutes.unshift(...externalPaths);
  }
});

Engine.initializer("add_view_paths", async function (this: Engine) {
  const views = (await (await this.paths()).get("app/views")?.existent()) ?? [];
  if (views.length === 0) return;
  onLoad("action_controller", (base: ActionControllerBaseLike) => {
    if (typeof base.prependViewPath === "function") base.prependViewPath(views);
  });
});

Engine.initializer("prepend_helpers_path", async function (this: Engine, ...args: unknown[]) {
  const app = args[0] as EngineInitializerApp;
  if (!this.isolated() || (app as unknown) === this) {
    const helpers = (await (await this.paths()).get("app/helpers")?.existent()) ?? [];
    app.config.helpersPaths.unshift(...helpers);
  }
});

Engine.initializer("load_config_initializers", async function (this: Engine) {
  const existent = (await (await this.paths()).get("config/initializers")?.existent()) ?? [];
  for (const initializer of existent.sort()) {
    await this.loadConfigInitializer(initializer);
  }
});

Engine.initializer("wrap_reloader_around_load_seed", function (this: Engine, ...args: unknown[]) {
  const app = args[0] as EngineReloaderApp;
  (this.constructor as typeof Engine).setCallback(
    "load_seed",
    "around",
    (_engine: Engine, seedsBlock: () => void | Promise<void>) => app.reloader.wrap(seedsBlock),
  );
});

Engine.initializer("engines_blank_point", function () {});

/** @internal */
interface EngineReloaderApp {
  reloader: { wrap(block: () => void | Promise<void>): void | Promise<void> };
}

/** @internal */
interface ActionControllerBaseLike {
  prependViewPath?: (views: string[]) => void;
}

type Fs = ReturnType<typeof getFs>;
async function realpathOr(fs: Fs, p: string): Promise<string> {
  try {
    return fs.realpath ? await fs.realpath(p) : p;
  } catch {
    return p;
  }
}

setRubyClassPath(Engine, "Rails::Engine");

include(Engine, ASCallbacks.InstanceMethods);
extend(Engine, ASCallbacks.ClassMethods);
defineCallbacks(Engine.prototype, "load_seed");
