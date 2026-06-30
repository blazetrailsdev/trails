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
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import type { SerializeOptions } from "@blazetrails/activemodel";
import {
  Delegation as ASDelegation,
  dasherize,
  inGroups,
  inGroupsOf,
  singularize,
  splitArray,
  toSentence,
} from "@blazetrails/activesupport";
import { ScopeRegistry } from "../scoping.js";
import { NotImplementedError } from "../errors.js";
import { _relationFamilySlot, _relationFamilyState } from "./uncacheable-methods-slot.js";

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
  /**
   * Whether relation/collection-proxy `method_missing` may delegate into
   * `ActiveRecord::Base` class methods. Rails defaults this to `true`
   * (delegation.rb:25) so normal `Post.where(...).create` chains work, but its
   * own test suite sets it `false` (test/cases/helper.rb:29) to ban AR-internal
   * code from relying on delegation that silently mutates the global scope.
   *
   * Mirrors: ActiveRecord::Delegation::DelegateCache.delegate_base_methods
   */
  static delegateBaseMethods = true;

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
const _delegateCache = new DelegateCache();

export function delegatedClasses(): Set<typeof Base> {
  return _delegatedClasses;
}

/**
 * Collect a class's own public instance method/accessor names down to (but not
 * including) `boundary` in its prototype chain — i.e. everything it adds on top
 * of the boundary class. Mirrors `klass.public_instance_methods(false)` summed
 * over the subclass chain above `Relation`.
 */
function ownMethodNamesAbove(
  ctor: new (...args: never[]) => unknown,
  boundary: object | null,
): Set<string> {
  const names = new Set<string>();
  let proto: object | null = ctor.prototype as object;
  while (proto && proto !== boundary && proto !== Object.prototype) {
    for (const n of Object.getOwnPropertyNames(proto)) {
      if (n !== "constructor") names.add(n);
    }
    proto = Object.getPrototypeOf(proto);
  }
  return names;
}

/**
 * Compute the uncacheable-method set the Rails way (delegation.rb:17-21):
 * `delegated_classes' public_instance_methods - Relation's`, which is exactly
 * the methods unique to the proxy/association-relation subclasses (e.g.
 * `target`) — those NOT also defined on Relation. Such a method must not be
 * generated: a generated copy on the per-model module would clobber the proxy
 * subclass's own method. (Methods the proxies override but Relation also
 * defines — build/create/reload/records — are real methods that never reach
 * the delegation branch anyway, so the subtraction correctly drops them.)
 */
function computeUncacheableMethods(): Set<string> {
  const { relation, collectionProxy, associationRelation, disableJoinsAssociationRelation } =
    _relationFamilySlot;
  const relationProto = relation ? (relation.prototype as object) : null;
  const result = new Set<string>();
  for (const sub of [collectionProxy, associationRelation, disableJoinsAssociationRelation]) {
    if (!sub) continue;
    for (const n of ownMethodNamesAbove(sub, relationProto)) result.add(n);
  }
  // Rails subtracts `Relation.public_instance_methods` (delegation.rb:19): a
  // proxy method that *overrides* a Relation method is not uncacheable. Mirror
  // the exact set difference by removing every name reachable on Relation's own
  // prototype chain.
  if (relation) {
    for (const n of ownMethodNamesAbove(relation, null)) result.delete(n);
  }
  return result;
}

let _uncacheableMethodsCache: Set<string> | undefined;
let _uncacheableMethodsCacheVersion = -1;

export function uncacheableMethods(): Set<string> {
  // Recompute only when a relation-family class registers (import-time only);
  // the version stamp stabilizes before any delegation runs, so this memoizes
  // permanently without depending on which/how many classes have loaded.
  if (
    _uncacheableMethodsCache &&
    _uncacheableMethodsCacheVersion === _relationFamilyState.version
  ) {
    return _uncacheableMethodsCache;
  }
  _uncacheableMethodsCache = computeUncacheableMethods();
  _uncacheableMethodsCacheVersion = _relationFamilyState.version;
  return _uncacheableMethodsCache;
}

