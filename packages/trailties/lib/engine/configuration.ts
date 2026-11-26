import { RouteSet, type MiddlewareStack } from "@blazetrails/actionpack";
import { Pathname } from "@blazetrails/ruby-compat/pathname";
import { Configuration as RailtieConfiguration } from "../trailtie/configuration.js";
import { Root } from "../paths.js";
import { Generators, MiddlewareStackProxy } from "../configuration.js";
import { resolveEnv } from "../database.js";

export type RouteSetClass = { newWithConfig(config: Configuration): RouteSet };

export class Configuration extends RailtieConfiguration {
  private _root: Pathname | null;
  protected _paths?: Root;
  private _generators?: Generators;

  middleware: MiddlewareStackProxy | MiddlewareStack = new MiddlewareStackProxy();
  javascriptPath = "javascript";
  routeSetClass: RouteSetClass = RouteSet;
  defaultScope: Record<string, unknown> | null = null;
  tableNamePrefix: string | null = null;

  autoloadPaths: string[] = [];
  autoloadOncePaths: string[] = [];
  eagerLoadPaths: string[] = [];

  constructor(root: Pathname | null = null) {
    super();
    this._root = root;
    this._generators = this.appGenerators().dup();
  }

  get root(): Pathname | null {
    return this._root;
  }

  setRoot(value: string | Pathname | null): void {
    this._root = value === null ? null : new Pathname(value).expandPath();
    if (this._paths) this._paths.path = this._root;
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
    paths.add("lib/tasks", { glob: "**/*.rake.{ts,js}" });
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

  generators(block?: (g: Generators) => void): Generators {
    this._generators ??= new Generators();
    if (block) block(this._generators);
    return this._generators;
  }

  async allAutoloadPaths(): Promise<string[]> {
    return [...this.autoloadPaths, ...this.paths().autoloadPaths()];
  }
  async allAutoloadOncePaths(): Promise<string[]> {
    return [...this.autoloadOncePaths, ...this.paths().autoloadOnce()];
  }
  async allEagerLoadPaths(): Promise<string[]> {
    return [...this.eagerLoadPaths, ...this.paths().eagerLoad()];
  }
}
