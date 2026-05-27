/**
 * ActionView::PathRegistry
 *
 * Process-wide registry of view-path resolvers. Tracks FileSystemResolver
 * instances keyed by resolved path (so the same disk path always returns the
 * same resolver instance) and per-class view-path overrides used by
 * controller inheritance. `DetailsKey.clear()` walks `allResolvers()` to
 * invalidate resolver caches.
 */

import { getPath } from "@blazetrails/activesupport";
import { FileSystemResolver } from "./resolver/file-system-resolver.js";
import type { TemplateResolver } from "./resolver/resolver.js";

type ClassLike = new (...args: unknown[]) => unknown;

export class PathRegistry {
  /** @internal Hooks fired whenever a new FileSystemResolver is built via castFileSystemResolvers. */
  static readonly fileSystemResolverHooks: Array<() => void> = [];

  private static _fileSystemResolvers = new Map<string, FileSystemResolver>();
  private static _viewPathsByClass = new Map<ClassLike, TemplateResolver[]>();

  /** @internal */
  static getViewPaths(klass: ClassLike): TemplateResolver[] | undefined {
    if (this._viewPathsByClass.has(klass)) return this._viewPathsByClass.get(klass);
    const proto = Object.getPrototypeOf(klass) as ClassLike | null;
    return proto && typeof proto === "function" && proto !== Function.prototype
      ? this.getViewPaths(proto)
      : undefined;
  }

  /** @internal */
  static setViewPaths(klass: ClassLike, paths: TemplateResolver[]): void {
    this._viewPathsByClass.set(klass, paths);
  }

  /**
   * Converts an array of strings (filesystem paths) and/or existing resolver
   * instances into resolvers. String paths are resolved to absolute paths and
   * deduplicated — the same absolute path always yields the same
   * FileSystemResolver instance.
   * @internal
   */
  static castFileSystemResolvers(paths: Array<string | TemplateResolver>): TemplateResolver[] {
    let builtNew = false;
    const result = paths.map((p) => {
      if (typeof p === "string") {
        const abs = getPath().resolve(p);
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

  static allResolvers(): TemplateResolver[] {
    const seen = new Set<TemplateResolver>();
    const out: TemplateResolver[] = [];
    const add = (r: TemplateResolver) => {
      if (!seen.has(r)) {
        seen.add(r);
        out.push(r);
      }
    };
    for (const r of this._fileSystemResolvers.values()) add(r);
    for (const paths of this._viewPathsByClass.values()) {
      for (const r of paths) add(r);
    }
    return out;
  }

  /** @internal Reset all registry state — for use in tests only. */
  static reset(): void {
    this._fileSystemResolvers.clear();
    this._viewPathsByClass.clear();
    this.fileSystemResolverHooks.length = 0;
  }
}