/**
 * Guard mirroring Rails' `delegate_base_methods` ban (delegation.rb:120-126):
 * when `DelegateCache.delegateBaseMethods` is `false`, delegating a relation /
 * collection-proxy `method_missing` into a method `ActiveRecord::Base` itself
 * responds to raises rather than silently scoping the call. Methods defined on
 * the model subclass (named scopes, custom class methods) are unaffected — only
 * methods reachable on the root `Base` class are banned. No-op while the flag is
 * `true` (the default), so ordinary `Post.where(...).find`-style chains work.
 *
 * Mirrors: ActiveRecord::Delegation::ClassSpecificRelation#method_missing
 */
export function guardBaseMethodDelegation(modelClass: typeof Base, prop: string): void {
  if (DelegateCache.delegateBaseMethods) return;
  // Resolve `ActiveRecord::Base.respond_to?(method)` without importing `Base`
  // at runtime (that creates a module cycle): walk the model's static prototype
  // chain to the `Base` class itself (class names are preserved at runtime — the
  // codebase already relies on them for table inference). Methods defined only on
  // a model subclass (named scopes, custom class methods) live below `Base` in
  // the chain, so they stay delegable; methods on `Base` or its ancestors are
  // banned.
  let base: unknown = modelClass;
  while (typeof base === "function" && (base as { name?: string }).name !== "Base") {
    base = Object.getPrototypeOf(base);
  }
  // No class named `Base` in the chain (e.g. an unexpected hierarchy) — don't
  // ban; better to under-enforce than to mis-fire on a non-AR class.
  if (typeof base !== "function") return;
  // Reachability check restricted to the static chain at/above `Base`, stopping
  // before `Function.prototype` so its builtins (`call`, `apply`, `bind`, `name`,
  // `length`, …) are NOT treated as Base methods — `ActiveRecord::Base` doesn't
  // `respond_to?` those, and `relation.call(...)` must not wrongly raise.
  for (
    let ctor: unknown = base;
    typeof ctor === "function" && ctor !== Function.prototype;
    ctor = Object.getPrototypeOf(ctor)
  ) {
    if (Object.prototype.hasOwnProperty.call(ctor, prop)) {
      // @nie disposition=TODO
      throw new NotImplementedError(
        "Active Record code shouldn't rely on association delegation into ActiveRecord::Base methods",
      );
    }
  }
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

/**
 * Per-model cache of generated relation-method delegators.
 *
 * Deviation (tracked-pending-convergence): Rails creates ONE per-model
 * `GeneratedRelationMethods` module (delegation.rb:71-91) and `include`s it
 * into all four dynamically-built delegate subclasses — Relation /
 * CollectionProxy / AssociationRelation / DisableJoinsAssociationRelation
 * (delegation.rb:32-45) — so cached delegators become **real methods** resolved
 * by normal Ruby method lookup and `method_missing` is never re-entered.
 *
 * trails relations are not per-model subclasses: every model shares the same
 * `Relation` / `CollectionProxy` classes dispatched through a `Proxy` `get`
 * trap, so we cache the generated delegators in this per-model WeakMap
 * side-table and consult it inside the trap (`wrapWithScopeProxy` here,
 * `wrapCollectionProxy` in associations.ts) instead of installing real methods.
 *
 * This story (`generated-relation-methods-real-method-mechanism`, RFC 0023)
 * *evaluated* converging to real methods and **deferred** it: a faithful port
 * needs four per-model prototype carriers (one object cannot serve four
 * prototype chains) fed by one generate, plus `Object.setPrototypeOf` on every
 * relation/proxy at construction — a known V8 megamorphic deopt that would
 * likely worsen, not improve, the only non-fidelity motivation (per-call Map
 * lookup vs direct dispatch). Observable behavior is already faithful (the
 * `uncacheableMethods` gate and cache-after-first-call are implemented), so the
 * deviation is mechanism-only. The implementation, if prioritized, is tracked
 * by story `delegation-generated-methods-per-model-prototype-carrier` (RFC
 * 0023). Until then the gate is implemented for fidelity but not load-bearing:
 * `Reflect.get(target, prop)` returns the proxy's real method before this
 * side-table is consulted, so a generated copy can never clobber a subclass
 * method (in Rails the shared module would).
 */
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

/**
 * Look up a previously generated relation method for `modelClass`, or
 * `undefined` if none has been cached. Lets `wrapCollectionProxy`
 * (associations.ts) resolve cached delegations without reaching into the
 * module-private WeakMap.
 */
export function lookupGeneratedRelationMethod(
  modelClass: typeof Base,
  name: string,
): AnyCallable | undefined {
  return _generatedMethodsByModel.get(modelClass)?.get(name);
}

/**
 * Build the function that delegates a model class method through a relation /
 * collection-proxy scope — Rails' `ClassSpecificRelation#method_missing`
 * `scoping { @klass.public_send(method, ...) }` (delegation.rb:118-131). The
 * `this` it's invoked with becomes the current scope for the call's duration:
 * sync results (a Relation) restore the prior scope immediately so the result
 * is directly chainable; async results (a Promise) defer restoration until the
 * promise settles, mirroring Rails' synchronous block-scoping across the body.
 *
 * This is also what `generateRelationMethod` caches (delegation.rb:127-129) so
 * subsequent calls skip the proxy miss path.
 */
export function classMethodDelegator(
  modelClass: typeof Base,
  prop: string,
  classMethod: AnyCallable,
): AnyCallable {
  return function (this: any, ...args: any[]) {
    guardBaseMethodDelegation(modelClass, prop);
    const prev = ScopeRegistry.currentScope(modelClass);
    ScopeRegistry.setCurrentScope(modelClass, this);
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
        const delegator = classMethodDelegator(modelClass, prop, classMethod);
        // Cache the delegation so subsequent calls resolve through the
        // generated method above rather than re-running this proxy miss path
        // (delegation.rb:127-129) — except uncacheable methods (to_a/records/
        // inspect) which Rails never generates.
        if (!uncacheableMethods().has(prop)) {
          generateRelationMethod(modelClass, prop, delegator);
        }
        return (...args: any[]) => delegator.apply(target, args);
      }
      return value;
    },
  });
}

