import {
  File,
  Monitor,
  Mutex,
  SecureRandom,
  include,
  rbInspect,
  type Included,
  type Pathname,
} from "@blazetrails/ruby-compat";
import { Cref } from "./cref.js";
import { Map } from "./cref/map.js";
import { Error as ZeitwerkError } from "./error.js";
import { Inflector } from "./inflector.js";
import { Config } from "./loader/config.js";
import { Helpers } from "./loader/helpers.js";
import { RealModName } from "./real-mod-name.js";
import { Registry } from "./registry.js";

const MUTEX = new Mutex();

export type Logger = ((message: string) => unknown) | { debug(message: string): unknown };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Loader
  extends Included<typeof RealModName>, Included<typeof Helpers>, Included<typeof Config> {
  tag: string;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Loader {
  static defaultLogger: Logger | null = null;

  inflector: Inflector;
  logger: Logger | null;
  /** @internal */ _tag: string;
  /** @internal */ _initializedAt: Date;
  /** @internal */ roots: Record<string, object>;
  /** @internal */ ignoredGlobPatterns: Set<string>;
  /** @internal */ ignoredPaths: Set<string>;
  /** @internal */ collapseGlobPatterns: Set<string>;
  /** @internal */ collapseDirs: Set<string>;
  /** @internal */ eagerLoadExclusions: Set<string>;
  /** @internal */ _reloadingEnabled: boolean;
  /** @internal */ onSetupCallbacks: (() => unknown)[];
  /** @internal */ onLoadCallbacks: Record<string, ((...args: never[]) => unknown)[]>;
  /** @internal */ onUnloadCallbacks: Record<string, ((...args: never[]) => unknown)[]>;

  /** @internal */ autoloads: Record<string, Cref>;
  /** @internal */ autoloadedDirs: string[];
  /** @internal */ toUnload: Record<string, Cref>;
  /** @internal */ namespaceDirs: Map<string[]>;
  /** @internal */ shadowedFiles: Set<string>;
  /** @internal */ _setup: boolean;
  /** @internal */ _eagerLoaded: boolean;
  /** @internal */ mutex: Mutex;
  /** @internal */ dirsAutoloadMonitor: Monitor;

  /** @inlinedFrom Zeitwerk::Loader::Config#initialize zeitwerk/v2.7.2/lib/zeitwerk/loader/config.rb:86-101 */
  constructor() {
    this.inflector = new Inflector();
    this.logger = (this.constructor as typeof Loader).defaultLogger;
    this._tag = SecureRandom.hex(3);
    this._initializedAt = new Date();
    this.roots = {};
    this.ignoredGlobPatterns = new Set();
    this.ignoredPaths = new Set();
    this.collapseGlobPatterns = new Set();
    this.collapseDirs = new Set();
    this.eagerLoadExclusions = new Set();
    this._reloadingEnabled = false;
    this.onSetupCallbacks = [];
    this.onLoadCallbacks = {};
    this.onUnloadCallbacks = {};

    this.autoloads = {};
    this.autoloadedDirs = [];
    this.toUnload = {};
    this.namespaceDirs = new Map();
    this.shadowedFiles = new Set();
    this._setup = false;
    this._eagerLoaded = false;

    this.mutex = new Mutex();
    this.dirsAutoloadMonitor = new Monitor();

    Registry.registerLoader(this);
  }

  async setup(): Promise<void> {
    await this.mutex.synchronize(async () => {
      if (this._setup) return;

      const roots = await this.actualRoots();
      for (const [rootDir, rootNamespace] of Object.entries(roots)) {
        await this.defineAutoloadsForDir(rootDir, rootNamespace);
      }

      for (const callback of this.onSetupCallbacks) callback();

      this._setup = true;
    });
  }

  async allExpectedCpaths(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    const roots = await this.actualRoots();
    for (const [rootDir, rootNamespace] of Object.entries(roots)) {
      const queue: [string, string][] = [[rootDir, this.realModName(rootNamespace)!]];

      let next: [string, string] | undefined;
      while ((next = queue.shift()) !== undefined) {
        const [dir, cpath] = next;
        result[dir] = cpath;

        const prefix = cpath === "Object" ? "" : `${cpath}::`;

        await this.ls(dir, (basename, abspath, ftype) => {
          if (ftype === "file") {
            basename = basename.replace(/\.[jt]s$/, "");
            result[abspath] = prefix + this.inflector.camelize(basename, abspath);
          } else {
            if (this.isCollapse(abspath)) {
              queue.push([abspath, cpath]);
            } else {
              queue.push([abspath, prefix + this.inflector.camelize(basename, abspath)]);
            }
          }
        });
      }
    }

    return result;
  }

  /**
   * @missingRailsArgs basename — PERMANENT
   * @inventedArm replaceAll — PERMANENT
   */
  async cpathExpectedAt(path: string | Pathname): Promise<string | null> {
    path = path.toString();
    const abspath = File.expandPath(path);

    if (!(await File.isExistAsync(abspath))) {
      throw new ZeitwerkError(`${abspath} does not exist`);
    }

    if (!(await this.isDir(abspath)) && !(await this.isRuby(abspath))) return null;
    if (this.isIgnoredPath(abspath)) return null;

    const paths: [string, string][] = [];

    let walkUpFrom: string;
    if (await this.isRuby(abspath)) {
      const basename = File.basename(abspath, ".*");
      if (this.isHidden(basename)) return null;

      paths.push([basename.replaceAll("-", "_"), abspath]);
      walkUpFrom = File.dirname(abspath);
    } else {
      walkUpFrom = abspath;
    }

    let rootNamespace: object | null = null;

    for (const dir of this.walkUp(walkUpFrom)) {
      rootNamespace = this.roots[dir] ?? null;
      if (rootNamespace != null) break;
      if (this.isIgnoredPath(dir)) return null;

      const basename = File.basename(dir);
      if (this.isHidden(basename)) return null;

      if (!this.isCollapse(dir)) paths.push([basename.replaceAll("-", "_"), abspath]);
    }

    if (rootNamespace == null) return null;

    if (paths.length === 0) {
      return this.realModName(rootNamespace);
    } else {
      const cnames: string[] = [];
      for (const [b, a] of paths.reverse()) cnames.push(await this.cnameFor(b, a));

      if (rootNamespace === Object) {
        return cnames.join("::");
      } else {
        return `${this.realModName(rootNamespace)}::${cnames.join("::")}`;
      }
    }
  }

  /** @internal */
  isShadowedFile(file: string): boolean {
    return this.shadowedFiles.has(file);
  }

  /** @internal */
  private async defineAutoloadsForDir(dir: string, parent: object): Promise<void> {
    await this.ls(dir, async (basename, abspath, ftype) => {
      if (ftype === "file") {
        basename = basename.replace(/\.[jt]s$/, "");
        const cref = new Cref(parent, await this.cnameFor(basename, abspath));
        await this.autoloadFile(cref, abspath);
      } else {
        if (this.isCollapse(abspath)) {
          await this.defineAutoloadsForDir(abspath, parent);
        } else {
          const cref = new Cref(parent, await this.cnameFor(basename, abspath));
          await this.autoloadSubdir(cref, abspath);
        }
      }
    });
  }

  /** @internal */
  private async autoloadSubdir(cref: Cref, subdir: string): Promise<void> {
    const autoloadPath = this.autoloadPathSetByMeFor(cref);
    if (autoloadPath != null) {
      if (await this.isRuby(autoloadPath)) {
        this.registerExplicitNamespace(cref);
      }
      this.namespaceDirs.getOrSet(cref, () => []).push(subdir);
    } else if (!cref.isDefined()) {
      this.namespaceDirs.getOrSet(cref, () => []).push(subdir);
      await this.defineAutoload(cref, subdir);
    } else {
      if (this.logger != null) {
        this.log(`the namespace ${cref} already exists, descending into ${subdir}`);
      }
      await this.defineAutoloadsForDir(subdir, cref.get() as object);
    }
  }

  /** @internal */
  private async autoloadFile(cref: Cref, file: string): Promise<void> {
    const autoloadPath = cref.isAutoload();
    if (autoloadPath != null) {
      if (await this.isRuby(autoloadPath)) {
        this.shadowedFiles.add(file);
        if (this.logger != null) {
          this.log(`file ${file} is ignored because ${autoloadPath} has precedence`);
        }
      } else {
        await this.promoteNamespaceFromImplicitToExplicit({ dir: autoloadPath, file, cref });
      }
    } else if (cref.isDefined()) {
      this.shadowedFiles.add(file);
      if (this.logger != null) {
        this.log(`file ${file} is ignored because ${cref} is already defined`);
      }
    } else {
      await this.defineAutoload(cref, file);
    }
  }

  /** @internal */
  private async promoteNamespaceFromImplicitToExplicit({
    dir,
    file,
    cref,
  }: {
    dir: string;
    file: string;
    cref: Cref;
  }): Promise<void> {
    delete this.autoloads[dir];
    Registry.unregisterAutoload(dir);

    if (this.logger != null) {
      this.log(
        `earlier autoload for ${cref} discarded, it is actually an explicit namespace defined in ${file}`,
      );
    }

    await this.defineAutoload(cref, file);
    this.registerExplicitNamespace(cref);
  }

  /** @internal */
  private async defineAutoload(cref: Cref, abspath: string): Promise<void> {
    cref.autoload(abspath);

    if (this.logger != null) {
      if (await this.isRuby(abspath)) {
        this.log(`autoload set for ${cref}, to be loaded from ${abspath}`);
      } else {
        this.log(`autoload set for ${cref}, to be autovivified from ${abspath}`);
      }
    }

    this.autoloads[abspath] = cref;
    Registry.registerAutoload(this, abspath);
  }

  /** @internal */
  private autoloadPathSetByMeFor(cref: Cref): string | null {
    const autoloadPath = cref.isAutoload();
    if (autoloadPath != null && Object.hasOwn(this.autoloads, autoloadPath)) return autoloadPath;
    return null;
  }

  /** @internal */
  private registerExplicitNamespace(cref: Cref): void {
    Registry.ExplicitNamespaces.register(cref, this);
  }

  /** @internal */
  raiseIfConflictingDirectory(dir: string): void {
    MUTEX.synchronize(() => {
      const dirSlash = `${dir}/`;

      for (const loader of Registry.loaders) {
        if (loader === this) continue;
        if (loader.isIgnores(dir)) continue;

        for (const rootDir of Object.keys(loader.roots)) {
          if (this.isIgnores(rootDir)) continue;

          const rootDirSlash = `${rootDir}/`;
          if (dirSlash.startsWith(rootDirSlash) || rootDirSlash.startsWith(dirSlash)) {
            throw new ZeitwerkError(
              `loader\n\n${rbInspect(this)}\n\n\nwants to manage directory ${dir},` +
                ` which is already managed by\n\n${rbInspect(loader)}\n\n`,
            );
          }
        }
      }
    });
  }
}

include(Loader, RealModName);
include(Loader, Helpers);
include(Loader, Config);
