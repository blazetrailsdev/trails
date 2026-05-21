/**
 * Port of `Rails::Engine::Configuration` from
 * `railties/lib/rails/engine/configuration.rb`.
 *
 * Diverges from Rails:
 * - `tableNamePrefix` is an explicit option (replaces `isolate_namespace`).
 * - Constructing with a `null` root is allowed (matches 2.2a
 *   `Engine#paths()` tolerance); `Engine#paths()` injects the resolved
 *   root via `setRoot()` once known.
 * - `routeSetClass` is held as an opaque constructor; the real
 *   `ActionDispatch::Routing::RouteSet` wiring lands with PR 2.5.
 */
import { Configuration as RailtieConfiguration } from "../trailtie/configuration.js";
import { Root } from "../paths.js";

export type MiddlewareEntry = { name: string; args: unknown[] };
export type RouteSetCtor = new (config: EngineConfiguration) => unknown;

export class EngineConfiguration extends RailtieConfiguration {
  private _root: string | null;
  private _paths?: Root;

  middleware: MiddlewareEntry[] = [];
  javascriptPath = "javascript";
  routeSetClass: RouteSetCtor | null = null;
  defaultScope: Record<string, unknown> | null = null;
  tableNamePrefix: string | null = null;

  autoloadPaths: string[] = [];
  autoloadOncePaths: string[] = [];
  eagerLoadPaths: string[] = [];

  private _generators: Record<string, unknown> = {};

  constructor(root: string | null = null) {
    super();
    this._root = root;
  }

  get root(): string | null {
    return this._root;
  }

  /** Mirrors Rails `root=`. Re-expands `paths.path` so downstream lookups
   * resolve against the new root. */
  setRoot(value: string | null): void {
    this._root = value;
    if (this._paths) this._paths.path = value;
  }

  paths(): Root {
    if (this._paths) return this._paths;
    const paths = new Root(this._root);
    paths.add("app", { glob: "{*,*/concerns}" });
    paths.add("app/assets", { glob: "*" });
    paths.add("app/controllers");
    paths.add("app/channels");
    paths.add("app/helpers");
    paths.add("app/models");
    paths.add("app/mailers");
    paths.add("app/views");
    paths.add("lib", { loadPath: true });
    paths.add("lib/assets", { glob: "*" });
    paths.add("lib/tasks", { glob: "**/*.{ts,js}" });
    paths.add("config");
    paths.add("config/initializers", { glob: "**/*.{ts,js}" });
    paths.add("config/locales", { glob: "**/*.{ts,js,json}" });
    paths.add("config/routes.ts");
    paths.add("config/routes", { glob: "**/*.{ts,js}" });
    paths.add("db");
    paths.add("db/migrate");
    paths.add("db/seeds.ts");
    paths.add("vendor", { loadPath: true });
    paths.add("vendor/assets", { glob: "*" });
    this._paths = paths;
    return paths;
  }

  /** Mirrors Rails `config.generators { |g| ... }` — yields a mutable
   * options bag. Returns the bag for chained reads. */
  generators(block?: (g: Record<string, unknown>) => void): Record<string, unknown> {
    if (block) block(this._generators);
    return this._generators;
  }

  /** @internal */
  allAutoloadPaths(): string[] {
    return [...this.autoloadPaths];
  }
  /** @internal */
  allAutoloadOncePaths(): string[] {
    return [...this.autoloadOncePaths];
  }
  /** @internal */
  allEagerLoadPaths(): string[] {
    return [...this.eagerLoadPaths];
  }
}
