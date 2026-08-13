import { ArgumentError } from "@blazetrails/activemodel";
import type { Base } from "../base.js";
import type { Relation } from "../relation.js";
import { ScopeRegistry, isScopeAttributes as baseIsScopeAttributes } from "../scoping.js";

/**
 * Manages evaluating and applying default scopes.
 *
 * Mirrors: ActiveRecord::Scoping::Default::DefaultScope
 */
export class DefaultScope {
  readonly scope: (rel: any) => any;
  readonly allQueries: boolean;

  constructor(scope: (rel: any) => any, allQueries = false) {
    this.scope = scope;
    this.allQueries = allQueries;
  }
}

/**
 * Default scope handling — applies default_scope to all queries
 * and provides unscoped to bypass it.
 *
 * Mirrors: ActiveRecord::Scoping::Default
 */
export class Default {
  /**
   * Build the default scope for a model class, applying all accumulated
   * default_scope declarations in order. Skips scopes that don't match
   * the all_queries flag. Returns undefined when inside an evaluate_default_scope
   * call (recursion guard), matching Rails' nil return from build_default_scope.
   *
   * Mirrors: ActiveRecord::Scoping::Default::ClassMethods#build_default_scope
   * @internal
   */
  static buildDefaultScope(
    this: any,
    relation: any,
    { allQueries }: { allQueries?: boolean | null } = {},
  ): any {
    if (this.abstractClass) return undefined;

    // Rails default.rb:145-152 — memoize the `default_scope_override` boolean on
    // first build (the class_attribute starts nil): does this class own a
    // `default_scope` method override rather than only inheriting the macro?
    // Written through the class-attribute setter (`self.default_scope_override = `).
    if (this.defaultScopeOverride == null) {
      this.defaultScopeOverride = hasDefaultScopeOverride(this);
    }

    // Rails: when the model defines its own `default_scope` method (the
    // proc/method form, `def self.default_scope`) rather than registering via
    // the `default_scope { }` macro, call that method with the base relation
    // installed as the current scope (`relation.scoping { default_scope }`).
    const override = this.defaultScopeOverride ? defaultScopeMethod(this) : undefined;
    if (override) {
      return evaluateDefaultScope.call(this, () => {
        const prev = ScopeRegistry.currentScope(this);
        this.setCurrentScope(relation);
        try {
          // Return the override's value unchanged (nullish included), mirroring
          // Rails' `relation.scoping { default_scope }`; the `|| scope` fallback
          // lives at the call site (`?? buildBase()` / `?? rel`).
          return override.call(this);
        } finally {
          this.setCurrentScope(prev);
        }
      });
    }

    const scopes: DefaultScope[] = this.defaultScopes ?? [];
    if (scopes.length === 0) return undefined;

    return evaluateDefaultScope.call(this, () => {
      let rel = relation;
      for (const scopeObj of scopes) {
        if (isExecuteScope(allQueries, scopeObj)) {
          const result = scopeObj.scope(rel);
          if (result != null) rel = result;
        }
      }
      return rel;
    });
  }

  /**
   * Returns a scope for the model without the previously set scopes; with a
   * block, runs it with that relation installed as the current scope.
   *
   * Mirrors: ActiveRecord::Scoping::Default::ClassMethods#unscoped
   * (default.rb:17-26) — `block_given? ? relation.scoping(&block) : relation`.
   * trails spells Rails' `relation` `_buildUnscopedRelation` (see named.ts).
   * @internal
   */
  static unscoped(this: any, block?: () => any): any {
    return block ? this._buildUnscopedRelation().scoping(block) : this._buildUnscopedRelation();
  }
}

/**
 * Return the model's own `default_scope` method override, or undefined when it
 * only inherits the `default_scope { }` macro from Base.
 *
 * Mirrors Rails' `default_scope_override` check
 * (`!Base.is_a?(method(:default_scope).owner)`): walk the static prototype
 * chain and find the class that owns `defaultScope`; if that owner is Base
 * (i.e. the inherited macro), there is no override.
 * @internal
 */
function defaultScopeMethod(modelClass: any): ((this: any) => any) | undefined {
  let klass = modelClass;
  while (typeof klass === "function") {
    if (Object.prototype.hasOwnProperty.call(klass, "defaultScope")) {
      return klass.defaultScope === defaultScope ? undefined : klass.defaultScope;
    }
    klass = Object.getPrototypeOf(klass);
  }
  return undefined;
}

/**
 * Whether the model defines its own `default_scope` method override.
 *
 * Mirrors the `respond_to?(:default_scope)` clause of
 * `Scoping::Default::ClassMethods#scope_attributes?`.
 * @internal
 */
export function hasDefaultScopeOverride(modelClass: any): boolean {
  return defaultScopeMethod(modelClass) !== undefined;
}

/**
 * Define a default scope applied to queries for this model.
 * Multiple calls accumulate; all scopes are merged.
 *
 * Mirrors: ActiveRecord::Scoping::Default::ClassMethods#default_scope
 */
