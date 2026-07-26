/**
 * ActionView::ViewPaths
 *
 * The module controllers include to own a set of view paths. The class side
 * (`ClassMethods`) keeps the per-class path set in `ActionView::PathRegistry`
 * and computes `_prefixes` by walking the superclass chain up to the first
 * abstract ancestor; the instance side is a thin layer over the controller's
 * `LookupContext`, which Rails builds lazily from the class's view paths,
 * `details_for_lookup` and `_prefixes`.
 *
 * Mixed in per CLAUDE.md's module convention: `this`-typed functions assigned
 * onto the host class (instance side) and onto the host's constructor
 * (`ClassMethods` statics).
 */

import { LookupContext } from "./lookup-context.js";
import { PathRegistry } from "./path-registry.js";
import { PathSet } from "./path-set.js";
import type { TemplateResolver } from "./resolver/resolver.js";

/** Anything `_build_view_paths` accepts: a PathSet, resolvers, or path strings. */
export type ViewPathsInput =
  | PathSet
  | string
  | TemplateResolver
  | ReadonlyArray<string | TemplateResolver>;

type DetailValue = ReadonlyArray<string | symbol>;

/**
 * The class-side state `ViewPaths::ClassMethods` needs from its host —
 * `AbstractController::Base`'s `abstract?` and `controller_path`. Structural
 * so ActionView doesn't have to depend on ActionPack.
 */
export interface ViewPathsClass {
  new (...args: unknown[]): unknown;
  readonly name: string;
  isAbstract(): boolean;
  controllerPath(): string;
  /** Memo for `_prefixes` — Rails' `@_prefixes`. @internal */
  _prefixesMemo?: string[];
}

/** The instance-side host: a controller whose constructor carries ClassMethods. */
export interface ViewPaths {
  constructor: ViewPathsClass;
  /** Memo for `lookup_context` — Rails' `@_lookup_context`. @internal */
  _lookupContext?: LookupContext;
}

/**
 * `_view_paths` — the registry-backed path set for `cls`. Falls back to an
 * empty set for a class that never registered one (Rails registers it from
 * `included do`, which has no TS equivalent).
 */
function registeredViewPaths(cls: ViewPathsClass): PathSet {
  const paths = PathRegistry.getViewPaths(cls);
  return paths instanceof PathSet ? paths : new PathSet(paths ?? []);
}

/** `_build_view_paths(paths)` — resolvers stay, strings become resolvers. */
function buildViewPaths(paths: ViewPathsInput): PathSet {
  if (paths instanceof PathSet) return paths;
  const list = Array.isArray(paths)
    ? (paths as ReadonlyArray<string | TemplateResolver>)
    : [paths as string | TemplateResolver];
  return new PathSet(PathRegistry.castFileSystemResolvers([...list]));
}

/**
 * `_prefixes` — this class's local prefixes plus every non-abstract ancestor's,
 * nearest first. Memoized per class (Rails' `@_prefixes`).
 */
function computePrefixes(cls: ViewPathsClass): string[] {
  if (Object.prototype.hasOwnProperty.call(cls, "_prefixesMemo")) {
    return cls._prefixesMemo!;
  }
  const superclass = Object.getPrototypeOf(cls) as ViewPathsClass | null;
  const local = ClassMethods.localPrefixes.call(cls);
  const prefixes =
    !superclass || typeof superclass.isAbstract !== "function" || superclass.isAbstract()
      ? local
      : [...local, ...computePrefixes(superclass)];
  cls._prefixesMemo = prefixes;
  return prefixes;
}

/**
 * `ViewPaths::ClassMethods`. Every method is `this`-typed on the host class,
 * so assigning them as statics (`static viewPaths = ClassMethods.viewPaths`)
 * resolves `this` to the concrete subclass at call time — which is what makes
 * the PathRegistry lookup and the `_prefixes` walk inheritance-aware.
 */
export class ClassMethods {
  /** `_view_paths` / `_view_paths=` — the registry-backed path set. */
  static _viewPaths(this: ViewPathsClass): PathSet;
  static _viewPaths(this: ViewPathsClass, paths: PathSet): void;
  static _viewPaths(this: ViewPathsClass, paths?: PathSet): PathSet | void {
    if (paths === undefined) return registeredViewPaths(this);
    PathRegistry.setViewPaths(this, paths);
  }

  /** @internal */
  static _prefixes(this: ViewPathsClass): string[] {
    return computePrefixes(this);
  }

  /** @internal */
  static _buildViewPaths(this: ViewPathsClass, paths: ViewPathsInput): PathSet {
    return buildViewPaths(paths);
  }

  /** Append a path to the list of view paths for this controller. */
  static appendViewPath(this: ViewPathsClass, path: ViewPathsInput): void {
    PathRegistry.setViewPaths(this, registeredViewPaths(this).plus(buildViewPaths(path)));
  }

  /** Prepend a path to the list of view paths for this controller. */
  static prependViewPath(this: ViewPathsClass, path: ViewPathsInput): void {
    PathRegistry.setViewPaths(this, buildViewPaths(path).plus(registeredViewPaths(this)));
  }

  /**
   * `view_paths` / `view_paths=` — a list of all of the default view paths for
   * this controller. The writer processes its argument into a PathSet.
   */
  static viewPaths(this: ViewPathsClass): PathSet;
  static viewPaths(this: ViewPathsClass, paths: ViewPathsInput): void;
  static viewPaths(this: ViewPathsClass, paths?: ViewPathsInput): PathSet | void {
    if (paths === undefined) return registeredViewPaths(this);
    PathRegistry.setViewPaths(this, buildViewPaths(paths));
  }

  /**
   * Override this in your controller to change the prefixes used to find
   * views. Prefixes defined here are still added to parents' `_prefixes`.
   * @internal
   */
  static localPrefixes(this: ViewPathsClass): string[] {
    return [this.controllerPath()];
  }
}

/** The prefixes used in `render "foo"` shortcuts. @internal */
export function _prefixes(this: ViewPaths): string[] {
  return computePrefixes(this.constructor);
}

/**
 * LookupContext is the object responsible for holding all information required
 * for looking up templates, i.e. view paths and details.
 */
export function lookupContext(this: ViewPaths): LookupContext {
  this._lookupContext ??= new LookupContext(
    registeredViewPaths(this.constructor),
    detailsForLookup.call(this),
    _prefixes.call(this),
  );
  return this._lookupContext;
}

export function detailsForLookup(this: ViewPaths): Record<string, DetailValue> {
  return {};
}

/** Append a path to the list of view paths for the current LookupContext. */
export function appendViewPath(this: ViewPaths, path: ViewPathsInput): void {
  lookupContext.call(this).appendViewPaths(buildViewPaths(path).toArray());
}

/** Prepend a path to the list of view paths for the current LookupContext. */
export function prependViewPath(this: ViewPaths, path: ViewPathsInput): void {
  lookupContext.call(this).prependViewPaths(buildViewPaths(path).toArray());
}

// `delegate :template_exists?, :any_templates?, :view_paths, :formats,
//  :formats=, :locale, :locale=, to: :lookup_context`

export function isTemplateExists(
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
