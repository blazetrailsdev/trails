import type { Base } from "../base.js";
import type { Relation } from "../relation.js";
import { Default } from "./default.js";

/**
 * Named scope handling — defines named scopes on model classes
 * and registers them as static methods.
 *
 * Mirrors: ActiveRecord::Scoping::Named
 */

/**
 * Define a named scope on a model class. Called via `Base.scope(name, body)`.
 *
 * Mirrors: ActiveRecord::Scoping::Named::ClassMethods#scope
 */
export function scope<T extends typeof Base>(
  this: T,
  name: string,
  fn: (rel: Relation<InstanceType<T>>, ...args: any[]) => Relation<any>,
  extension?: Record<string, (...args: any[]) => any>,
): void {
  const modelClass = this as any;
  if (!Object.prototype.hasOwnProperty.call(modelClass, "_scopes")) {
    modelClass._scopes = new Map(modelClass._scopes);
  }
  modelClass._scopes.set(name, fn);

  if (extension) {
    if (!Object.prototype.hasOwnProperty.call(modelClass, "_scopeExtensions")) {
      modelClass._scopeExtensions = new Map(modelClass._scopeExtensions);
    }
    modelClass._scopeExtensions.set(name, extension);
  }

  Object.defineProperty(modelClass, name, {
    value: function (...args: any[]) {
      return (this as any).all()[name](...args);
    },
    writable: true,
    configurable: true,
  });
}

interface NamedHost {
  currentScope?: any;
  defaultScopes?: import("./default.js").DefaultScope[];
  // Rails' `relation` (core.rb) — a pristine Relation with the STI type
  // condition but neither current_scope nor default_scope applied. It is the
  // default `scope` argument for both methods below.
  _buildUnscopedRelation?(): any;
}

/**
 * Mirrors: ActiveRecord::Scoping::Named::ClassMethods#scope_for_association —
 * `current_scope&.empty_scope? ? scope : default_scoped(scope)`. The base
 * `scope` ignores current_scope; default_scope is applied unless an enclosing
 * current_scope is itself an empty scope.
 */
export function scopeForAssociation(this: NamedHost, scope?: any): any {
  const rel = scope ?? this._buildUnscopedRelation?.();
  if (this.currentScope?.isEmptyScope) {
    return rel;
  }
  return defaultScoped.call(this, rel);
}

/**
 * Mirrors: ActiveRecord::Scoping::Named::ClassMethods#default_scoped —
 * `build_default_scope(scope, all_queries: all_queries) || scope`
 */
export function defaultScoped(
  this: NamedHost,
  scope?: any,
  options?: { allQueries?: boolean | null },
): any {
  const rel = scope ?? this._buildUnscopedRelation?.();
  return Default.buildDefaultScope(this as any, () => rel, options?.allQueries) ?? rel;
}

/**
 * Mirrors: ActiveRecord::Scoping::Named::ClassMethods#default_extensions
 */
export function defaultExtensions(this: NamedHost): any[] {
  const scope = scopeForAssociation.call(this) ?? defaultScoped.call(this);
  return scope?.extensions ?? [];
}

/**
 * Module methods wired onto Base as static methods via `extend()` in base.ts.
 * Mirrors Rails' `ActiveSupport::Concern#ClassMethods` convention.
 */
export const ClassMethods = {
  scope,
  scopeForAssociation,
  defaultScoped,
  defaultExtensions,
};