/**
 * Rails' `ClassMethods#relation_class_for` (delegation.rb:144): the per-model
 * delegate subclass into which the model's `GeneratedRelationMethods` module is
 * `include`d. trails has no per-model subclass (see the deviation documented on
 * `_generatedMethodsByModel`), so this returns the carrier type backing the
 * per-model cache instead. Not yet wired into the Proxy dispatch path — kept as
 * the structural counterpart pending convergence (story
 * `delegation-generated-methods-per-model-prototype-carrier`).
 *
 * @internal
 */
function relationClassFor(klass: typeof Base): typeof GeneratedRelationMethods {
  return GeneratedRelationMethods;
}

/**
 * Rails' `DelegateCache#include_relation_methods` (delegation.rb:57-60):
 * `delegate.include generated_relation_methods` installs the per-model module's
 * generated methods as real methods on the delegate subclass. trails' analogue
 * copies them onto a target object; not yet wired (same deferral as above).
 *
 * @internal
 */
function includeRelationMethods(target: object, methods: GeneratedRelationMethods): void {
  for (const [name, fn] of methods.entries()) {
    (target as any)[name] = fn;
  }
}

/**
 * Rails' `DelegateCache#generated_relation_methods` (delegation.rb:63-68): the
 * memoized per-model `GeneratedRelationMethods` module. trails resolves it from
 * the `_generatedMethodsByModel` side-table.
 *
 * @internal
 */
function generatedRelationMethods(modelClass: typeof Base): GeneratedRelationMethods {
  return _generatedMethodsByModel.get(modelClass) ?? new GeneratedRelationMethods();
}

/**
 * The host surface `DelegationMethods` operates against once mixed into
 * `Relation` — the `model` accessor (Rails' delegation target `:model`) and the
 * loaded `records` (`:records`), reached through `toArray()` since trails loads
 * asynchronously.
 */
export interface DelegationHost {
  readonly model: typeof Base;
  toArray(): Promise<Base[]>;
}

/**
 * DelegationMethods — the curated `delegate ... to: :records` and
 * `delegate ... to: :model` surface (delegation.rb:101-106) realized as real
 * named methods on `Relation` (mixed in via `include(Relation, DelegationMethods)`),
 * so `relation.each`, `relation.connection`, `relation.toSentence`, … resolve
 * exactly as in Rails rather than only through the runtime delegation Proxy.
 *
 * The `to: :records` methods are async + self-loading: Rails reads the loaded
 * `records` array synchronously, but trails loads asynchronously, so each forces
 * `toArray()` first and then applies the corresponding `Array`/`Enumerable`
 * helper to a copy (preserving Ruby's non-mutating semantics).
 *
 * Mirrors: ActiveRecord::Delegation
 */
