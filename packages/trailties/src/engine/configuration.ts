/**
 * Port of `Rails::Engine::Configuration` from
 * `railties/lib/rails/engine/configuration.rb`.
 *
 * Diverges from Rails:
 * - `tableNamePrefix` is an explicit option (replaces `isolate_namespace`).
 * - Constructing with a `null` root is allowed (matches 2.2a
 *   `Engine#paths()` tolerance); `Engine#paths()` injects the resolved
 *   root via `setRoot()` once known.
 */
import { MiddlewareStack, RouteSet } from "@blazetrails/actionpack";
import { getFs, getPath } from "@blazetrails/activesupport";
import { Configuration as RailtieConfiguration } from "../trailtie/configuration.js";
import { Root } from "../paths.js";
import { resolveEnv } from "../database.js";

/** Mirrors `config.route_set_class` (`engine/configuration.rb:47`) — the
 * class is used through its `new_with_config` factory. */
export type RouteSetClass = { newWithConfig(config: EngineConfiguration): RouteSet };

export class EngineConfiguration extends RailtieConfiguration {
  private _root: string | null;
  private _paths?: Root;

  middleware: MiddlewareStack = new MiddlewareStack();
  javascriptPath = "javascript";
  routeSetClass: RouteSetClass = RouteSet;
  defaultScope: Record<string, unknown> | null = null;
  tableNamePrefix: string | null = null;

  autoloadPaths: string[] = [];
  autoloadOncePaths: string[] = [];
  eagerLoadPaths: string[] = [];

  /** Rails seeds `Rails::Configuration::Generators` with an empty
   * `templates` array (`rails/configuration.rb:112`). */
  private _generators: Record<string, unknown> = { templates: [] };

  constructor(root: string | null = null) {
    super();
    this._root = root;
  }

  get root(): string | null {
    return this._root;
  }

  /** Mirrors Rails `root=` (`@root = paths.path = Pathname.new(value).expand_path`):
   * the override is expanded against the working directory before it is stored,
   * so a relative value resolves to an absolute root. `null` (clear) is left
   * as-is. Re-points `paths.path` so downstream lookups resolve against it.
   *
   * @missingRailsCall new — PERMANENT: the dropped call is `Pathname.new`
   * (`engine/configuration.rb:115-117`). `Pathname` is a Ruby stdlib class with
   * no trails counterpart — no package defines one — so there is no receiver to
   * construct; `getPath().resolve` against the working directory is what
   * `Pathname#expand_path` answers. */
  setRoot(value: string | null): void {
    const expanded = value === null ? null : getPath().resolve(getFs().cwd(), value);
    this._root = expanded;
    if (this._paths) this._paths.path = expanded;
  }

  paths(): Root {
    if (this._paths) return this._paths;
    const paths = new Root(this._root);
    paths.add("app", {
      eagerLoad: true,
      glob: "{*,*/concerns}",
      exclude: ["assets", this.javascriptPath],
    });
    paths.add("app/assets", { glob: "*" });
    paths.add("app/controllers", { eagerLoad: true });
    paths.add("app/channels", { eagerLoad: true });
    paths.add("app/helpers", { eagerLoad: true });
    paths.add("app/models", { eagerLoad: true });
    paths.add("app/mailers", { eagerLoad: true });
    paths.add("app/views");
    paths.add("lib", { loadPath: true });
    paths.add("lib/assets", { glob: "*" });
    paths.add("lib/tasks", { glob: "**/*.{ts,js}" });
    paths.add("config");
    // `Trails.env` (engine/configuration.rb:96) would close a module cycle over
    // `class Application extends Engine`; `resolveEnv()` is the env source it
    // itself delegates to (`rails.ts:88`).
    paths.add("config/environments", { glob: `${resolveEnv()}.{ts,js}` });
    paths.add("config/initializers", { glob: "**/*.{ts,js}" });
    paths.add("config/locales", { glob: "**/*.{ts,js,json}" });
    paths.add("config/routes.ts");
    paths.add("config/routes", { glob: "**/*.{ts,js}" });
    paths.add("db");
    paths.add("db/migrate");
    paths.add("db/seeds.ts");
    paths.add("vendor", { loadPath: true });
    paths.add("vendor/assets", { glob: "*" });
    paths.add("test/mailers/previews", { autoload: true });
    this._paths = paths;
    return paths;
  }

  /** Mirrors Rails `config.generators { |g| ... }` — yields a mutable
   * options bag. Returns the bag for chained reads. */
  generators(block?: (g: Record<string, unknown>) => void): Record<string, unknown> {
    if (block) block(this._generators);
    return this._generators;
  }

  /** Mirrors Rails `all_autoload_paths` (engine/configuration.rb:121-125):
   * `autoload_paths + paths.autoload_paths`. Async because trails'
   * `Paths::Root#autoloadPaths` resolves existent paths via async fs. */
  async allAutoloadPaths(): Promise<string[]> {
    return [...this.autoloadPaths, ...(await this.paths().autoloadPaths())];
  }
  /** Mirrors Rails `all_autoload_once_paths` (engine/configuration.rb:127-131):
   * `autoload_once_paths + paths.autoload_once`. Async because trails'
   * `Paths::Root#autoloadOnce` resolves existent paths via async fs. */
  async allAutoloadOncePaths(): Promise<string[]> {
    return [...this.autoloadOncePaths, ...(await this.paths().autoloadOnce())];
  }
  /** Mirrors Rails `all_eager_load_paths` (engine/configuration.rb:133-135):
   * `eager_load_paths + paths.eager_load`. Async because trails'
   * `Paths::Root#eagerLoad` resolves existent paths via async fs. */
  async allEagerLoadPaths(): Promise<string[]> {
    return [...this.eagerLoadPaths, ...(await this.paths().eagerLoad())];
  }
}
