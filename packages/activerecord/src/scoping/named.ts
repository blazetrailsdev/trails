import type { Base } from "../base.js";
import type { Relation } from "../relation.js";

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
  extension?: Record<string, Function>,
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
  _defaultScope?: (rel: any) => any;
  all?(): any;
  relation?(): any;
}

/**
 * Mirrors: ActiveRecord::Scoping::Named::ClassMethods#scope_for_association
 */
export function scopeForAssociation(this: NamedHost, scope?: any): any {
  const rel = scope ?? this.relation?.() ?? this.all?.();
  if (this.currentScope && !this.currentScope.isEmptyScope) {
    return defaultScoped.call(this, rel);
  }
  return rel;
}

/**
 * Mirrors: ActiveRecord::Scoping::Named::ClassMethods#default_scoped
 */
export function defaultScoped(this: NamedHost, scope?: any): any {
  const rel = scope ?? this.relation?.() ?? this.all?.();
  if (this._defaultScope) {
    return this._defaultScope(rel);
  }
  return rel;
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
