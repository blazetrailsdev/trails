import { autoloadGet } from "./core-ext/kernel.js";
import {
  File,
  LOADED_FEATURES,
  Monitor,
  Mutex,
  NameError as RubyNameError,
  SecureRandom,
  constGet,
  getFs,
  include,
  rbInspect,
  type Included,
  type Pathname,
} from "@blazetrails/ruby-compat";
import { Cref } from "./cref.js";
import { Map } from "./cref/map.js";
import { ReloadingDisabledError, Error as ZeitwerkError, SetupRequired } from "./error.js";
import { Inflector } from "./inflector.js";
import { Callbacks } from "./loader/callbacks.js";
import { Config } from "./loader/config.js";
import { EagerLoad } from "./loader/eager-load.js";
import { Helpers } from "./loader/helpers.js";
import { configurationDigest, manifestRoot, type Manifest } from "./loader/manifest.js";
import { RealModName } from "./real-mod-name.js";
import { Registry } from "./registry.js";

const MUTEX = new Mutex();

export type Logger = ((message: string) => unknown) | { debug(message: string): unknown };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Loader
  extends
    Included<typeof RealModName>,
    Included<typeof Callbacks>,
    Included<typeof Helpers>,
    Included<typeof Config>,
    Included<typeof EagerLoad> {
  tag: string;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Loader {
  static defaultLogger: Logger | null = null;

  inflector: Inflector;
  logger: Logger | null;
  /** @noRailsEquivalent PERMANENT */
  manifest: Manifest | string | null;
  /** @noRailsEquivalent PERMANENT */
  manifestRoot: string | null;
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
  /** @internal */ _generation: number;
  /** @internal */ _realRoots: Record<string, string>;

  /** @inlinedFrom Zeitwerk::Loader::Config#initialize zeitwerk/v2.7.2/lib/zeitwerk/loader/config.rb:86-101 */
  constructor() {
    this.inflector = new Inflector();
    this.logger = (this.constructor as typeof Loader).defaultLogger;
    this.manifest = null;
    this.manifestRoot = null;
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
    this._generation = 1;
    this._realRoots = {};

    Registry.registerLoader(this);
  }

  /** @inventedArm if — PERMANENT */
  async setup(): Promise<void> {
    await this.mutex.synchronize(async () => {
      if (this._setup) return;

      if (this.manifest != null) {
        await this._defineAutoloadsFromManifest(this.manifest);
      } else {
        const roots = await this.actualRoots();
        for (const [rootDir, rootNamespace] of Object.entries(roots)) {
          await this.defineAutoloadsForDir(rootDir, rootNamespace);
        }
      }

      for (const callback of this.onSetupCallbacks) await callback();

      this._setup = true;
    });
  }

  async unload(): Promise<void> {
    await this.mutex.synchronize(async () => {
      if (!this._setup) throw new SetupRequired();

      const unloadedFiles = new Set<string>();

      for (const [abspath, cref] of Object.entries(this.autoloads)) {
        if (cref.isAutoload() != null) {
          this.unloadAutoload(cref);
        } else {
          this.unloadCref(cref);
          if (await this.isRuby(abspath)) unloadedFiles.add(abspath);
        }
      }

      for (const [abspath, cref] of Object.entries(this.toUnload)) {
        if (Object.keys(this.onUnloadCallbacks).length !== 0) {
          let value: unknown;
          let defined = true;
          try {
            value = cref.get();
          } catch (error) {
            if (!(error instanceof RubyNameError)) throw error;
            defined = false;
          }
          if (defined) await this.runOnUnloadCallbacks(cref, value, abspath);
        }

        this.unloadCref(cref);
        if (await this.isRuby(abspath)) unloadedFiles.add(abspath);
      }

      if (unloadedFiles.size !== 0) {
        LOADED_FEATURES.splice(
          0,
          LOADED_FEATURES.length,
          ...LOADED_FEATURES.filter((file) => !unloadedFiles.has(file)),
        );
      }

      this.autoloads = {};
      this.autoloadedDirs.length = 0;
      this.toUnload = {};
      this.namespaceDirs.clear();
      this.shadowedFiles.clear();

      this.unregisterExplicitNamespaces();

      Registry.onUnload(this);

      this._setup = false;
      this._eagerLoaded = false;
      this._generation += 1;
    });
  }

  async reload(): Promise<void> {
    if (!this.isReloadingEnabled()) throw new ReloadingDisabledError();
    if (!this._setup) throw new SetupRequired();

    await this.unload();
    await this.recomputeIgnoredPaths();
    await this.recomputeCollapseDirs();
    await this.setup();
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

  isUnloadableCpath(cpath: string): boolean {
    return this.unloadableCpaths().includes(cpath);
  }

  unloadableCpaths(): string[] {
    return Object.values(this.toUnload).map((cref) => cref.path());
  }

  unregister(): void {
    this.unregisterExplicitNamespaces();
    Registry.unregisterLoader(this);
  }

  /** @internal */
  isShadowedFile(file: string): boolean {
    return this.shadowedFiles.has(file);
  }

  static async eagerLoadAll(): Promise<void> {
    for (const loader of Registry.loaders) {
      try {
        await loader.eagerLoad();
      } catch (error) {
        if (!(error instanceof SetupRequired)) throw error;
      }
    }
  }

  static async eagerLoadNamespace(mod: object): Promise<void> {
    for (const loader of Registry.loaders) {
      try {
        await loader.eagerLoadNamespace(mod);
      } catch (error) {
        if (!(error instanceof SetupRequired)) throw error;
      }
    }
  }

  private async _defineAutoloadsFromManifest(source: Manifest | string): Promise<void> {
    const manifest =
      typeof source === "string"
        ? (JSON.parse(
            await getFs().readFile(File.expandPath(source, manifestRoot(this)), "utf8"),
          ) as Manifest)
        : source;
    const root = manifestRoot(this);
    const stale = Object.entries(manifest.constants).some(([cpath, row]) => {
      const basename = File.basename(row.path)
        .replace(/\.[jt]s$/, "")
        .replaceAll("-", "_");
      const cname = cpath.slice(cpath.lastIndexOf("::") + (cpath.includes("::") ? 2 : 1));
      return this.inflector.camelize(basename, File.expandPath(row.path, root)) !== cname;
    });
    if (stale || manifest.digest !== configurationDigest(this)) {
      throw new ZeitwerkError(
        `the autoload manifest of loader ${this.tag} does not match its configuration, run trails build`,
      );
    }

    const namespaces: Record<string, object> = {};
    for (const rootNamespace of Object.values(this.roots)) {
      namespaces[rootNamespace === Object ? "" : this.realModName(rootNamespace)!] = rootNamespace;
    }

    for (const file of manifest.shadowed) this.shadowedFiles.add(File.expandPath(file, root));

    for (const [cpath, row] of Object.entries(manifest.constants)) {
      const index = cpath.lastIndexOf("::");
      const parentPath = index < 0 ? "" : cpath.slice(0, index);
      if (!Object.hasOwn(namespaces, parentPath) && Object.hasOwn(manifest.constants, parentPath)) {
        continue;
      }
      const parent = namespaces[parentPath] ?? (constGet(Object, parentPath) as object);

      const cref = new Cref(parent, index < 0 ? cpath : cpath.slice(index + 2));
      const abspath = File.expandPath(row.path, root);
      if (cref.isDefined()) {
        if (row.export != null) {
          this.shadowedFiles.add(abspath);
          if (this.logger != null) {
            this.log(`file ${abspath} is ignored because ${cref} is already defined`);
          }
        }
        if (row.dirs != null) namespaces[cpath] = cref.get() as object;
        continue;
      }

      if (row.dirs != null) {
        for (const dir of row.dirs) {
          this.namespaceDirs.getOrSet(cref, () => []).push(File.expandPath(dir, root));
        }
      }
      await this.defineAutoload(cref, abspath);
      if (row.kind === "explicit") this.registerExplicitNamespace(cref);
    }
  }

  /** @internal */
  async defineAutoloadsForDir(dir: string, parent: object): Promise<void> {
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
    const autoloadPath = this.isAutoloadPathSetByMeFor(cref);
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
      await this.defineAutoloadsForDir(subdir, (await autoloadGet(cref)) as object);
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
  private isAutoloadPathSetByMeFor(cref: Cref): string | null {
    const autoloadPath = cref.isAutoload();
    if (autoloadPath != null && Object.hasOwn(this.autoloads, autoloadPath)) return autoloadPath;
    return null;
  }

  /** @internal */
  private registerExplicitNamespace(cref: Cref): void {
    Registry.ExplicitNamespaces.register(cref, this);
  }

  /** @internal */
  private unregisterExplicitNamespaces(): void {
    Registry.ExplicitNamespaces.unregisterLoader(this);
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

  /** @internal */
  private async runOnUnloadCallbacks(cref: Cref, value: unknown, abspath: string): Promise<void> {
    const callbacks = this.onUnloadCallbacks as Record<string, ((...args: unknown[]) => unknown)[]>;
    for (const c of callbacks[cref.path()] ?? []) await c(value, abspath);
    for (const c of callbacks[":ANY"] ?? []) await c(cref.path(), value, abspath);
  }

  /** @internal */
  private unloadAutoload(cref: Cref): void {
    cref.remove();
    if (this.logger != null) this.log(`autoload for ${cref} removed`);
  }

  /** @internal */
  private unloadCref(cref: Cref): void {
    try {
      cref.remove();
    } catch (error) {
      if (!(error instanceof RubyNameError)) throw error;
      return;
    }
    if (this.logger != null) this.log(`${cref} unloaded`);
  }
}

include(Loader, RealModName);
include(Loader, Callbacks);
include(Loader, Helpers);
include(Loader, Config);
include(Loader, EagerLoad);
