import {
  Dir,
  File,
  Pathname,
  TypeError,
  isModuleObject,
  rbInspect,
  stdout,
} from "@blazetrails/ruby-compat";
import { Error as ZeitwerkError } from "../error.js";
import type { Loader } from "../loader.js";

type PathArg = string | Pathname;
type GlobArg = PathArg | PathArg[];
type LoadBlock = (...args: never[]) => unknown;

export const Config = {
  async pushDir(
    this: Loader,
    path: PathArg,
    { namespace = Object as unknown }: { namespace?: unknown } = {},
  ): Promise<void> {
    if (
      typeof namespace !== "function" &&
      !(typeof namespace === "object" && namespace !== null && isModuleObject(namespace))
    ) {
      throw new ZeitwerkError(`${rbInspect(namespace)} is not a class or module object, should be`);
    }

    if (this.realModName(namespace) == null) {
      throw new ZeitwerkError("root namespaces cannot be anonymous");
    }

    path = path.toString();
    const abspath = File.expandPath(path);
    if (await this.isDir(abspath)) {
      this.raiseIfConflictingDirectory(abspath);
      this.roots[abspath] = namespace;
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

  enableReloading(this: Loader): void {
    this.mutex.synchronize(() => {
      if (this._reloadingEnabled) return;

      if (this._setup) {
        throw new ZeitwerkError("cannot enable reloading after setup");
      } else {
        this._reloadingEnabled = true;
      }
    });
  },

  isReloadingEnabled(this: Loader): boolean {
    return this._reloadingEnabled;
  },

  doNotEagerLoad(this: Loader, ...paths: GlobArg[]): void {
    this.mutex.synchronize(() => {
      for (const path of this.expandPaths(paths)) this.eagerLoadExclusions.add(path);
    });
  },

  async ignore(this: Loader, ...globPatterns: GlobArg[]): Promise<void> {
    globPatterns = this.expandPaths(globPatterns);
    const paths = await this.expandGlobPatterns(globPatterns as string[]);
    this.mutex.synchronize(() => {
      for (const pattern of globPatterns as string[]) this.ignoredGlobPatterns.add(pattern);
      for (const path of paths) this.ignoredPaths.add(path);
    });
  },

  async collapse(this: Loader, ...globPatterns: GlobArg[]): Promise<void> {
    globPatterns = this.expandPaths(globPatterns);
    const paths = await this.expandGlobPatterns(globPatterns as string[]);
    this.mutex.synchronize(() => {
      for (const pattern of globPatterns as string[]) this.collapseGlobPatterns.add(pattern);
      for (const path of paths) this.collapseDirs.add(path);
    });
  },

  async onSetup(this: Loader, block: () => unknown): Promise<void> {
    await this.mutex.synchronize(async () => {
      this.onSetupCallbacks.push(block);
      if (this._setup) await block();
    });
  },

  onLoad(this: Loader, cpath: string | LoadBlock = ":ANY", block?: LoadBlock): void {
    if (typeof cpath === "function") [cpath, block] = [":ANY", cpath];
    if (typeof cpath !== "string") throw new TypeError("on_load only accepts strings");

    this.mutex.synchronize(() => {
      (this.onLoadCallbacks[cpath] ??= []).push(block!);
    });
  },

  onUnload(this: Loader, cpath: string | LoadBlock = ":ANY", block?: LoadBlock): void {
    if (typeof cpath === "function") [cpath, block] = [":ANY", cpath];
    if (typeof cpath !== "string") throw new TypeError("on_unload only accepts strings");

    this.mutex.synchronize(() => {
      (this.onUnloadCallbacks[cpath] ??= []).push(block!);
    });
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
      if (!(await this.isDir(rootDir)) || this.isIgnoredPath(rootDir)) continue;
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
  async expandGlobPatterns(this: Loader, globPatterns: Iterable<string>): Promise<string[]> {
    const found: string[] = [];
    for (const globPattern of globPatterns) found.push(...(await Dir.globAsync(globPattern)));
    return found;
  },

  /** @internal */
  async recomputeIgnoredPaths(this: Loader): Promise<void> {
    const paths = await this.expandGlobPatterns(this.ignoredGlobPatterns);
    this.ignoredPaths.clear();
    for (const path of paths) this.ignoredPaths.add(path);
  },

  /** @internal */
  async recomputeCollapseDirs(this: Loader): Promise<void> {
    const dirs = await this.expandGlobPatterns(this.collapseGlobPatterns);
    this.collapseDirs.clear();
    for (const dir of dirs) this.collapseDirs.add(dir);
  },
};