type RecordDelegate = (records: Base[], ...args: any[]) => unknown;
type GroupFill = Base | null | false;
export type GroupedRecords = GroupFill[][];
export type ToSentenceOptions = {
  wordsConnector?: string;
  twoWordsConnector?: string;
  lastWordConnector?: string;
};

/** Options for the collection {@link DelegationMethods.toXml} serializer. */
export type ToXmlOptions = SerializeOptions & {
  root?: string;
  children?: string;
  skipTypes?: boolean;
  skipInstruct?: boolean;
};

/** A record that knows how to serialize itself to XML (ActiveModel#to_xml). */
interface XmlSerializable {
  constructor: unknown;
  toXml(options?: SerializeOptions & { root?: string; skipTypes?: boolean }): string;
}

/**
 * The `delegate ... to: :records` operations (delegation.rb:101) as pure sync
 * functions over an already-loaded `records` array, reused by `DelegationMethods`
 * (async, self-loading) and `delegateRecordMethodSync` (sync, loaded proxy).
 */
const RECORD_DELEGATES: Record<string, RecordDelegate> = {
  each: (records, fn: (record: Base, index: number) => void) => {
    records.forEach(fn);
    return records;
  },
  join: (records, separator?: string) => records.join(separator),
  reverse: (records) => [...records].reverse(),
  compact: (records) => records.filter((record) => record != null),
  index: (records, valueOrFn: Base | ((record: Base) => unknown)) => {
    const found =
      typeof valueOrFn === "function"
        ? records.findIndex(valueOrFn as (record: Base) => unknown)
        : records.indexOf(valueOrFn);
    return found === -1 ? null : found;
  },
  rindex: (records, valueOrFn: Base | ((record: Base) => unknown)) => {
    if (typeof valueOrFn !== "function") {
      const found = records.lastIndexOf(valueOrFn);
      return found === -1 ? null : found;
    }
    const predicate = valueOrFn as (record: Base) => unknown;
    for (let i = records.length - 1; i >= 0; i--) {
      if (predicate(records[i])) return i;
    }
    return null;
  },
  sample: (records, n?: number) => {
    const shuffled = shuffleInPlace([...records]);
    if (n === undefined) return shuffled.length === 0 ? null : shuffled[0];
    return shuffled.slice(0, Math.max(0, n));
  },
  rotate: (records, count = 1) => {
    if (records.length === 0) return [];
    const shift = ((count % records.length) + records.length) % records.length;
    return records.slice(shift).concat(records.slice(0, shift));
  },
  shuffle: (records) => shuffleInPlace([...records]),
  split: (records, valueOrFn: Base | ((record: Base) => boolean)) => splitArray(records, valueOrFn),
  inGroups: (records, number: number, fillWith: Base | null | false = null) =>
    inGroups(records, number, fillWith),
  inGroupsOf: (records, number: number, fillWith: Base | null | false = null) =>
    inGroupsOf(records, number, fillWith),
  toSentence: (
    records,
    options?: { wordsConnector?: string; twoWordsConnector?: string; lastWordConnector?: string },
  ) =>
    toSentence(
      records.map((record) => String(record)),
      options,
    ),
  asJson: (records, options?: SerializeOptions) =>
    records.map((record) =>
      (record as unknown as { asJson(o?: SerializeOptions): unknown }).asJson(options),
    ),
  toFs: (records, format?: string) => {
    if (format === "db") {
      if (records.length === 0) return "null";
      return records.map((record) => (record as unknown as { id: unknown }).id).join(",");
    }
    // Non-`:db` falls back to Ruby `Array#to_s` == `Array#inspect`
    // (conversions.rb:103): bracketed, comma-separated element inspects, NOT a
    // bare comma-join.
    return `[${records
      .map((record) => (record as unknown as { inspect(): string }).inspect())
      .join(", ")}]`;
  },
};
// `alias_method :to_formatted_s, :to_fs` (conversions.rb).
RECORD_DELEGATES.toFormattedS = RECORD_DELEGATES.toFs;

/**
 * The curated `to: :records` delegate names backed by `RECORD_DELEGATES` — the
 * methods `wrapCollectionProxy` resolves synchronously on a loaded proxy.
 */
export const DELEGATION_RECORD_METHOD_NAMES: ReadonlySet<string> = new Set(
  Object.keys(RECORD_DELEGATES),
);

