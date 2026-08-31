// Port of `Rails::Engine` from `railties/lib/rails/engine.rb`. Shell +
// EngineConfiguration + railties() collection. `lazy_route_set` + `updater`
// → 2.2c. `env_config`/`call`/`helpers` → blocked on PR 2.5.
import { getFsAsync, getPathAsync, onLoad } from "@blazetrails/activesupport";
import type { DrawCallback, RackApp, RackAppObject, RouteSet } from "@blazetrails/actionpack";
import { ActionView } from "@blazetrails/actionpack";
import { Root } from "./paths.js";
import type { RouteSetLike } from "./application/routes-reloader.js";
import { Trailtie } from "./trailtie.js";
import { Trailties } from "./engine/trailties.js";
import { EngineConfiguration } from "./engine/configuration.js";
import { readOwnState, writeOwnState } from "./trailtie/per-class-state.js";

export class Engine extends Trailtie {
  private _railtiesCollection?: Trailties;
  private _allLoadPathsCache?: string[];
  private _routes?: RouteSet;

  static calledFrom(value?: string): string | undefined {
    if (value !== undefined) writeOwnState(this, "_calledFrom", value);
    return readOwnState<string>(this, "_calledFrom");
  }
  /**
   * Mirrors `Engine.endpoint(endpoint = nil)` (`engine.rb:379-383`) — a
   * plain `@endpoint` ivar on the singleton, so it is own-state per class
   * and never inherited.
   */
  static endpoint(endpoint?: RackApp | RackAppObject): RackApp | RackAppObject | undefined {
    if (endpoint) writeOwnState(this, "_endpoint", endpoint);
    return readOwnState<RackApp | RackAppObject>(this, "_endpoint");
  }

  static isolated(value?: boolean): boolean {
    if (value !== undefined) writeOwnState(this, "_isolated", value);
    return readOwnState<boolean>(this, "_isolated") === true;
  }

  /** Mirrors Rails' `alias :engine_name :railtie_name`. */
  static engineName(name?: string): string {
    return this.railtieName(name);
  }

  static engineSubclasses(): Array<typeof Engine> {
    return Trailtie.subclasses().filter((k): k is typeof Engine => k.prototype instanceof Engine);
  }

  static async find(path: string): Promise<Engine | undefined> {
    const p = await getPathAsync();
    const fs = await getFsAsync();
    const expanded = await realpathOr(fs, p.resolve(path));
    for (const klass of this.engineSubclasses()) {
      const engine = klass.instance();
      const root = await engine.root();
      if ((await realpathOr(fs, p.resolve(root))) === expanded) return engine;
    }
    return undefined;
  }

