import type { Base } from "../base.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import type { SerializeOptions } from "@blazetrails/activemodel";
import {
  renameKey,
  type RenameKeyOptions,
  IndentedXmlStringBuilder,
  toTag,
  inGroups,
  inGroupsOf,
  publicInstanceMethods,
  pluralize,
  singularize,
  split,
  underscore,
  toSentence,
} from "@blazetrails/activesupport";
import { ScopeRegistry } from "../scoping.js";
import { NotImplementedError } from "../errors.js";
import { _relationFamilySlot, _relationFamilyState } from "./uncacheable-methods-slot.js";

type AnyCallable = (...args: any[]) => any;

type RelationCtor = new (modelClass: typeof Base, table?: any, predicateBuilder?: any) => any;

export interface Delegation {
  delegatedClasses: Set<typeof Base>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClassSpecificRelation {}

const _carrierNamePriority = new WeakMap<object, Map<string, number>>();

function installOnCarrier(carrier: object, name: string, fn: AnyCallable, priority: number): void {
  let priorities = _carrierNamePriority.get(carrier);
  if (!priorities) {
    priorities = new Map();
    _carrierNamePriority.set(carrier, priorities);
  }
  const existing = priorities.get(name);
  if (existing !== undefined && priority < existing) return;
  (carrier as Record<string, AnyCallable>)[name] = fn;
  priorities.set(name, priority);
}

export class GeneratedRelationMethods {
  private _methods: Map<string, AnyCallable> = new Map();
  private _carriers: { carrier: object; priority: number }[] = [];

  /**
   * @missingRailsCall define_method — PERMANENT
   * @missingRailsCall include? — PERMANENT
   * @missingRailsCall match? — PERMANENT
   * @missingRailsCall scoping — PERMANENT
   */
  generateMethod(method: string, fn: AnyCallable): void {
    if (this._methods.has(method)) return;
    this._methods.set(method, fn);
    for (const { carrier, priority } of this._carriers) {
      installOnCarrier(carrier, method, fn, priority);
    }
  }

  /** @noRailsEquivalent CONVERGEABLE converge-relation-delegation-helper-layer */
  includeInto(carrier: object, priority: number): void {
    if (this._carriers.some((entry) => entry.carrier === carrier)) return;
    this._carriers.push({ carrier, priority });
    for (const [name, fn] of this._methods) {
      installOnCarrier(carrier, name, fn, priority);
    }
  }
}

export class DelegateCache {
  static delegateBaseMethods = true;

  private _cache: Map<typeof Base, Set<string>> = new Map();

