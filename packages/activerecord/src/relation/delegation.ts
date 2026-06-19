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
 * Enumerable-method delegation — Rails' `Relation`/`CollectionProxy`
 * `include Enumerable`, so `Enumerable` methods that have no JS
 * `Array.prototype` analogue (and therefore aren't reachable through
 * `delegateArrayMethod`) are routed here. `partition` mirrors
 * `Enumerable#partition`: it splits the records into `[matched, unmatched]`
 * in a single pass, preserving order, and never mutates the underlying
 * records.
 *
 * Unlike `delegateArrayMethod`, these are returned regardless of whether the
 * relation is already loaded, and the returned callable is **async**: it
 * forces the load itself via `loadRecords()` before enumerating. This mirrors
 * Rails, where `Enumerable#partition` enumerates through `each` → `records`,
 * and `records` calls `load` before returning `@records` (relation.rb) — so
 * `partition` works on an unloaded relation/association and reads the rows the
 * DB actually holds rather than a stale/empty in-memory buffer. JS has no
 * blocking IO, so the only faithful way to "load first" is to return a Promise.
 *
 * Returns a bound callable when `prop` names a supported Enumerable method,
 * otherwise `undefined` so the caller can fall through to its own default.
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
  return undefined;
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

      // Enumerable-method delegation (the `include Enumerable` mixin) — async
      // and self-loading, so it's offered whether or not the relation is
      // loaded (mirrors Rails: `partition` enumerates through `records`, which
      // forces a load). `toArray()` loads then returns the rows.
      const enumerableDelegate = delegateEnumerableMethod(prop, () => target.toArray());
      if (enumerableDelegate) return enumerableDelegate;

      // Array-method delegation (delegation.rb `delegate ... to: :records`).
      // Only when the relation is already loaded — these are synchronous, and
      // JS can't block on the DB, so an unloaded relation keeps its `undefined`
      // default rather than delegating against records that aren't here yet.
      if (target._loaded) {
        const records = () => target._records ?? [];
        const arrayDelegate = delegateArrayMethod(prop, records);
        if (arrayDelegate) return arrayDelegate;
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
