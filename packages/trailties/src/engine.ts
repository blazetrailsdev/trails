// Port of `Rails::Engine` from `railties/lib/rails/engine.rb`. Shell +
// EngineConfiguration + railties() collection. `lazy_route_set` + `updater`
// → 2.2c. `env_config`/`endpoint`/`call`/`helpers` → blocked on PR 2.5.
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";
import { Root } from "./paths.js";
import { Trailtie } from "./trailtie.js";
import { Trailties } from "./engine/trailties.js";
import { EngineConfiguration } from "./engine/configuration.js";
import { readOwnState, writeOwnState } from "./trailtie/per-class-state.js";

export class Engine extends Trailtie {
  private _railtiesCollection?: Trailties;
  private _allLoadPathsCache?: string[];
  private _routes?: unknown;

  static calledFrom(value?: string): string | undefined {
    if (value !== undefined) writeOwnState(this, "_calledFrom", value);
    return readOwnState<string>(this, "_calledFrom");
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
      const engine = klass.instance() as Engine;
      const root = await engine.root().catch(() => undefined);
      if (root && (await realpathOr(fs, p.resolve(root))) === expanded) return engine;
    }
    return undefined;
  }

  static async findRootWithFlag(
    flag: string,
    rootPath: string | undefined,
    fallback?: string,
  ): Promise<string> {
    const p = await getPathAsync();
    const fs = await getFsAsync();
    let cur = rootPath;
    while (cur && (await isDirectory(fs, cur)) && !(await fs.exists(p.join(cur, flag)))) {
      const parent = p.dirname(cur);
      cur = parent !== cur ? parent : undefined;
    }
    const found = cur && (await fs.exists(p.join(cur, flag))) ? cur : fallback;
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

  /** Returns the resolved root, or undefined when `calledFrom` is unset.
   * Diverges from Rails (which raises) so consumers can construct an
   * Engine before its source location is known — matches PR 2.2a. */
  async root(): Promise<string | undefined> {
    const klass = this.constructor as typeof Engine;
    const from = klass.calledFrom();
    return from === undefined ? undefined : await klass.findRoot(from);
  }

  /** Mirrors `Engine#config` — overrides `Trailtie#config` to return
   * an `EngineConfiguration` so `middleware`, `paths`, `tableNamePrefix`,
   * etc. are reachable through the single `config` surface. */
  override get config(): EngineConfiguration {
    if (!(this._config instanceof EngineConfiguration))
      this._config = new EngineConfiguration(null);
    return this._config as EngineConfiguration;
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
    if (cfg.root === null) {
      const resolved = await this.root();
      if (resolved !== undefined) cfg.setRoot(resolved);
    }
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

  /** `Engine#routes(&block)` — undefined when no `routeSetClass` is set. */
  routes(block?: (this: unknown) => void): unknown {
    if (!this._routes) {
      const cfg = this.config;
      if (!cfg.routeSetClass) return undefined;
      this._routes = new cfg.routeSetClass(cfg);
    }
    const r = this._routes as { append?: (b: (this: unknown) => void) => void };
    if (block) r.append?.(block);
    return this._routes;
  }
  hasRoutes(): boolean {
    return this._routes !== undefined;
  }

  /** @internal Rails `_all_load_paths(add_autoload_paths_to_load_path)`. */
  async allLoadPaths(addAutoloadPathsToLoadPath = true): Promise<string[]> {
    if (this._allLoadPathsCache) return this._allLoadPathsCache;
    const paths = await this.paths();
    const cfg = this.config;
    const out = [...(await paths.loadPaths())];
    if (addAutoloadPathsToLoadPath) {
      for (const p of cfg.allAutoloadPaths()) out.push(p);
      for (const p of cfg.allAutoloadOncePaths()) out.push(p);
    }
    this._allLoadPathsCache = Array.from(new Set(out));
    return this._allLoadPathsCache;
  }
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
