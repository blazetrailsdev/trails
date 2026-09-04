import { RouteSet, type MiddlewareStack } from "@blazetrails/actionpack";
import { File } from "@blazetrails/ruby-compat";
import { Configuration as RailtieConfiguration } from "../trailtie/configuration.js";
import { Root } from "../paths.js";
import { MiddlewareStackProxy } from "../configuration.js";
import { resolveEnv } from "../database.js";

export type RouteSetClass = { newWithConfig(config: EngineConfiguration): RouteSet };

export class EngineConfiguration extends RailtieConfiguration {
  private _root: string | null;
  private _paths?: Root;

  middleware: MiddlewareStackProxy | MiddlewareStack = new MiddlewareStackProxy();
  javascriptPath = "javascript";
  routeSetClass: RouteSetClass = RouteSet;
  defaultScope: Record<string, unknown> | null = null;
  tableNamePrefix: string | null = null;

  autoloadPaths: string[] = [];
  autoloadOncePaths: string[] = [];
  eagerLoadPaths: string[] = [];

  private _generators: Record<string, unknown> = { templates: [] };

  constructor(root: string | null = null) {
    super();
    this._root = root;
  }

  get root(): string | null {
    return this._root;
  }

  /**
   * @missingRailsCall new — PERMANENT
   * @missingRailsArgs expand_path — PERMANENT
   */
  setRoot(value: string | null): void {
    const expanded = value === null ? null : File.expandPath(value);
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

  generators(block?: (g: Record<string, unknown>) => void): Record<string, unknown> {
    if (block) block(this._generators);
    return this._generators;
  }

  async allAutoloadPaths(): Promise<string[]> {
    return [...this.autoloadPaths, ...(await this.paths().autoloadPaths())];
  }
  async allAutoloadOncePaths(): Promise<string[]> {
    return [...this.autoloadOncePaths, ...(await this.paths().autoloadOnce())];
  }
  async allEagerLoadPaths(): Promise<string[]> {
    return [...this.eagerLoadPaths, ...(await this.paths().eagerLoad())];
  }
}
