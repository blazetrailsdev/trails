import { LookupContext } from "./lookup-context.js";
import { PathRegistry } from "./path-registry.js";
import { PathSet } from "./path-set.js";
import type { TemplateResolver } from "./resolver/resolver.js";

export type ViewPathsInput =
  | PathSet
  | string
  | TemplateResolver
  | ReadonlyArray<string | TemplateResolver>;

type DetailValue = ReadonlyArray<string | symbol>;

const EMPTY_VIEW_PATHS = new PathSet();

export interface ViewPathsClass {
  new (...args: unknown[]): unknown;
  readonly name: string;
  isAbstract(): boolean;
  controllerPath(): string;
  /** @internal */
  _prefixesMemo?: string[];
}

export interface ViewPaths {
  constructor: ViewPathsClass;
  /** @internal */
  _lookupContext?: LookupContext;
}

export class ClassMethods {
  static _viewPaths(this: ViewPathsClass): PathSet;
  static _viewPaths(this: ViewPathsClass, paths: PathSet): void;
  static _viewPaths(this: ViewPathsClass, paths?: PathSet): PathSet | void {
    if (paths === undefined) {
      return PathRegistry.getViewPaths(this) ?? EMPTY_VIEW_PATHS;
    }
    PathRegistry.setViewPaths(this, paths);
  }

  /** @internal */
  static _prefixes(this: ViewPathsClass): string[] {
    if (Object.prototype.hasOwnProperty.call(this, "_prefixesMemo")) return this._prefixesMemo!;
    const superclass = Object.getPrototypeOf(this) as ViewPathsClass | null;
    const local = ClassMethods.localPrefixes.call(this);
    return (this._prefixesMemo =
      !superclass || typeof superclass.isAbstract !== "function" || superclass.isAbstract()
        ? local
        : [...local, ...ClassMethods._prefixes.call(superclass)]);
  }

  /** @internal */
  static _buildViewPaths(this: ViewPathsClass, paths: ViewPathsInput): PathSet {
    if (paths instanceof PathSet) return paths;
    const list = Array.isArray(paths)
      ? (paths as ReadonlyArray<string | TemplateResolver>)
      : [paths as string | TemplateResolver];
    return new PathSet(PathRegistry.castFileSystemResolvers([...list]));
  }

  static appendViewPath(this: ViewPathsClass, path: ViewPathsInput): void {
    writeInternalViewPaths.call(
      this,
      readViewPaths.call(this).plus(ClassMethods._buildViewPaths.call(this, path)),
    );
  }

  static prependViewPath(this: ViewPathsClass, path: ViewPathsInput): void {
    writeInternalViewPaths.call(
      this,
      ClassMethods._buildViewPaths.call(this, path).plus(readViewPaths.call(this)),
    );
  }

  static viewPaths(this: ViewPathsClass): PathSet;
  static viewPaths(this: ViewPathsClass, paths: ViewPathsInput): void;
  static viewPaths(this: ViewPathsClass, paths?: ViewPathsInput): PathSet | void {
    if (paths === undefined) return readInternalViewPaths.call(this);
    writeInternalViewPaths.call(this, ClassMethods._buildViewPaths.call(this, paths));
  }

  /** @internal */
  static localPrefixes(this: ViewPathsClass): string[] {
    return [this.controllerPath()];
  }
}

const readInternalViewPaths: (this: ViewPathsClass) => PathSet = ClassMethods._viewPaths;
const writeInternalViewPaths: (this: ViewPathsClass, paths: PathSet) => void =
  ClassMethods._viewPaths;
const readViewPaths: (this: ViewPathsClass) => PathSet = ClassMethods.viewPaths;

/** @internal */
export function _prefixes(this: ViewPaths): string[] {
  return ClassMethods._prefixes.call(this.constructor);
}

export function lookupContext(this: ViewPaths): LookupContext {
  this._lookupContext ??= new LookupContext(
    readInternalViewPaths.call(this.constructor),
    detailsForLookup.call(this),
    _prefixes.call(this),
  );
  return this._lookupContext;
}

export function detailsForLookup(this: ViewPaths): Record<string, DetailValue> {
  return {};
}

export function appendViewPath(this: ViewPaths, path: ViewPathsInput): void {
  lookupContext
    .call(this)
    .appendViewPaths(ClassMethods._buildViewPaths.call(this.constructor, path).toArray());
}

export function prependViewPath(this: ViewPaths, path: ViewPathsInput): void {
  lookupContext
    .call(this)
    .prependViewPaths(ClassMethods._buildViewPaths.call(this.constructor, path).toArray());
}

export function templateExists(
  this: ViewPaths,
  name: string,
  prefixes: ReadonlyArray<string> = [],
  partial = false,
  keys: ReadonlyArray<string> = [],
  options: Record<string, DetailValue> = {},
): boolean {
  return lookupContext.call(this).isExists(name, prefixes, partial, keys, options);
}

export function isAnyTemplates(
  this: ViewPaths,
  name: string,
  prefixes: ReadonlyArray<string> = [],
  partial = false,
): boolean {
  return lookupContext.call(this).isAny(name, prefixes, partial);
}

export function viewPaths(this: ViewPaths): PathSet {
  return lookupContext.call(this).viewPaths;
}

export function formats(this: ViewPaths): DetailValue;
export function formats(this: ViewPaths, values: DetailValue | null): void;
export function formats(this: ViewPaths, values?: DetailValue | null): DetailValue | void {
  if (values === undefined) return lookupContext.call(this).formats;
  lookupContext.call(this).formats = values;
}

export function locale(this: ViewPaths): string | symbol | null;
export function locale(this: ViewPaths, value: string | symbol | null): void;
export function locale(
  this: ViewPaths,
  value?: string | symbol | null,
): string | symbol | null | void {
  if (value === undefined) return lookupContext.call(this).locale;
  lookupContext.call(this).locale = value;
}