/**
 * Sync delegation of a curated `to: :records` method against an already-loaded
 * `records` array, so a *loaded* CollectionProxy keeps Rails' synchronous
 * `records` delegation (delegation.rb:101, `CollectionProxy#records` →
 * `load_target`) for the full curated set — including Rails-named entries
 * (`each`, `index`, …) the JS-name array delegate doesn't cover. Returns
 * `undefined` for non-record names so callers fall through.
 */
export function delegateRecordMethodSync(
  prop: string,
  records: () => Base[],
): ((...args: any[]) => unknown) | undefined {
  const fn = RECORD_DELEGATES[prop];
  if (!fn) return undefined;
  return (...args: any[]) => fn(records(), ...args);
}

export class DelegationMethods {
  // ---- to: :records (Array / Enumerable) ----
  // Each loads via `toArray()` (trails has no blocking IO) then applies the
  // shared `RECORD_DELEGATES` helper — the same pure function the synchronous
  // loaded-CollectionProxy path (`delegateRecordMethodSync`) uses.

  /** `Array#each` — yields each loaded record, returning the records. */
  async each(this: DelegationHost, fn: (record: Base, index: number) => void): Promise<Base[]> {
    return RECORD_DELEGATES.each(await this.toArray(), fn) as Base[];
  }

  /** `Array#join`. */
  async join(this: DelegationHost, separator?: string): Promise<string> {
    return RECORD_DELEGATES.join(await this.toArray(), separator) as string;
  }

  /** `Array#reverse` (non-mutating). */
  async reverse(this: DelegationHost): Promise<Base[]> {
    return RECORD_DELEGATES.reverse(await this.toArray()) as Base[];
  }

  /** `Array#compact` — drop nil records. */
  async compact(this: DelegationHost): Promise<Base[]> {
    return RECORD_DELEGATES.compact(await this.toArray()) as Base[];
  }

  /** `Array#index` — index of the first matching record, or `null` (Ruby `nil`). */
  async index(this: DelegationHost, v: Base | ((record: Base) => unknown)): Promise<number | null> {
    return RECORD_DELEGATES.index(await this.toArray(), v) as number | null;
  }

  /** `Array#rindex` — index of the last matching record, or `null` (Ruby `nil`). */
  async rindex(
    this: DelegationHost,
    v: Base | ((record: Base) => unknown),
  ): Promise<number | null> {
    return RECORD_DELEGATES.rindex(await this.toArray(), v) as number | null;
  }

  /** `Array#sample` — a random record, or (with `n`) up to `n`; `null` if empty. */
  async sample(this: DelegationHost, n?: number): Promise<Base | Base[] | null> {
    return RECORD_DELEGATES.sample(await this.toArray(), n) as Base | Base[] | null;
  }

  /** `Array#rotate` — rotate left by `count` (negative rotates right). */
  async rotate(this: DelegationHost, count = 1): Promise<Base[]> {
    return RECORD_DELEGATES.rotate(await this.toArray(), count) as Base[];
  }

  /** `Array#shuffle` (non-mutating). */
  async shuffle(this: DelegationHost): Promise<Base[]> {
    return RECORD_DELEGATES.shuffle(await this.toArray()) as Base[];
  }

  /** `Array#split` — split records on a value or predicate (ActiveSupport). */
  async split(this: DelegationHost, v: Base | ((record: Base) => boolean)): Promise<Base[][]> {
    return RECORD_DELEGATES.split(await this.toArray(), v) as Base[][];
  }

  /** `Array#in_groups` — split records into `number` groups (ActiveSupport). */
  async inGroups(this: DelegationHost, n: number, fill: GroupFill = null): Promise<GroupedRecords> {
    return RECORD_DELEGATES.inGroups(await this.toArray(), n, fill) as GroupedRecords;
  }

  /** `Array#in_groups_of` — split records into groups of `number` (ActiveSupport). */
  async inGroupsOf(
    this: DelegationHost,
    n: number,
    fill: GroupFill = null,
  ): Promise<GroupedRecords> {
    return RECORD_DELEGATES.inGroupsOf(await this.toArray(), n, fill) as GroupedRecords;
  }

  /** `Array#to_sentence` — comma/`and`-joined record strings (ActiveSupport). */
  async toSentence(this: DelegationHost, options?: ToSentenceOptions): Promise<string> {
    return RECORD_DELEGATES.toSentence(await this.toArray(), options) as string;
  }

