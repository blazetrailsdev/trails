import { ArgumentError } from "@blazetrails/activemodel";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { ActiveRecordError } from "../errors.js";
import type { Base } from "../base.js";

let _base: typeof Base | undefined;

/** @internal */
export function _registerBase(base: typeof Base): void {
  _base = base;
}

function baseClass(): typeof Base {
  if (!_base) throw new ActiveRecordError("ActiveRecord::Base has not finished loading");
  return _base;
}

import { Relation } from "../relation.js";
import { Default } from "./default.js";
import { generateRelationMethod } from "../relation/delegation.js";

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

const INTRINSIC_FUNCTION_PROPS = new Set(["length", "name", "prototype"]);

export function isDangerousClassMethod(name: string): boolean {
  if (RESTRICTED_CLASS_METHODS.has(name)) return true;
  if (INTRINSIC_FUNCTION_PROPS.has(name)) return false;
  let klass: any = baseClass();
  while (klass && klass !== Function.prototype && klass !== Object.prototype) {
    if (Object.prototype.hasOwnProperty.call(klass, name)) return true;
    klass = Object.getPrototypeOf(klass);
  }
  return false;
}

/** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
export function isRelationInstanceMethod(name: string): boolean {
  let proto: any = Relation.prototype;
  while (proto && proto !== Object.prototype) {
    if (Object.prototype.hasOwnProperty.call(proto, name)) return true;
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}

/** @noRailsEquivalent PERMANENT */
export type ScopeMethod<T extends Base, A extends unknown[] = []> = (...args: A) => Relation<T>;

/** @noRailsEquivalent PERMANENT */
export type ScopeOn<T extends Base, M extends Base, A extends unknown[] = []> = [T] extends [M]
  ? ScopeMethod<T, A>
  : never;

/** @missingRailsArgs generate_relation_method — CONVERGEABLE converge-relation-delegation-helper-layer */
export function scope<T extends typeof Base>(
  this: T,
  name: string,
  body: ((this: Relation<InstanceType<T>>, ...args: any[]) => any) | { call(...args: any[]): any },
  block?: Record<string, (...args: any[]) => any>,
): void {
  const modelClass = this as any;

  if (!rbObjRespondTo(body, "call")) {
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

  const extension = block;

  let method: (this: any, ...args: any[]) => any;
  if (typeof body === "function") {
    method = function (this: any, ...args: any[]) {
      let scope = this.all()._execScope(...args, body);
      if (extension) scope = scope.extending(extension);
      return scope;
    };
  } else {
    method = function (this: any, ...args: any[]) {
      let scope = (body as { call(...args: any[]): any }).call(...args) || this.all();
      if (extension) scope = scope.extending(extension);
      return scope;
    };
  }
  Object.defineProperty(modelClass, name, { value: method, writable: true, configurable: true });

  generateRelationMethod(modelClass, name, function (this: any, ...args: any[]) {
    const model = this._model;
    return model[name].apply(Object.create(model, { all: { value: () => this } }), args);
  });
}

interface NamedHost {
  currentScope?(skipInheritedScope?: boolean): any;
  defaultScopes?: import("./default.js").DefaultScope[];
  relation?(): any;
}

export function scopeForAssociation(this: NamedHost, scope?: any): any {
  const rel = scope ?? this.relation?.();
  if (this.currentScope?.()?.isEmptyScope) {
    return rel;
  }
  return defaultScoped.call(this, rel);
}

export function defaultScoped(this: NamedHost, options: { allQueries?: boolean | null }): any;
export function defaultScoped(
  this: NamedHost,
  scope?: any,
  options?: { allQueries?: boolean | null },
): any;
export function defaultScoped(
  this: NamedHost,
  scopeOrOptions?: any,
  options?: { allQueries?: boolean | null },
): any {
  const kwargsOnly =
    scopeOrOptions != null && Object.getPrototypeOf(scopeOrOptions) === Object.prototype;
  const scope = (kwargsOnly ? undefined : scopeOrOptions) ?? this.relation?.();
  const opts = kwargsOnly ? (scopeOrOptions as { allQueries?: boolean | null }) : options;
  return Default.buildDefaultScope.call(this, scope, { allQueries: opts?.allQueries }) ?? scope;
}

export function defaultExtensions(this: NamedHost): any[] {
  const scope = scopeForAssociation.call(this) ?? defaultScoped.call(this);
  return scope?.extensions ?? [];
}

export const ClassMethods = {
  scope,
  scopeForAssociation,
  defaultScoped,
  defaultExtensions,
};