  /** @noRailsEquivalent CONVERGEABLE converge-relation-delegation-helper-layer */
  initialize(modelClass: typeof Base): void {
    if (!this._cache.has(modelClass)) {
      this._cache.set(modelClass, new Set());
    }
  }
}

const _delegatedClasses = new Set<typeof Base>();
const _delegateCache = new DelegateCache();

export function delegatedClasses(): Set<typeof Base> {
  return _delegatedClasses;
}

function computeUncacheableMethods(): Set<string> {
  const { relation, collectionProxy, associationRelation, disableJoinsAssociationRelation } =
    _relationFamilySlot;
  const result = new Set<string>();
  for (const klass of [
    relation,
    collectionProxy,
    associationRelation,
    disableJoinsAssociationRelation,
  ]) {
    if (!klass) continue;
    for (const n of publicInstanceMethods(klass)) result.add(n);
  }
  if (relation) {
    for (const n of publicInstanceMethods(relation)) result.delete(n);
  }
  return result;
}

let _uncacheableMethodsCache: Set<string> | undefined;
let _uncacheableMethodsCacheVersion = -1;

export function uncacheableMethods(): Set<string> {
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

/** @noRailsEquivalent CONVERGEABLE converge-relation-delegation-helper-layer */
export function guardBaseMethodDelegation(modelClass: typeof Base, prop: string): void {
  if (DelegateCache.delegateBaseMethods) return;
  let base: unknown = modelClass;
  while (typeof base === "function" && (base as { name?: string }).name !== "Base") {
    base = Object.getPrototypeOf(base);
  }
  if (typeof base !== "function") return;
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

/**
 * @missingRailsCall include — CONVERGEABLE delegation-relation-delegate-cache-builds-lazily
 * @missingRailsCall include_relation_methods — CONVERGEABLE delegation-relation-delegate-cache-builds-lazily
 */
export function initializeRelationDelegateCache(): void {
  for (const klass of _delegatedClasses) {
    _delegateCache.initialize(klass);
  }
}

const _generatedRelationMethodsByModel = new WeakMap<typeof Base, GeneratedRelationMethods>();

/** @internal */
export function generatedRelationMethods(this: typeof Base): GeneratedRelationMethods {
  let methods = _generatedRelationMethodsByModel.get(this);
  if (!methods) {
    methods = new GeneratedRelationMethods();
    _generatedRelationMethodsByModel.set(this, methods);
  }
  return methods;
}

/**
 * @internal
 * @missingRailsCall base_class? — PERMANENT
 */
export function includeRelationMethods(modelClass: typeof Base, delegate: object): void {
  stiCarrierChain(modelClass).forEach((ancestor, priority) => {
    ancestor.generatedRelationMethods().includeInto(delegate, priority);
  });
}

type FamilyCtor = new (...args: any[]) => any;

function perModelCarrier(
  cache: WeakMap<typeof Base, FamilyCtor>,
  modelClass: typeof Base,
  base: FamilyCtor | undefined,
): FamilyCtor {
  let subclass = cache.get(modelClass);
  if (!subclass) {
    const baseCtor = base as unknown as new (...args: never[]) => object;
    subclass = class extends baseCtor {} as FamilyCtor;
    Object.defineProperty(subclass, "name", {
      value: (baseCtor as { name: string }).name,
      configurable: true,
    });
    cache.set(modelClass, subclass);
    includeRelationMethods(modelClass, subclass.prototype);
  }
  return subclass;
}

function stiCarrierChain(modelClass: typeof Base): (typeof Base)[] {
  const chain: (typeof Base)[] = [];
  let current: typeof Base | null = modelClass;
  while (current) {
    chain.push(current);
    if (current.isBaseClass()) break;
    const parent = Object.getPrototypeOf(current) as unknown;
    current = typeof parent === "function" ? (parent as typeof Base) : null;
  }
  return chain.reverse();
}

const _relationClassByModel = new WeakMap<typeof Base, FamilyCtor>();

/** @internal */
export function relationClassFor(model: typeof Base): RelationCtor {
  return perModelCarrier(
    _relationClassByModel,
    model,
    _relationFamilySlot.relation,
  ) as RelationCtor;
}

export function create(
  model: typeof Base,
  kwargs: { table?: any; predicateBuilder?: any } = {},
): any {
  const { table, predicateBuilder } = kwargs;
  return wrapWithScopeProxy(new (relationClassFor(model))(model, table, predicateBuilder));
}

const _associationRelationClassByModel = new WeakMap<typeof Base, FamilyCtor>();

/** @noRailsEquivalent CONVERGEABLE converge-relation-delegation-helper-layer */
export function associationRelationClassFor(modelClass: typeof Base): FamilyCtor {
  return perModelCarrier(
    _associationRelationClassByModel,
    modelClass,
    _relationFamilySlot.associationRelation,
  );
}

const _disableJoinsAssociationRelationClassByModel = new WeakMap<typeof Base, FamilyCtor>();

/** @noRailsEquivalent CONVERGEABLE converge-relation-delegation-helper-layer */
export function disableJoinsAssociationRelationClassFor(modelClass: typeof Base): FamilyCtor {
  return perModelCarrier(
    _disableJoinsAssociationRelationClassByModel,
    modelClass,
    _relationFamilySlot.disableJoinsAssociationRelation,
  );
}

const _collectionProxyClassByModel = new WeakMap<typeof Base, FamilyCtor>();

/** @noRailsEquivalent CONVERGEABLE converge-relation-delegation-helper-layer */
export function collectionProxyClassFor(modelClass: typeof Base): FamilyCtor {
  return perModelCarrier(
    _collectionProxyClassByModel,
    modelClass,
    _relationFamilySlot.collectionProxy,
  );
}

export function generateRelationMethod(
  modelClass: typeof Base,
  method: string,
  fn: AnyCallable,
): void {
  modelClass.generatedRelationMethods().generateMethod(method, fn);
}

/** @noRailsEquivalent CONVERGEABLE converge-relation-delegation-helper-layer */
export function classMethodDelegator(prop: string): AnyCallable {
  return function (this: any, ...args: any[]) {
    const modelClass = this._model as typeof Base;
    guardBaseMethodDelegation(modelClass, prop);
    const classMethod = (modelClass as any)[prop] as AnyCallable;
    const prev = ScopeRegistry.currentScope(modelClass);
    (modelClass as any).setCurrentScope(this);
    let result: unknown;
    try {
      result = classMethod.apply(modelClass, args);
    } catch (e) {
      (modelClass as any).setCurrentScope(prev);
      throw e;
    }
    if (result instanceof Promise) {
      return result.finally(() => (modelClass as any).setCurrentScope(prev));
    }
    (modelClass as any).setCurrentScope(prev);
    return result;
  };
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
  "forEach",
  "join",
  "reverse",
  "slice",
  "at",
  "indexOf",
  "lastIndexOf",
  "concat",
  "map",
  "filter",
  "find",
  "some",
  "every",
  "includes",
  "reduce",
  "sort",
  "flatMap",
]);

const DELEGATED_RECORD_SET_OPERATORS: Record<string, (a: unknown[], b: unknown[]) => unknown[]> = {
  intersection: (a, b) => uniqRecords(a).filter((record) => includesRecord(b, record)),
  union: (a, b) => uniqRecords([...a, ...b]),
  difference: (a, b) => a.filter((record) => !includesRecord(b, record)),
};

function recordsEql(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const equals = (a as { equals?: (other: unknown) => boolean } | null | undefined)?.equals;
  return typeof equals === "function" ? equals.call(a, b) === true : false;
}

function includesRecord(records: unknown[], record: unknown): boolean {
  return records.some((candidate) => recordsEql(candidate, record));
}

function uniqRecords(records: unknown[]): unknown[] {
  const uniq: unknown[] = [];
  for (const record of records) if (!includesRecord(uniq, record)) uniq.push(record);
  return uniq;
}

/** @noRailsEquivalent CONVERGEABLE converge-relation-delegation-helper-layer */
export function delegateArrayMethod(
  prop: string,
  records: () => unknown[],
): ((...args: any[]) => unknown) | undefined {
  const setOperator = DELEGATED_RECORD_SET_OPERATORS[prop];
  if (setOperator) return (other: unknown[]) => setOperator(records(), other ?? []);
  if (!DELEGATED_ARRAY_METHODS.has(prop)) return undefined;
  const arrayMethod = (Array.prototype as unknown as Record<string, unknown>)[prop];
  if (typeof arrayMethod !== "function") return undefined;
  return (...args: any[]) => (arrayMethod as (...a: any[]) => unknown).apply([...records()], args);
}

function delegateArrayMethodAsync(
  prop: string,
  loadRecords: () => Promise<unknown[]>,
): ((...args: any[]) => Promise<unknown>) | undefined {
  const setOperator = DELEGATED_RECORD_SET_OPERATORS[prop];
  if (setOperator) return async (other: unknown[]) => setOperator(await loadRecords(), other ?? []);
  if (!DELEGATED_ARRAY_METHODS.has(prop)) return undefined;
  const arrayMethod = (Array.prototype as unknown as Record<string, unknown>)[prop];
  if (typeof arrayMethod !== "function") return undefined;
  return async (...args: any[]) => {
    const records = await loadRecords();
    return (arrayMethod as (...a: any[]) => unknown).apply([...records], args);
  };
}

/** @noRailsEquivalent CONVERGEABLE converge-relation-delegation-helper-layer */
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
  return delegateArrayMethodAsync(prop, loadRecords);
}

/** @noRailsEquivalent CONVERGEABLE converge-relation-delegation-helper-layer */
export function wrapWithScopeProxy<T extends object>(rel: T): T {
  return new Proxy(rel, {
    get(target: any, prop: string | symbol, receiver: any) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop === "symbol") return value;
      if (Reflect.has(target, prop)) return value;
      if (value !== undefined) return value;

      const modelClass = target._model as typeof Base;

      if (modelClass._scopes.has(prop)) {
        const scopeMethod = modelClass._scopes.get(prop)!;
        return (...args: any[]) =>
          scopeMethod.apply(Object.create(modelClass, { all: { value: () => target } }), args);
      }

      if (target._loaded) {
        const records = () => target._records ?? [];
        const arrayDelegate = delegateArrayMethod(prop, records);
        if (arrayDelegate) return arrayDelegate;
      }

      const enumerableDelegate = delegateEnumerableMethod(prop, () => target.records());
      if (enumerableDelegate) return enumerableDelegate;

      const classMethod = (modelClass as any)[prop];
      if (typeof classMethod === "function") {
        const delegator = classMethodDelegator(prop);
        if (!uncacheableMethods().has(prop)) {
          generateRelationMethod(modelClass, prop, delegator);
        }
        return (...args: any[]) => delegator.apply(target, args);
      }
      return value;
    },
    has(target: any, prop: string | symbol) {
      if (Reflect.has(target, prop)) return true;
      if (typeof prop === "symbol") return false;
      const modelClass = target._model as typeof Base;
      if (modelClass._scopes.has(prop)) return true;
      if (delegateEnumerableMethod(prop, () => target.records()) !== undefined) return true;
      return typeof (modelClass as any)[prop] === "function";
    },
  });
}

