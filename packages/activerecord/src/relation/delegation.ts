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
import { Delegation as ASDelegation } from "@blazetrails/activesupport";
import { ScopeRegistry } from "../scoping.js";

type AnyCallable = (...args: any[]) => any;

/**
 * The Delegation module interface.
 *
 * Mirrors: ActiveRecord::Delegation
 */

export interface Delegation {
  delegatedClasses: Set<typeof Base>;
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
  private _methods: Map<string, AnyCallable> = new Map();

  generate(name: string, fn: AnyCallable): void {
    this._methods.set(name, fn);
  }

  get(name: string): AnyCallable | undefined {
    return this._methods.get(name);
  }

  has(name: string): boolean {
    return this._methods.has(name);
  }

  entries(): IterableIterator<[string, AnyCallable]> {
    return this._methods.entries();
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
  private _cache: Map<typeof Base, Set<string>> = new Map();

  initialize(modelClass: typeof Base): void {
    if (!this._cache.has(modelClass)) {
      this._cache.set(modelClass, new Set());
    }
  }

  hasDelegated(modelClass: typeof Base, method: string): boolean {
    return this._cache.get(modelClass)?.has(method) ?? false;
  }

  register(modelClass: typeof Base, method: string): void {
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
const _delegatedClasses = new Set<typeof Base>();
const _uncacheableMethods = new Set<string>(["to_a", "to_ary", "records", "inspect"]);
const _delegateCache = new DelegateCache();

export function delegatedClasses(): Set<typeof Base> {
  return _delegatedClasses;
}

export function uncacheableMethods(): Set<string> {
  return _uncacheableMethods;
}

export function delegateBaseMethods(klass: typeof Base): void {
  _delegatedClasses.add(klass);
  _delegateCache.initialize(klass);
}

export function relationDelegateClass(klass: typeof Base): typeof Base {
  _delegatedClasses.add(klass);
  return klass;
}

export function initializeRelationDelegateCache(): void {
  for (const klass of _delegatedClasses) {
    _delegateCache.initialize(klass);
  }
}

const _generatedMethodsByModel = new WeakMap<typeof Base, GeneratedRelationMethods>();

function generatedMethodsFor(modelClass: typeof Base): GeneratedRelationMethods {
  let methods = _generatedMethodsByModel.get(modelClass);
  if (!methods) {
    methods = new GeneratedRelationMethods();
    _generatedMethodsByModel.set(modelClass, methods);
  }
  return methods;
}

export function generateRelationMethod(
  modelClass: typeof Base,
  name: string,
  fn: AnyCallable,
): void {
  generatedMethodsFor(modelClass).generate(name, fn);
}

export function generateMethod(name: string): AnyCallable {
  const holder = { model: null } as any;
  ASDelegation.generate(holder, [name], { to: "model", allowNil: true });
  if (typeof holder[name] === "function") return holder[name];
  return function (this: any, ...args: any[]) {
    return this.model?.[name]?.(...args);
  };
}

export function name(): string {
  return "Delegation";
}

/**
 * The curated set of `Array` methods CollectionProxy/Relation delegate to their
 * loaded records, mapped to JS method names.
 *
 * Rails delegates only a curated list via `delegate ... to: :records`
 * (delegation.rb:101) — `to_xml, encode_with, length, each, join, intersect?,
 * [], &, |, +, -, sample, reverse, rotate, compact, in_groups, in_groups_of,
 * to_sentence, to_fs, to_formatted_s, as_json, shuffle, split, slice, index,
 * rindex` — plus the `Enumerable` methods `Relation` mixes in (`map`, `select`,
 * `find`, `any?`, `all?`, `include?`, `inject`, `sort`, `flat_map`, …). Calls
 * outside that surface fall through to `method_missing` → `super` and raise
 * `NoMethodError`.
 *
 * We mirror that boundary: only JS `Array.prototype` methods whose behavior maps
 * to a Rails-reachable method are delegated (e.g. `index` → `indexOf`,
 * `rindex` → `lastIndexOf`). Ruby-only entries (`sample`, `rotate`, `compact`,
 * `in_groups`, `to_sentence`, …) have no JS analogue and are dropped. JS-only
 * methods absent from Rails (`findIndex`, `flat`, `copyWithin`, `fill`, …) are
 * intentionally excluded so they raise like Rails rather than silently
 * succeeding.
 */
const DELEGATED_ARRAY_METHODS = new Set<string>([
  // curated delegate-to-records list (delegation.rb) → JS equivalents
  "forEach", // each
  "join",
  "reverse",
  "slice", // slice / []
  "at", // []
  "indexOf", // index
  "lastIndexOf", // rindex
  "concat", // +
  // Enumerable methods (`Relation` includes Enumerable) with JS analogues
  "map", // map / collect
  "filter", // select
  "find", // detect
  "some", // any?
  "every", // all?
  "includes", // include?
  "reduce", // inject / reduce
  "sort",
  "flatMap", // flat_map
]);

/**
 * Array-method delegation — mirrors Rails' `delegate ... to: :records`
 * (delegation.rb): once a property isn't an own/scope/model method,
 * CollectionProxy/Relation route curated `Array`/`Enumerable` methods through
 * the loaded records (Ruby's method_missing → `to_a` → `Array#<method>`, e.g.
 * `categories.sort`). JS has no blocking IO, so this reads already-loaded
 * records — await the relation/proxy (or `load()`) first for a fresh load —
 * and operates on a copy of the records so Ruby's non-mutating semantics hold
 * (`sort`, not `sort!`).
 *
 * Returns a bound callable when `prop` names a delegated `Array.prototype`
 * method, otherwise `undefined` so the caller can fall through to its own
 * default (and raise for methods Rails would also reject).
 */
export function delegateArrayMethod(
  prop: string,
  records: () => unknown[],
): ((...args: any[]) => unknown) | undefined {
  if (!DELEGATED_ARRAY_METHODS.has(prop)) return undefined;
  const arrayMethod = (Array.prototype as unknown as Record<string, unknown>)[prop];
  if (typeof arrayMethod !== "function") return undefined;
  return (...args: any[]) => (arrayMethod as (...a: any[]) => unknown).apply([...records()], args);
}

/**
 * Async Array-method delegation — same curated set as `delegateArrayMethod`,
 * but forces a load first via `loadRecords()` before applying the Array method.
 * Used for *unloaded* relations/proxies so that `sort`, `map`, etc. are always
 * present (Rails `assert_respond_to` passes on unloaded targets) and calling
 * them hydrates the records, mirroring Rails' `records` → `load` path.
 * JS has no blocking IO, so the load-on-call path must be async.
 *
 * Returns a bound callable when `prop` names a delegated `Array.prototype`
 * method, otherwise `undefined`.
 */
export function delegateArrayMethodAsync(
  prop: string,
  loadRecords: () => Promise<unknown[]>,
): ((...args: any[]) => Promise<unknown>) | undefined {
  if (!DELEGATED_ARRAY_METHODS.has(prop)) return undefined;
  const arrayMethod = (Array.prototype as unknown as Record<string, unknown>)[prop];
  if (typeof arrayMethod !== "function") return undefined;
  return async (...args: any[]) => {
    const records = await loadRecords();
    return (arrayMethod as (...a: any[]) => unknown).apply([...records], args);
  };
}

/**
 * Enumerable-method delegation — Rails' `Relation`/`CollectionProxy`
 * `include Enumerable` plus `delegate ... to: :records` (delegation.rb).
 * All delegated methods here are **async + self-loading**: they are present
 * on an unloaded relation/proxy and force the load themselves via
 * `loadRecords()`, mirroring Rails where `records` → `load` runs before
 * enumeration. JS has no blocking IO, so the load-on-call path is async.
 *
 * Covers two surfaces:
 *   - `partition` — a pure Enumerable method with no JS `Array.prototype`
 *     analogue (returns `[matched, unmatched]` in one pass).
 *   - DELEGATED_ARRAY_METHODS — the curated `delegate ... to: :records` set
 *     (sort, map, join, …). These also have a sync path via `delegateArrayMethod`
 *     used when records are already loaded; this async path covers the
 *     unloaded case and must be checked *before* scope/model-class delegation
 *     in `wrapCollectionProxy` so it routes to the collection cache, not the
 *     underlying relation's records.
 *
 * Returns a bound callable when `prop` names a supported method, otherwise
 * `undefined` so the caller can fall through to its own default.
 */
export function delegateEnumerableMethod(
  prop: string,
  loadRecords: () => Promise<unknown[]>,
): ((...args: any[]) => unknown) | undefined {
  if (prop === "partition") {
    return async (predicate: (value: unknown, index: number) => unknown) => {
      const matched: unknown[] = [];
      const unmatched: unknown[] = [];
      (await loadRecords()).forEach((record, index) => {
        (predicate(record, index) ? matched : unmatched).push(record);
      });
      return [matched, unmatched];
    };
  }
  // DELEGATED_ARRAY_METHODS: async path for unloaded targets.
  return delegateArrayMethodAsync(prop, loadRecords);
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
      if (genMethods?.has(prop)) {
        const fn = genMethods.get(prop)!;
        return (...args: any[]) => fn.apply(target, args);
      }
      if (modelClass._scopes.has(prop)) {
        return (...args: any[]) => {
          const scopeFn = modelClass._scopes.get(prop)!;
          const result = scopeFn(target, ...args);
          const extensions = modelClass._scopeExtensions?.get(prop);
          if (extensions && result && typeof result === "object") {
            // Register the extension as a module on the relation (mirrors Ruby's
            // anonymous-module `extend`) so its methods survive spawning — e.g.
            // `Topic.anonymous_extension.none.one`.
            if (typeof result.extendingBang === "function") {
              result.extendingBang(extensions);
            } else {
              for (const [name, fn] of Object.entries(extensions)) {
                result[name] = fn.bind(result);
              }
            }
          }
          return result;
        };
      }

      // Array-method delegation (sync path) — when already loaded, delegate
      // synchronously against the in-memory records (delegation.rb
      // `delegate ... to: :records`). Checked before the async/enumerable
      // path so a loaded relation uses the fast sync route.
      if (target._loaded) {
        const records = () => target._records ?? [];
        const arrayDelegate = delegateArrayMethod(prop, records);
        if (arrayDelegate) return arrayDelegate;
      }

      // Enumerable-method delegation — async + self-loading. Covers `partition`
      // and all DELEGATED_ARRAY_METHODS on unloaded relations (mirrors Rails'
      // `records` → `load` path). Always present so `assert_respond_to` passes.
      // `toArray()` forces a load and returns the rows.
      const enumerableDelegate = delegateEnumerableMethod(prop, () => target.toArray());
      if (enumerableDelegate) return enumerableDelegate;

      // Rails delegation.rb:118-131 (ClassSpecificRelation#method_missing):
      // a method the relation doesn't define but the model class does is
      // delegated via `scoping { model.public_send(method, ...) }`, so the
      // class method (and any bare scope calls inside it) honors this relation
      // as the current scope. Sync methods (returning a Relation) restore the
      // scope immediately so the result is directly chainable; async methods
      // (returning a Promise) defer restoration until the promise settles,
      // mirroring Rails' synchronous block-scoping across the full body.
      const classMethod = (modelClass as any)[prop];
      if (typeof classMethod === "function") {
        return (...args: any[]) => {
          const prev = ScopeRegistry.currentScope(modelClass);
          ScopeRegistry.setCurrentScope(modelClass, target);
          let result: unknown;
          try {
            result = classMethod.apply(modelClass, args);
          } catch (e) {
            ScopeRegistry.setCurrentScope(modelClass, prev);
            throw e;
          }
          if (result instanceof Promise) {
            return result.finally(() => ScopeRegistry.setCurrentScope(modelClass, prev));
          }
          ScopeRegistry.setCurrentScope(modelClass, prev);
          return result;
        };
      }
      return value;
    },
  });
}

/** @internal */
function relationClassFor(klass: typeof Base): typeof GeneratedRelationMethods {
  return GeneratedRelationMethods;
}

/** @internal */
function includeRelationMethods(target: object, methods: GeneratedRelationMethods): void {
  for (const [name, fn] of methods.entries()) {
    (target as any)[name] = fn;
  }
}

/** @internal */
function generatedRelationMethods(modelClass: typeof Base): GeneratedRelationMethods {
  return _generatedMethodsByModel.get(modelClass) ?? new GeneratedRelationMethods();
}