export function defaultScope<T extends typeof Base>(
  this: T,
  scope: (rel: Relation<InstanceType<T>>) => Relation<any>,
  options?: { allQueries?: boolean },
): void;
export function defaultScope<T extends typeof Base>(
  this: T,
  scope: (rel: Relation<InstanceType<T>>) => Relation<any>,
  allQueries?: boolean,
): void;
export function defaultScope<T extends typeof Base>(
  this: T,
  scope: (rel: Relation<InstanceType<T>>) => Relation<any>,
  optionsOrAllQueries?: { allQueries?: boolean } | boolean,
): void {
  // Rails: `scope.is_a?(Relation) || !scope.respond_to?(:call)`. A trails
  // Relation is a non-callable object, so the callable check alone covers both
  // (an eager `Model.where(...)` relation included).
  if (typeof scope !== "function") {
    throw new ArgumentError(
      "Support for calling #default_scope without a block is removed. For " +
        "example instead of `default_scope where(color: 'red')`, please use " +
        "`default_scope { where(color: 'red') }`. (Alternatively you can just " +
        "redefine self.default_scope.)",
    );
  }

  const allQueries =
    typeof optionsOrAllQueries === "boolean"
      ? optionsOrAllQueries
      : (optionsOrAllQueries?.allQueries ?? false);

  const scopeObj = new DefaultScope(scope as (rel: any) => any, allQueries);
  const existing: DefaultScope[] = (this as any).defaultScopes ?? [];
  (this as any).defaultScopes = [...existing, scopeObj];
}

/**
 * Return a relation that bypasses the default scope. With a block, runs
 * the block with the unscoped relation installed as the current scope so
 * any queries inside also bypass default scopes — matching Rails'
 * `unscoped { ... }` / `unscoped(&block)` form.
 *
 * Mirrors: ActiveRecord::Scoping::Default::ClassMethods#unscoped —
 * `block_given? ? relation.scoping(&block) : relation`
 */
export function unscoped<T extends typeof Base>(this: T): Relation<InstanceType<T>>;
export function unscoped<T extends typeof Base, R>(
  this: T,
  block: () => R | Promise<R>,
): Promise<R>;
export function unscoped<T extends typeof Base, R>(
  this: T,
  block?: () => R | Promise<R>,
): Relation<InstanceType<T>> | Promise<R> {
  return Default.unscoped.call(this, block) as Relation<InstanceType<T>> | Promise<R>;
}

/**
 * Are there attributes associated with this scope? Rails' third arm,
 * `respond_to?(:default_scope)`, covers only the method-form override
 * (`def self.default_scope`) — the `default_scope { }` macro is private, so it
 * registers in `defaultScopes` instead.
 *
 * Mirrors: ActiveRecord::Scoping::Default::ClassMethods#scope_attributes?
 */
export function isScopeAttributes(this: {
  currentScope?(skipInheritedScope?: boolean): unknown;
  defaultScopes?: DefaultScope[];
}): boolean {
  return (
    baseIsScopeAttributes.call(this) ||
    (this.defaultScopes?.length ?? 0) > 0 ||
    hasDefaultScopeOverride(this)
  );
}

/**
 * Mirrors: ActiveRecord::Scoping::Default::ClassMethods#default_scopes?
 */
export function isDefaultScopes(
  this: { defaultScopes?: DefaultScope[] },
  options?: { allQueries?: boolean },
): boolean {
  const scopes = this.defaultScopes ?? [];
  if (options?.allQueries) {
    return scopes.some((s) => s.allQueries);
  }
  return scopes.length > 0;
}

/**
 * Mirrors: Scoping::Default#execute_scope?. Returns true when the default
 * scope should be applied, based on the all_queries flag.
 * @internal
 */
function isExecuteScope(
  allQueries: boolean | null | undefined,
  defaultScopeObj: DefaultScope,
): boolean {
  return allQueries == null || (!!allQueries && defaultScopeObj.allQueries);
}

/**
 * Mirrors: Scoping::Default::ClassMethods#ignore_default_scope?
 * (default.rb:181-183) — keyed off `base_class`, so an STI subtree shares the
 * one recursion guard, and WITHOUT `skip_inherited_scope`.
 * @internal
 */
function isIgnoreDefaultScope(this: any): boolean {
  return !!ScopeRegistry.ignoreDefaultScope(this.baseClass);
}

/**
 * Mirrors: Scoping::Default::ClassMethods#ignore_default_scope=
 * (default.rb:185-187).
 * @internal
 */
function setIgnoreDefaultScope(this: any, ignore: boolean | null): void {
  ScopeRegistry.setIgnoreDefaultScope(this.baseClass, ignore);
}

/**
 * Mirrors: Scoping::Default#evaluate_default_scope. Temporarily sets
 * ignore_default_scope to true while yielding so nested calls don't re-apply
 * the default scope recursively. Returns undefined when already ignoring
 * (matches Rails' nil return from evaluate_default_scope, default.rb:192-201).
 * @internal
 */
function evaluateDefaultScope(this: any, fn: () => unknown): unknown {
  if (isIgnoreDefaultScope.call(this)) return undefined;

  try {
    setIgnoreDefaultScope.call(this, true);
    return fn();
  } finally {
    setIgnoreDefaultScope.call(this, false);
  }
}
