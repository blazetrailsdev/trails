/**
 * Delegation — delegates named scope calls on Relations via a Proxy.
 *
 * wrapWithScopeProxy creates a Proxy that intercepts missing property
 * access and dispatches named scopes from the model's scope registry.
 * Query methods (where/order/limit) are already defined on Relation
 * and don't go through the Proxy.
 *
 * Mirrors: ActiveRecord::Delegation
 */

import type { Base } from "../base.js";

/**
 * The Delegation module interface.
 *
 * Mirrors: ActiveRecord::Delegation
 */
export interface Delegation {
  delegatedClasses: Set<Function>;
}

/**
 * ClassSpecificRelation — a relation subclass tied to a specific model.
 * In Rails this is dynamically created per model class. In our codebase,
 * the Proxy handles this transparently.
 *
 * Mirrors: ActiveRecord::Delegation::ClassSpecificRelation
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClassSpecificRelation {}

/**
 * GeneratedRelationMethods — container for dynamically generated
 * relation methods (e.g., scopes that are compiled into methods).
 *
 * Mirrors: ActiveRecord::Delegation::GeneratedRelationMethods
 */
export class GeneratedRelationMethods {
  private _methods: Map<string, Function> = new Map();

  generate(name: string, fn: Function): void {
    this._methods.set(name, fn);
  }

  get(name: string): Function | undefined {
    return this._methods.get(name);
  }

  has(name: string): boolean {
    return this._methods.has(name);
  }
}

/**
 * DelegateCache — helper for caching delegation lookups per model class.
 * Currently provided to match the Rails module structure; not yet wired
 * into the Proxy delegation path.
 *
 * Mirrors: ActiveRecord::Delegation::DelegateCache
 */
export class DelegateCache {
  private _cache: Map<Function, Set<string>> = new Map();

  initialize(modelClass: Function): void {
    if (!this._cache.has(modelClass)) {
      this._cache.set(modelClass, new Set());
    }
  }

  hasDelegated(modelClass: Function, method: string): boolean {
    return this._cache.get(modelClass)?.has(method) ?? false;
  }

  register(modelClass: Function, method: string): void {
    this.initialize(modelClass);
    this._cache.get(modelClass)!.add(method);
  }
}

/**
 * Wrap a Relation in a Proxy that delegates named scope lookups
 * to the model's scope registry.
 *
 * Constrained to `object` because Relation._modelClass is private;
 * internal access uses `any` casts.
 */
const _delegatedClasses = new Set<Function>();
const _uncacheableMethods = new Set<string>(["to_a", "to_ary", "records", "inspect"]);
const _delegateCache = new DelegateCache();

export function delegatedClasses(): Set<Function> {
  return _delegatedClasses;
}

export function uncacheableMethods(): Set<string> {
  return _uncacheableMethods;
}

export function delegateBaseMethods(klass: Function): void {
  _delegatedClasses.add(klass);
  _delegateCache.initialize(klass);
}

export function relationDelegateClass(klass: Function): Function {
  _delegatedClasses.add(klass);
  return klass;
}

export function initializeRelationDelegateCache(): void {
  _delegateCache.initialize(Object);
}

const _generatedMethodsByModel = new WeakMap<Function, GeneratedRelationMethods>();

function generatedMethodsFor(modelClass: Function): GeneratedRelationMethods {
  let methods = _generatedMethodsByModel.get(modelClass);
  if (!methods) {
    methods = new GeneratedRelationMethods();
    _generatedMethodsByModel.set(modelClass, methods);
  }
  return methods;
}

export function generateRelationMethod(modelClass: Function, name: string, fn: Function): void {
  generatedMethodsFor(modelClass).generate(name, fn);
}

export function generateMethod(name: string): Function {
  return function (this: any, ...args: any[]) {
    return this[name]?.(...args);
  };
}

export function name(): string {
  return "Delegation";
}

export function wrapWithScopeProxy<T extends object>(rel: T): T {
  return new Proxy(rel, {
    get(target: any, prop: string | symbol, receiver: any) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop === "symbol") return value;
      if (value !== undefined) return value;
      if (prop in target) return value;

      const modelClass = target._modelClass as typeof Base;

      // Check generated relation methods scoped to this model (mirrors Rails' GeneratedRelationMethods)
      const genMethods = _generatedMethodsByModel.get(modelClass as any);
      if (genMethods?.has(prop as string)) {
        const fn = genMethods.get(prop as string)!;
        return (...args: any[]) => fn.apply(target, args);
      }
      if (modelClass._scopes.has(prop as string)) {
        return (...args: any[]) => {
          const scopeFn = modelClass._scopes.get(prop as string)!;
          const result = scopeFn(target, ...args);
          const extensions = modelClass._scopeExtensions?.get(prop as string);
          if (extensions && result && typeof result === "object") {
            for (const [name, fn] of Object.entries(extensions)) {
              (result as any)[name] = fn.bind(result);
            }
          }
          return result;
        };
      }
      return value;
    },
  });
}
