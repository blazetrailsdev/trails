import { File } from "@blazetrails/ruby-compat";
import { PathSet } from "./path-set.js";
import { FileSystemResolver } from "./template/resolver.js";
import type { PathSetResolver } from "./path-set.js";

type ClassLike = new (...args: unknown[]) => unknown;

export class PathRegistry {
  /** @internal */
  static readonly fileSystemResolverHooks: Array<() => void> = [];

  private static _fileSystemResolvers = new Map<string, FileSystemResolver>();
  private static _viewPathsByClass = new Map<ClassLike, PathSet>();

  /** @internal */
  static getViewPaths(klass: ClassLike): PathSet | undefined {
    if (this._viewPathsByClass.has(klass)) return this._viewPathsByClass.get(klass);
    const proto = Object.getPrototypeOf(klass) as ClassLike | null;
    return proto && typeof proto === "function" && proto !== Function.prototype
      ? this.getViewPaths(proto)
      : undefined;
  }

  /** @internal */
  static setViewPaths(klass: ClassLike, paths: PathSet): void {
    this._viewPathsByClass.set(klass, paths);
  }

  /** @internal */
  static castFileSystemResolvers(paths: Array<string | PathSetResolver>): PathSetResolver[] {
    let builtNew = false;
    const result = paths.map((p) => {
      if (typeof p === "string") {
        const abs = File.expandPath(p);
        if (!this._fileSystemResolvers.has(abs)) {
          this._fileSystemResolvers.set(abs, new FileSystemResolver(abs));
          builtNew = true;
        }
        return this._fileSystemResolvers.get(abs)!;
      }
      return p;
    });
    if (builtNew) {
      for (const hook of this.fileSystemResolverHooks) hook();
    }
    return result;
  }

  /** @internal */
  static allFileSystemResolvers(): FileSystemResolver[] {
    return Array.from(this._fileSystemResolvers.values());
  }

  static allResolvers(): PathSetResolver[] {
    const seen = new Set<PathSetResolver>();
    const out: PathSetResolver[] = [];
    const add = (r: PathSetResolver) => {
      if (!seen.has(r)) {
        seen.add(r);
        out.push(r);
      }
    };
    for (const r of this._fileSystemResolvers.values()) add(r);
    for (const paths of this._viewPathsByClass.values()) {
      for (const r of paths.toArray() as unknown as PathSetResolver[]) add(r);
    }
    return out;
  }

  /** @internal */
  static reset(): void {
    this._fileSystemResolvers.clear();
    this._viewPathsByClass.clear();
    this.fileSystemResolverHooks.length = 0;
  }
}
