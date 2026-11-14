import { extend, type Extended } from "@blazetrails/ruby-compat";
import { Internal } from "../internal.js";
import { _generations } from "../core-ext/kernel.js";
import {
  Dir,
  File,
  Pathname,
  ThreadError,
  TypeError,
  getFs,
  rbInspect,
  stdout,
} from "@blazetrails/ruby-compat";
import { _isModule } from "../core-ext/module.js";
import { Error as ZeitwerkError } from "../error.js";
import type { Loader } from "../loader.js";

type PathArg = string | Pathname;
type GlobArg = PathArg | PathArg[];
type LoadBlock = (...args: never[]) => unknown;

export const Config = {
  /** @inventedArm realpath — PERMANENT */
  async pushDir(
    this: Loader,
    path: PathArg,
    { namespace = Object as unknown }: { namespace?: unknown } = {},
  ): Promise<object> {
    if (!_isModule(namespace)) {
      throw new ZeitwerkError(`${rbInspect(namespace)} is not a class or module object, should be`);
    }

    if (this.realModName(namespace) == null) {
      throw new ZeitwerkError("root namespaces cannot be anonymous");
    }

    path = path.toString();
    const abspath = File.expandPath(path);
    if (this.manifest != null || (await this.isDir(abspath))) {
      this.raiseIfConflictingDirectory(abspath);
      if (this.manifest == null) {
        const realRoot = await getFs().realpath!(abspath);
        this._realRoots[realRoot] = abspath;
        this._generation = Math.max(this._generation, _generations.get(realRoot) ?? 1);
      }
      return (this.roots[abspath] = namespace);
    } else {
      throw new ZeitwerkError(`the root directory ${abspath} does not exist`);
    }
  },

  get tag(): string {
    return (this as unknown as Loader)._tag;
  },

  set tag(tag: unknown) {
    (this as unknown as Loader)._tag = tag == null ? "" : String(tag);
  },

  dirs(
    this: Loader,
    { namespaces = false, ignored = false }: { namespaces?: boolean; ignored?: boolean } = {},
  ): readonly string[] | Readonly<Record<string, object>> {
    if (namespaces) {
      if (ignored || this.ignoredPaths.size === 0) return Object.freeze({ ...this.roots });
      return Object.freeze(
        Object.fromEntries(
          Object.entries(this.roots).filter(([rootDir]) => !this.isIgnoredPath(rootDir)),
        ),
      );
    } else {
      if (ignored || this.ignoredPaths.size === 0) return Object.freeze(Object.keys(this.roots));
      return Object.freeze(
        Object.keys(this.roots).filter((rootDir) => !this.isIgnoredPath(rootDir)),
      );
    }
  },

  /** @inventedArm if — PERMANENT */
  enableReloading(this: Loader): void {
    let raised = false;
    const synchronized = this.mutex.synchronize(() => {
      if (raised) return;
      if (this._reloadingEnabled) return;

      if (this._setup) {
        throw new ZeitwerkError("cannot enable reloading after setup");
      } else {
        this._reloadingEnabled = true;
      }
    });
    if (synchronized instanceof Promise) {
      raised = true;
      throw new ThreadError("deadlock; synchronize contended in a synchronous caller");
    }
  },

  isReloadingEnabled(this: Loader): boolean {
    return this._reloadingEnabled;
  },

  /** @inventedArm if — PERMANENT */
  doNotEagerLoad(this: Loader, ...paths: GlobArg[]): void {
    let raised = false;
    const synchronized = this.mutex.synchronize(() => {
      if (raised) return;
      for (const path of this.expandPaths(paths)) this.eagerLoadExclusions.add(path);
    });
    if (synchronized instanceof Promise) {
      raised = true;
      throw new ThreadError("deadlock; synchronize contended in a synchronous caller");
    }
  },

  /** @inventedArm if — PERMANENT */
  ignore(this: Loader, ...globPatterns: GlobArg[]): void {
    globPatterns = this.expandPaths(globPatterns);
    let raised = false;
    const synchronized = this.mutex.synchronize(() => {
      if (raised) return;
      for (const pattern of globPatterns as string[]) this.ignoredGlobPatterns.add(pattern);
      for (const path of this.expandGlobPatterns(globPatterns as string[]))
        this.ignoredPaths.add(path);
    });
    if (synchronized instanceof Promise) {
      raised = true;
      throw new ThreadError("deadlock; synchronize contended in a synchronous caller");
    }
  },

  /** @inventedArm if — PERMANENT */
  collapse(this: Loader, ...globPatterns: GlobArg[]): void {
    globPatterns = this.expandPaths(globPatterns);
    let raised = false;
    const synchronized = this.mutex.synchronize(() => {
      if (raised) return;
      for (const pattern of globPatterns as string[]) this.collapseGlobPatterns.add(pattern);
      for (const path of this.expandGlobPatterns(globPatterns as string[]))
        this.collapseDirs.add(path);
    });
    if (synchronized instanceof Promise) {
      raised = true;
      throw new ThreadError("deadlock; synchronize contended in a synchronous caller");
    }
  },

  async onSetup(this: Loader, block: () => unknown): Promise<void> {
    await this.mutex.synchronize(async () => {
      this.onSetupCallbacks.push(block);
      if (this._setup) await block();
    });
  },

  /** @inventedArm if — PERMANENT */
  onLoad(this: Loader, cpath: string | LoadBlock = ":ANY", block?: LoadBlock): void {
    if (typeof cpath === "function" && block === undefined) [cpath, block] = [":ANY", cpath];
    if (typeof cpath !== "string") throw new TypeError("on_load only accepts strings");

    let raised = false;
    const synchronized = this.mutex.synchronize(() => {
      if (raised) return;
      (this.onLoadCallbacks[cpath] ??= []).push(block!);
    });
    if (synchronized instanceof Promise) {
      raised = true;
      throw new ThreadError("deadlock; synchronize contended in a synchronous caller");
    }
  },

  /** @inventedArm if — PERMANENT */
  onUnload(this: Loader, cpath: string | LoadBlock = ":ANY", block?: LoadBlock): void {
    if (typeof cpath === "function" && block === undefined) [cpath, block] = [":ANY", cpath];
    if (typeof cpath !== "string") throw new TypeError("on_unload only accepts strings");

    let raised = false;
    const synchronized = this.mutex.synchronize(() => {
      if (raised) return;
      (this.onUnloadCallbacks[cpath] ??= []).push(block!);
    });
    if (synchronized instanceof Promise) {
      raised = true;
      throw new ThreadError("deadlock; synchronize contended in a synchronous caller");
    }
  },

  logBang(this: Loader): void {
    this.logger = (msg: string) => stdout.write(`${msg}\n`);
  },

  /** @internal */
  isIgnores(this: Loader, abspath: string): boolean {
    if (this.ignoredPaths.size === 0) return false;

    for (const path of this.walkUp(abspath)) {
      if (this.isIgnoredPath(path)) return true;
      if (Object.hasOwn(this.roots, path)) return false;
    }

    return false;
  },

  /** @internal */
  isIgnoredPath(this: Loader, abspath: string): boolean {
    return this.ignoredPaths.has(abspath);
  },

  /** @internal */
  async actualRoots(this: Loader): Promise<Record<string, object>> {
    const roots: Record<string, object> = {};
    for (const [rootDir, rootNamespace] of Object.entries(this.roots)) {
      if (this._manifestConstants == null && !(await this.isDir(rootDir))) continue;
      if (this.isIgnoredPath(rootDir)) continue;
      roots[rootDir] = rootNamespace;
    }
    return roots;
  },

  /** @internal */
  isRootDir(this: Loader, dir: string): boolean {
    return Object.hasOwn(this.roots, dir);
  },

  /** @internal */
  isExcludedFromEagerLoad(this: Loader, abspath: string): boolean {
    if (this.eagerLoadExclusions.size === 0) return false;

    for (const path of this.walkUp(abspath)) {
      if (this.eagerLoadExclusions.has(path)) return true;
      if (Object.hasOwn(this.roots, path)) return false;
    }

    return false;
  },

  /** @internal */
  isCollapse(this: Loader, dir: string): boolean {
    return this.collapseDirs.has(dir);
  },

  /** @internal */
  expandPaths(this: Loader, paths: GlobArg[]): string[] {
    return (paths.flat(Infinity) as PathArg[]).map((path) => File.expandPath(path.toString()));
  },

  /** @internal */
  expandGlobPatterns(this: Loader, globPatterns: Iterable<string>): string[] {
    const found: string[] = [];
    if (this.manifest != null && !this.isReloadingEnabled()) return found;
    for (const globPattern of globPatterns) found.push(...Dir.glob(globPattern));
    return found;
  },

  /** @internal */
  recomputeIgnoredPaths(this: Loader): void {
    const paths = this.expandGlobPatterns(this.ignoredGlobPatterns);
    this.ignoredPaths.clear();
    for (const path of paths) this.ignoredPaths.add(path);
  },

  /** @internal */
  recomputeCollapseDirs(this: Loader): void {
    const dirs = this.expandGlobPatterns(this.collapseGlobPatterns);
    this.collapseDirs.clear();
    for (const dir of dirs) this.collapseDirs.add(dir);
  },
};

extend(Config, Internal);
const self = Config as typeof Config & Extended<typeof Internal>;
self.internal("roots");
self.internal("isIgnores");