export interface DelegationHost {
  readonly model: typeof Base;
  records(): Promise<Base[]>;
}

type RecordDelegate = (records: Base[], ...args: any[]) => unknown;
type GroupFill = Base | null | false;
export type GroupedRecords = GroupFill[][];
export type ToSentenceOptions = {
  wordsConnector?: string;
  twoWordsConnector?: string;
  lastWordConnector?: string;
};

export type ToXmlOptions = SerializeOptions &
  RenameKeyOptions & {
    root?: string;
    children?: string;
    skipTypes?: boolean;
    skipInstruct?: boolean;
  };

const RECORD_DELEGATES: Record<string, RecordDelegate> = {
  length: (records) => records.length,
  each: (records, fn: (record: Base, index: number) => void) => {
    records.forEach(fn);
    return records;
  },
  join: (records, separator?: string) => records.join(separator),
  isIntersect: (records, other: Base[]) =>
    records.some((record) => other.some((o) => record.equals(o))),
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
  slice: (records, start?: number, end?: number) => records.slice(start, end),
  split: (records, valueOrFn: Base | ((record: Base) => boolean)) => split(records, valueOrFn),
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
    return `[${records
      .map((record) => (record as unknown as { inspect(): string }).inspect())
      .join(", ")}]`;
  },
};
RECORD_DELEGATES.toFormattedS = RECORD_DELEGATES.toFs;

