import type { Requested, TemplateDetails } from "./template-details.js";
import type { TemplatePath } from "./template-path.js";
import type { Template } from "./template.js";

export type LookupDetails =
  | TemplateDetails
  | Requested
  | Readonly<Record<string, ReadonlyArray<string | symbol>>>;

export interface PathSetResolver {
  findAll(
    path: TemplatePath | string,
    prefix: string,
    partial: boolean,
    details: LookupDetails,
    detailsKey: unknown,
    locals: ReadonlyArray<string>,
  ): unknown[];

  /** @internal */
  clearCache?(): void;

  builtTemplates?(): Template[];

  /** @internal */
  allTemplatePaths?(): readonly TemplatePath[];
}

export class PathSet implements Iterable<PathSetResolver> {
  readonly paths: ReadonlyArray<PathSetResolver>;

  constructor(paths: ReadonlyArray<PathSetResolver | unknown> = []) {
    this.paths = Object.freeze(this.typecast(paths));
  }

  /** @internal */
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

  /** @noRailsEquivalent PERMANENT */
  *[Symbol.iterator](): IterableIterator<PathSetResolver> {
    for (const r of this.paths) yield r;
  }

  toArray(): PathSetResolver[] {
    return this.paths.slice();
  }

  /** @internal */
  compact(): PathSet {
    return new PathSet(this.paths.filter((p): p is PathSetResolver => p != null));
  }

  plus(other: PathSet | ReadonlyArray<PathSetResolver>): PathSet {
    const arr = Array.isArray(other) ? other : (other as PathSet).paths;
    return new PathSet([...this.paths, ...arr]);
  }

  find(
    path: TemplatePath | string,
    prefixes: string | ReadonlyArray<string>,
    partial: boolean,
    details: LookupDetails,
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
    details: LookupDetails,
    detailsKey: unknown,
    locals: ReadonlyArray<string>,
  ): unknown[] {
    for (const { resolver, prefix } of this.searchCombinations(prefixes)) {
      const templates = resolver.findAll(path, prefix, partial, details, detailsKey, locals);
      if (templates.length > 0) return templates;
    }
    return [];
  }

  /** @internal */
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

  /** @internal */
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
        `${String(path)} is not a valid path: must be a Resolver (strings are wrapped by PathRegistry.castFileSystemResolvers)`,
      );
    });
  }

  exists(
    path: TemplatePath | string,
    prefixes: string | ReadonlyArray<string>,
    partial: boolean,
    details: LookupDetails,
    detailsKey: unknown,
    locals: ReadonlyArray<string>,
  ): boolean {
    return this.findAll(path, prefixes, partial, details, detailsKey, locals).length > 0;
  }
}
