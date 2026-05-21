// Port of `Rails::Engine` from `railties/lib/rails/engine.rb`. Shell only:
// find / findRoot / findRootWithFlag, the paths defaults, and the railties()
// collection. EngineConfiguration + route mounting → 2.2b; lazy_route_set
// + updater → 2.2c. See PR description for the Rails-skipped surface.
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";
import { Root } from "./paths.js";
import { Trailtie } from "./trailtie.js";
import { Trailties } from "./engine/trailties.js";

type EngineHost = { _calledFrom?: string; _isolated?: boolean };
const host = (k: typeof Engine): EngineHost => k as unknown as EngineHost;

export class Engine extends Trailtie {
  private _paths?: Root;
  private _railtiesCollection?: Trailties;

  static calledFrom(value?: string): string | undefined {
    if (value !== undefined) host(this)._calledFrom = value;
    return host(this)._calledFrom;
  }
  static isolated(value?: boolean): boolean {
    if (value !== undefined) host(this)._isolated = value;
    return host(this)._isolated === true;
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

  async root(): Promise<string | undefined> {
    const klass = this.constructor as typeof Engine;
    const from = klass.calledFrom();
    return from === undefined ? undefined : await klass.findRoot(from);
  }

  // Default paths layout. `.rb` → `.ts`; autoload/eager surface → 2.2b.
  async paths(): Promise<Root> {
    if (this._paths) return this._paths;
    const root = (await this.root()) ?? null;
    const paths = new Root(root);
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
    paths.add("lib/tasks", { glob: "**/*.rake" });
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
    if (root !== null) this._paths = paths;
    return paths;
  }

  async helpersPaths(): Promise<string[]> {
    const node = (await this.paths()).get("app/helpers");
    return node ? await node.existent() : [];
  }

  railties(): Trailties {
    if (!this._railtiesCollection) this._railtiesCollection = new Trailties();
    return this._railtiesCollection;
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