export const DELEGATION_RECORD_METHOD_NAMES: ReadonlySet<string> = new Set(
  Object.keys(RECORD_DELEGATES),
);

/** @noRailsEquivalent CONVERGEABLE converge-relation-delegation-helper-layer */
export function delegateRecordMethodSync(
  prop: string,
  records: () => Base[],
): ((...args: any[]) => unknown) | undefined {
  const fn = RECORD_DELEGATES[prop];
  if (!fn) return undefined;
  const delegate = (...args: any[]): unknown => fn(records(), ...args);
  return prop === "length" ? refuseImplicitCount(delegate) : delegate;
}

class ImplicitCountError extends globalThis.TypeError {}

/** @noRailsEquivalent PERMANENT */
function refuseImplicitCount<F extends (...args: any[]) => unknown>(fn: F): F {
  Object.defineProperty(fn, Symbol.toPrimitive, {
    value: (): never => {
      throw new ImplicitCountError(
        "`length` is a method on a collection, not a property: it reads as a function, " +
          "not a count. Call `await collection.length()`, or `await collection.size()` " +
          "for the count Rails' `size` gives.",
      );
    },
    configurable: true,
  });
  return fn;
}

/** @noRailsEquivalent CONVERGEABLE converge-relation-delegation-helper-layer */
export class DelegationMethods {
  async length(this: DelegationHost): Promise<number> {
    return RECORD_DELEGATES.length(await this.records()) as number;
  }

  async each(this: DelegationHost, fn: (record: Base, index: number) => void): Promise<Base[]> {
    return RECORD_DELEGATES.each(await this.records(), fn) as Base[];
  }

  async join(this: DelegationHost, separator?: string): Promise<string> {
    return RECORD_DELEGATES.join(await this.records(), separator) as string;
  }

  async isIntersect(this: DelegationHost, other: Base[]): Promise<boolean> {
    return RECORD_DELEGATES.isIntersect(await this.records(), other) as boolean;
  }

  async reverse(this: DelegationHost): Promise<Base[]> {
    return RECORD_DELEGATES.reverse(await this.records()) as Base[];
  }

  async compact(this: DelegationHost): Promise<Base[]> {
    return RECORD_DELEGATES.compact(await this.records()) as Base[];
  }

  async index(this: DelegationHost, v: Base | ((record: Base) => unknown)): Promise<number | null> {
    return RECORD_DELEGATES.index(await this.records(), v) as number | null;
  }