  /**
   * `def self.find_root_with_flag` sits in Engine's `private` section and
   * carries `# :nodoc:` (`engine.rb:701`) — Ruby's `private` does not reach a
   * singleton method, but the `:nodoc:` keeps it out of the API reference all
   * the same.
   * @internal
   */
  static async findRootWithFlag(
    flag: string,
    rootPath: string | undefined,
    defaultValue?: string,
  ): Promise<string> {
    const p = await getPathAsync();
    const fs = await getFsAsync();
    while (
      rootPath &&
      (await isDirectory(fs, rootPath)) &&
      !(await fs.exists(p.join(rootPath, flag)))
    ) {
      const parent = p.dirname(rootPath);
      rootPath = parent !== rootPath ? parent : undefined;
    }
    const found = rootPath && (await fs.exists(p.join(rootPath, flag))) ? rootPath : defaultValue;
    if (!found) throw new Error(`Could not find root path for ${this.name}`);
    return await realpathOr(fs, found);
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

  /** Rails delegates `root` to `config` (`engine.rb:437`), whose root is
   * seeded from `find_root(called_from)` when the configuration is built
   * (`engine.rb:553`). Resolution is async here, so it happens on read — an
   * unset `calledFrom` reaches `find_root_with_flag` exactly as Ruby's nil
   * `called_from` does, and raises for an Engine (no default) while
   * `Application.findRoot`'s `cwd` default answers for an Application
   * (`application.rb:88-90`). */
  async root(): Promise<string> {
    const klass = this.constructor as typeof Engine;
    return await klass.findRoot(klass.calledFrom() as string);
  }

  /** Mirrors `Engine#config` — overrides `Trailtie#config` to return
   * an `EngineConfiguration` so `middleware`, `paths`, `tableNamePrefix`,
   * etc. are reachable through the single `config` surface. */
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

  /** Implicit fallback when `tableNamePrefix` is unset but `isolated` is on. */
  private defaultTableNamePrefix(): string | null {
    return this.isolated() ? `${this.engineName()}_` : null;
  }

  /** Mirrors `Engine#paths`. Resolves root before delegating to
   * `EngineConfiguration#paths` so the `Root` instance carries the
   * expanded root for subsequent `expanded`/`existent` calls. */
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

  /** Mirrors `Engine#routes(&block)` (`engine.rb:462-466`). */
  routes(block?: DrawCallback): RouteSet {
    this._routes ??= this.config.routeSetClass.newWithConfig(this.config);
    if (block) this._routes.append(block);
    return this._routes;
  }
  hasRoutes(): boolean {
    return this._routes !== undefined;
  }

  /**
   * Invoke the server registered hooks.
   * Check {@link Trailtie.server} for more info.
   *
   * Mirrors `Engine#load_server(app = self)` (`engine.rb:485-488`).
   */
  loadServer(app: unknown = this): this {
    this.runServerBlocks(app);
    return this;
  }

  /**
   * Returns the endpoint for this engine. If none is registered,
   * defaults to an `ActionDispatch::Routing::RouteSet`.
   *
   * Mirrors `Engine#endpoint` (`engine.rb:527-529`).
   */
  endpoint(): RackApp | RackAppObject {
    return (this.constructor as typeof Engine).endpoint() ?? this.routes();
  }

  /**
   * Mirrors: Rails `_all_load_paths(add_autoload_paths_to_load_path)` (engine.rb:730).
   *
   * @internal
   */
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

/**
 * The slice of `Rails::Application` the engine initializers below reach for
 * through their block argument (`initializer :add_routing_paths do |app|`).
 * Declared structurally so `engine.ts` keeps no import edge on
 * `application.ts`, which imports this file.
 */
export interface EngineInitializerApp {
  routes(): { drawPaths: string[] };
  routesReloader(): {
    paths: string[];
    routeSets: RouteSetLike[];
    externalRoutes: string[];
  };
}

/**
 * Mirrors `Engine`'s `add_routing_paths` initializer (`engine.rb:595-606`).
 *
 * Rails reads `paths["config/routes.rb"]`; the trails path set declares the
 * same entry under its TypeScript name (`engine/configuration.ts:84`).
 */
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

/**
 * Mirrors `Engine`'s `add_view_paths` initializer (`engine.rb:614-620`).
 *
 * Rails' `respond_to?(:prepend_view_path)` guard is live in trails:
 * `ActionController::Base` does not include `ActionView::ViewPaths` yet, so
 * the class-level `prependViewPath` is absent and the view paths are seeded
 * onto the `lookupContext` slot the renderer actually reads
 * (`action-controller/base.ts:177`). The `action_mailer` arm is dropped —
 * ActionMailer is not ported.
 */
Engine.initializer("add_view_paths", async function (this: Engine) {
  const views = (await (await this.paths()).get("app/views")?.existent()) ?? [];
  if (views.length === 0) return;
  onLoad("action_controller", (base: ActionControllerBaseLike) => {
    if (typeof base.prependViewPath === "function") {
      base.prependViewPath(views);
    } else {
      base.lookupContext = new ActionView.LookupContext(
        views.map((view) => new ActionView.FileSystemResolver(view)),
      );
    }
  });
});

/** @internal The `on_load(:action_controller)` receiver — see `add_view_paths`. */
interface ActionControllerBaseLike {
  prependViewPath?: (views: string[]) => void;
  lookupContext?: ActionView.LookupContext;
}

type Fs = Awaited<ReturnType<typeof getFsAsync>>;
async function isDirectory(fs: Fs, p: string): Promise<boolean> {
  if (!fs.stat) throw new Error("FsAdapter.stat() is required for trailties (async-only).");
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}
async function realpathOr(fs: Fs, p: string): Promise<string> {
  try {
    return fs.realpath ? await fs.realpath(p) : p;
  } catch {
    return p;
  }
}