  /** `Array#as_json` — each record's `as_json`. */
  async asJson(this: DelegationHost, options?: SerializeOptions): Promise<unknown[]> {
    return RECORD_DELEGATES.asJson(await this.toArray(), options) as unknown[];
  }

  /**
   * `Array#to_fs` / `Array#to_formatted_s` (conversions.rb:94-104): `:db` →
   * `"null"` when empty else ids joined by `","`; else `Array#to_s` (bracketed
   * inspect form).
   */
  async toFs(this: DelegationHost, format?: string): Promise<string> {
    return RECORD_DELEGATES.toFs(await this.toArray(), format) as string;
  }

  /** Alias of {@link toFs} — `alias_method :to_formatted_s, :to_fs`. */
  async toFormattedS(this: DelegationHost, format?: string): Promise<string> {
    return RECORD_DELEGATES.toFormattedS(await this.toArray(), format) as string;
  }

  /**
   * `Array#to_xml` (active_support/core_ext/array/conversions.rb): serialize the
   * loaded records as an XML collection by invoking `to_xml` on each element.
   *
   * The root element reflects the (pluralized, underscored) class name of the
   * first record — `<posts type="array">` — with each child rendered under
   * `root.singularize` (`<post>`). Empty collections use `nil-classes` (or the
   * supplied `:root`) and self-close. `skipTypes` drops every `type=` attribute
   * (including `type="array"`); `skipInstruct` omits the XML declaration;
   * `:only`/`:except` thread down into each record's serialization.
   */
  async toXml(this: DelegationHost, options: ToXmlOptions = {}): Promise<string> {
    const records = (await this.toArray()) as unknown as XmlSerializable[];
    const { skipTypes = false, skipInstruct = false } = options;

    const root =
      options.root ??
      (records.length === 0
        ? "nil-classes"
        : (records[0].constructor as { modelName: { plural: string } }).modelName.plural);
    const children = options.children ?? singularize(root);
    const rootTag = dasherize(root);
    const childTag = dasherize(children);
    const arrayAttr = skipTypes ? "" : ' type="array"';

    const instruct = skipInstruct ? "" : '<?xml version="1.0" encoding="UTF-8"?>\n';
    const childOpts = { only: options.only, except: options.except, skipTypes, root: childTag };

    if (records.length === 0) {
      return `${instruct}<${rootTag}${arrayAttr}/>`;
    }

    const body = records
      .map((record) =>
        record
          .toXml(childOpts)
          .split("\n")
          .map((line) => (line === "" ? line : `  ${line}`))
          .join("\n"),
      )
      .join("\n");
    return `${instruct}<${rootTag}${arrayAttr}>\n${body}\n</${rootTag}>`;
  }

  // ---- to: :model ----

  /** `delegate :connection, to: :model`. */
  get connection(): DatabaseAdapter {
    return (this as unknown as DelegationHost).model.connection;
  }

  /** `delegate :primary_key, to: :model`. */
  get primaryKey(): string | string[] {
    return (this as unknown as DelegationHost).model.primaryKey;
  }

  /** `delegate :table_name, to: :model`. */
  get tableName(): string {
    return (this as unknown as DelegationHost).model.tableName;
  }

  /** `delegate :with_connection, to: :model`. */
  withConnection<R>(
    this: DelegationHost,
    fn: (conn: DatabaseAdapter) => R | Promise<R>,
    options?: { preventPermanentCheckout?: boolean; checkoutTimeout?: number },
  ): Promise<R> {
    return this.model.withConnection(fn, options);
  }

  /** `delegate :transaction, to: :model`. */
  transaction<R>(
    this: DelegationHost,
    fn: (tx: any) => Promise<R>,
    options?: { isolation?: string; requiresNew?: boolean; joinable?: boolean },
  ): Promise<R | undefined> {
    return this.model.transaction(fn, options);
  }

  /** `delegate :sanitize_sql_like, to: :model`. */
  sanitizeSqlLike(this: DelegationHost, value: string, escapeChar?: string): string {
    return this.model.sanitizeSqlLike(value, escapeChar);
  }
}

/** Fisher–Yates in-place shuffle (Ruby `Array#shuffle`/`#sample` semantics). */
function shuffleInPlace<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
