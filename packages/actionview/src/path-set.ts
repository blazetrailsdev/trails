/**
 * ActionView::PathSet
 *
 * An ordered collection of view paths (Resolvers). LookupContext stores its
 * paths in a PathSet. Searches iterate prefixes outer, resolvers inner:
 * given prefixes [A, B] and resolvers [r1, r2], the order is
 * (r1,A), (r2,A), (r1,B), (r2,B).
 *
 * Phase 0c is a data-shape leaf: this file defines the PathSet container and
 * a minimal `PathSetResolver` protocol. The real `Resolver`/`FileSystemResolver`
 * port lands in Phase 1c.
 */

import type { Requested, TemplateDetails } from "./template-details.js";
import type { TemplatePath } from "./template-path.js";

export interface PathSetResolver {
  findAll(
    path: TemplatePath | string,
    prefix: string,
    partial: boolean,
    details: TemplateDetails | Requested,
    detailsKey: unknown,
    locals: ReadonlyArray<string>,
  ): unknown[];
}

export class PathSet implements Iterable<PathSetResolver> {
  readonly paths: ReadonlyArray<PathSetResolver>;

  constructor(paths: ReadonlyArray<PathSetResolver | unknown> = []) {
    this.paths = Object.freeze(this.typecast(paths));
  }

  /**
   * @internal
   * Clone for Ruby's `initialize_copy(other)` — frozen, deep-ish copy of paths.
   */
  initializeCopy(other: PathSet): this {
    (this as { paths: ReadonlyArray<PathSetResolver> }).paths = Object.freeze(other.paths.slice());
    return this;
  }

  get size(): number {
    return this.paths.length;
  }

  at(idx: number): PathSetResolver | undefined {
    return this.paths[idx];
  }

  includes(resolver: PathSetResolver): boolean {
    return this.paths.includes(resolver);
  }

  *[Symbol.iterator](): IterableIterator<PathSetResolver> {
    for (const r of this.paths) yield r;
  }

  /** Materialize as a plain array (matches Rails `to_ary`). */
  toArray(): PathSetResolver[] {
    return this.paths.slice();
  }

  /** @internal */
  compact(): PathSet {
    return new PathSet(this.paths.filter((p): p is PathSetResolver => p != null));
  }

  /** Concatenate another PathSet or array (returns a new PathSet). */
  plus(other: PathSet | ReadonlyArray<PathSetResolver>): PathSet {
    const arr = Array.isArray(other) ? other : (other as PathSet).paths;
    return new PathSet([...this.paths, ...arr]);
  }

  /**
   * Find one matching template; throws if none match.
   *
   * Note: the concrete return type (`Template`) is defined in Phase 1b. Until
   * then this returns `unknown` to keep this file's dependency surface narrow.
   */
  find(
    path: TemplatePath | string,
    prefixes: string | ReadonlyArray<string>,
    partial: boolean,
    details: TemplateDetails | Requested,
    detailsKey: unknown,
    locals: ReadonlyArray<string>,
  ): unknown {
    const found = this.findAll(path, prefixes, partial, details, detailsKey, locals);
    if (found.length > 0) return found[0];
    const pfxs = Array.isArray(prefixes) ? prefixes : [prefixes];
    throw new Error(`Missing template ${String(path)} with prefixes [${pfxs.join(", ")}]`);
  }

  findAll(
    path: TemplatePath | string,
    prefixes: string | ReadonlyArray<string>,
    partial: boolean,
    details: TemplateDetails | Requested,
    detailsKey: unknown,
    locals: ReadonlyArray<string>,
  ): unknown[] {
    for (const { resolver, prefix } of this.searchCombinations(prefixes)) {
      const templates = resolver.findAll(path, prefix, partial, details, detailsKey, locals);
      if (templates.length > 0) return templates;
    }
    return [];
  }

  /**
   * @internal
   * Iterates `(resolver, prefix)` pairs in Rails' `search_combinations` order:
   * prefixes outer, resolvers inner.
   */
  private *searchCombinations(
    prefixes: string | ReadonlyArray<string>,
  ): IterableIterator<{ resolver: PathSetResolver; prefix: string }> {
    const pfxs = Array.isArray(prefixes) ? prefixes : [prefixes as string];
    for (const prefix of pfxs) {
      for (const resolver of this.paths) {
        yield { resolver, prefix };
      }
    }
  }

  /**
   * @internal
   * Validates incoming paths. Rails additionally wraps `String`/`Pathname`
   * entries in a `FileSystemResolver`; that wrapping lands with the resolver
   * port in Phase 1c. Until then non-Resolver entries throw.
   */
  private typecast(paths: ReadonlyArray<PathSetResolver | unknown>): PathSetResolver[] {
    return paths.map((path) => {
      if (
        path !== null &&
        typeof path === "object" &&
        typeof (path as PathSetResolver).findAll === "function"
      ) {
        return path as PathSetResolver;
      }
      throw new TypeError(
        `${String(path)} is not a valid path: must be a Resolver (string/Pathname wrapping lands in Phase 1c)`,
      );
    });
  }

  exists(
    path: TemplatePath | string,
    prefixes: string | ReadonlyArray<string>,
    partial: boolean,
    details: TemplateDetails | Requested,
    detailsKey: unknown,
    locals: ReadonlyArray<string>,
  ): boolean {
    return this.findAll(path, prefixes, partial, details, detailsKey, locals).length > 0;
  }
}
