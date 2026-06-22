import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "../base.js";
import { Relation } from "../relation.js";
import { Default } from "./default.js";

/**
 * Mirrors `ActiveRecord::AttributeMethods::ClassMethods::RESTRICTED_CLASS_METHODS`
 * (`%w(private public protected allocate new name superclass)`), plus `relation`:
 * Rails reserves the private `AR::Base#relation`, which trails names
 * `_buildUnscopedRelation`, so the public `relation` name stays reserved here.
 */
const RESTRICTED_CLASS_METHODS = new Set([
  "private",
  "public",
  "protected",
  "allocate",
  "new",
  "name",
  "superclass",
  "relation",
]);

/**
 * Mirrors `ActiveRecord::AttributeMethods::ClassMethods#dangerous_class_method?`:
 * a name is dangerous if it is in `RESTRICTED_CLASS_METHODS` or if AR::Base (or
 * one of its ancestor classes) defines a class method with that name that is not
 * inherited from `Object`/`Function`. Class methods defined on subclasses
 * (existing scopes, user class methods) and Kernel methods are not dangerous —
 * the walk starts at `Base`, never the model subclass.
 */
function isDangerousClassMethod(name: string): boolean {
  if (RESTRICTED_CLASS_METHODS.has(name)) return true;
  let klass: any = Base;
  while (klass && klass !== Function.prototype && klass !== Object.prototype) {
    if (Object.prototype.hasOwnProperty.call(klass, name)) return true;
    klass = Object.getPrototypeOf(klass);
  }
  return false;
}

/**
 * Mirrors `method_defined_within?(name, Relation)`: true when `Relation`
 * defines an instance method with this name that is not inherited from `Object`.
 */
function isRelationInstanceMethod(name: string): boolean {
  let proto: any = Relation.prototype;
  while (proto && proto !== Object.prototype) {
    if (Object.prototype.hasOwnProperty.call(proto, name)) return true;
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}

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

  if (typeof fn !== "function") {
    throw new ArgumentError("The scope body needs to be callable.");
  }

  if (isDangerousClassMethod(name)) {
    throw new ArgumentError(
      `You tried to define a scope named "${name}" on the model ` +
        `"${modelClass.name}", but Active Record already defined a class ` +
        `method with the same name.`,
    );
  }

  if (isRelationInstanceMethod(name)) {
    throw new ArgumentError(
      `You tried to define a scope named "${name}" on the model ` +
        `"${modelClass.name}", but ActiveRecord::Relation already defined an ` +
        `instance method with the same name.`,
    );
  }

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
      return this.all()[name](...args);
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