  async rindex(
    this: DelegationHost,
    v: Base | ((record: Base) => unknown),
  ): Promise<number | null> {
    return RECORD_DELEGATES.rindex(await this.records(), v) as number | null;
  }

  async sample(this: DelegationHost, n?: number): Promise<Base | Base[] | null> {
    return RECORD_DELEGATES.sample(await this.records(), n) as Base | Base[] | null;
  }

  async rotate(this: DelegationHost, count = 1): Promise<Base[]> {
    return RECORD_DELEGATES.rotate(await this.records(), count) as Base[];
  }

  async shuffle(this: DelegationHost): Promise<Base[]> {
    return RECORD_DELEGATES.shuffle(await this.records()) as Base[];
  }

  async split(this: DelegationHost, v: Base | ((record: Base) => boolean)): Promise<Base[][]> {
    return RECORD_DELEGATES.split(await this.records(), v) as Base[][];
  }

  async inGroups(this: DelegationHost, n: number, fill: GroupFill = null): Promise<GroupedRecords> {
    return RECORD_DELEGATES.inGroups(await this.records(), n, fill) as GroupedRecords;
  }

  async inGroupsOf(
    this: DelegationHost,
    n: number,
    fill: GroupFill = null,
  ): Promise<GroupedRecords> {
    return RECORD_DELEGATES.inGroupsOf(await this.records(), n, fill) as GroupedRecords;
  }

  async toSentence(this: DelegationHost, options?: ToSentenceOptions): Promise<string> {
    return RECORD_DELEGATES.toSentence(await this.records(), options) as string;
  }

  async asJson(this: DelegationHost, options?: SerializeOptions): Promise<unknown[]> {
    return RECORD_DELEGATES.asJson(await this.records(), options) as unknown[];
  }

  async toFs(this: DelegationHost, format?: string): Promise<string> {
    return RECORD_DELEGATES.toFs(await this.records(), format) as string;
  }

  async toFormattedS(this: DelegationHost, format?: string): Promise<string> {
    return RECORD_DELEGATES.toFormattedS(await this.records(), format) as string;
  }

  async toXml(this: DelegationHost, options: ToXmlOptions = {}): Promise<string> {
    const records = await this.records();
    const builder = new IndentedXmlStringBuilder();
    const { root: rootOption, children: childrenOption, skipInstruct = false, ...rest } = options;
    const firstClass = records[0]?.constructor;
    const root =
      rootOption ??
      (firstClass !== Object && records.every((record) => record instanceof firstClass)
        ? pluralize(underscore(firstClass?.name ?? "NilClass")).replace(/\//g, "_")
        : "objects");

    const instruct = skipInstruct ? "" : '<?xml version="1.0" encoding="UTF-8"?>\n';

    const rootTag = renameKey(root, rest);
    const children = childrenOption ?? singularize(rootTag);
    const attributes: Record<string, string> = rest.skipTypes ? {} : { type: "array" };

    if (records.length === 0) {
      builder.tag(rootTag, undefined, attributes);
    } else {
      builder.openTag(rootTag, attributes);
      for (const record of records) {
        toTag(children, record, { ...rest, builder });
      }
      builder.closeTag(rootTag);
    }
    return instruct + builder.target();
  }

  get connection(): DatabaseAdapter {
    return (this as unknown as DelegationHost).model.connection;
  }

  get primaryKey(): string | string[] {
    return (this as unknown as DelegationHost).model.primaryKey;
  }

  get tableName(): string {
    return (this as unknown as DelegationHost).model.tableName;
  }

  withConnection<R>(
    this: DelegationHost,
    fn: (conn: DatabaseAdapter) => R | Promise<R>,
    options?: { preventPermanentCheckout?: boolean; checkoutTimeout?: number },
  ): Promise<R> {
    return this.model.withConnection(fn, options);
  }

  transaction<R>(
    this: DelegationHost,
    fn: (tx: any) => Promise<R>,
    options?: { isolation?: string; requiresNew?: boolean; joinable?: boolean },
  ): Promise<R | undefined> {
    return this.model.transaction(fn, options);
  }

  sanitizeSqlLike(this: DelegationHost, value: string, escapeChar?: string): string {
    return this.model.sanitizeSqlLike(value, escapeChar);
  }
}

refuseImplicitCount(DelegationMethods.prototype.length);

function shuffleInPlace<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
