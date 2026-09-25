import type { Base } from "../base.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import type { SerializeOptions } from "@blazetrails/activemodel";
import {
  type RenameKeyOptions,
  inGroups,
  inGroupsOf,
  publicInstanceMethods,
  split,
  toSentence,
  toXmlArray,
  type XmlBuilder,
} from "@blazetrails/activesupport";
import { NotImplementedError } from "../errors.js";
import {
  Module,
  NoMethodError,
  Range,
  arySlice,
  include,
  rbEql,
  rbObjRespondTo,
  uniq,
} from "@blazetrails/ruby-compat";
import { ActiveRecord, Associations } from "../namespaces.js";

type AnyCallable = (...args: any[]) => any;

type FamilyCtor = new (...args: any[]) => any;

export function delegatedClasses(): FamilyCtor[] {
  return [
    ActiveRecord.Relation,
    Associations.CollectionProxy,
    ActiveRecord.AssociationRelation,
    ActiveRecord.DisableJoinsAssociationRelation,
  ];
}

let _uncacheableMethods: Set<string> | undefined;

/** @missingRailsArgs public_instance_methods — PERMANENT */
export function uncacheableMethods(): Set<string> {
  if (_uncacheableMethods) return _uncacheableMethods;
  const relationMethods = new Set(publicInstanceMethods(ActiveRecord.Relation));
  return (_uncacheableMethods = new Set(
    delegatedClasses()
      .flatMap((klass) => publicInstanceMethods(klass))
      .filter((n) => !relationMethods.has(n)),
  ));
}

const _relationDelegateCache = new WeakMap<typeof Base, Map<FamilyCtor, FamilyCtor>>();
const _generatedRelationMethodsByModel = new WeakMap<typeof Base, GeneratedRelationMethods>();
const _includedCarriers = new WeakMap<GeneratedRelationMethods, Record<string, unknown>[]>();

export class DelegateCache {
  static delegateBaseMethods = true;

  static relationDelegateClass(this: typeof Base, klass: FamilyCtor): FamilyCtor {
    if (!_relationDelegateCache.get(this)?.has(klass)) {
      DelegateCache.initializeRelationDelegateCache.call(this);
    }
    return _relationDelegateCache.get(this)!.get(klass)!;
  }

  /** @missingRailsArgs include — PERMANENT */
  static initializeRelationDelegateCache(this: typeof Base): void {
    const cache = new Map<FamilyCtor, FamilyCtor>();
    _relationDelegateCache.set(this, cache);
    for (const klass of delegatedClasses()) {
      const delegate = class extends (klass as new (...args: never[]) => object) {} as FamilyCtor;
      include(delegate, ClassSpecificRelation);
      Object.defineProperty(delegate, "name", { value: klass.name, configurable: true });
      DelegateCache.includeRelationMethods.call(this, delegate);
      cache.set(klass, delegate);
    }
  }

  static generateRelationMethod(this: typeof Base, method: string): void {
    this.generatedRelationMethods().generateMethod(method);
  }

  /** @internal */
  static includeRelationMethods(this: typeof Base, delegate: FamilyCtor): void {
    if (!this.isBaseClass()) {
      DelegateCache.includeRelationMethods.call(
        Object.getPrototypeOf(this) as typeof Base,
        delegate,
      );
    }
    const mod = this.generatedRelationMethods();
    include(delegate, mod);
    const carriers = _includedCarriers.get(mod) ?? [];
    carriers.push(Object.getPrototypeOf(delegate.prototype) as Record<string, unknown>);
    _includedCarriers.set(mod, carriers);
  }

  /** @internal */
  static generatedRelationMethods(this: typeof Base): GeneratedRelationMethods {
    let methods = _generatedRelationMethodsByModel.get(this);
    if (!methods) {
      methods = new GeneratedRelationMethods();
      _generatedRelationMethodsByModel.set(this, methods);
    }
    return methods;
  }
}

export class GeneratedRelationMethods extends Module {
  /**
   * @missingRailsCall define_method — PERMANENT
   * @missingRailsCall include? — PERMANENT
   * @missingRailsCall match? — PERMANENT
   */
  generateMethod(method: string): void {
    if (this.moduleEval((mod) => Object.prototype.hasOwnProperty.call(mod, method))) return;

    const fn = function (this: any, ...args: any[]) {
      return this.scoping(() => this._model[method](...args));
    };
    this.moduleEval((mod) => {
      mod[method] = fn;
    });
    for (const carrier of _includedCarriers.get(this) ?? []) carrier[method] = fn;
  }
}

export class ClassSpecificRelation {
  methodMissing(this: any, method: string, ...args: any[]): unknown {
    const model = this._model as typeof Base;
    if (rbObjRespondTo(model, method)) {
      if (!DelegateCache.delegateBaseMethods && rbObjRespondTo(ActiveRecord.Base, method)) {
        // @nie disposition=TODO
        throw new NotImplementedError(
          "Active Record code shouldn't rely on association delegation into ActiveRecord::Base methods",
        );
      } else if (!uncacheableMethods().has(method)) {
        model.generateRelationMethod(method);
      }

      return this.scoping(() =>
        method in model
          ? (model as any)[method](...args)
          : (model as any).methodMissing(method, ...args),
      );
    } else {
      throw new NoMethodError(
        `undefined method '${method}' for an instance of ${this.constructor.name}`,
      );
    }
  }
}

export function create(
  this: FamilyCtor,
  model: typeof Base,
  kwargs: { table?: any; predicateBuilder?: any } = {},
): any {
  const { table, predicateBuilder } = kwargs;
  return new (relationClassFor.call(this, model))(model, table, predicateBuilder);
}

/** @internal */
export function relationClassFor(this: FamilyCtor, model: typeof Base): FamilyCtor {
  return DelegateCache.relationDelegateClass.call(model, this);
}

export interface DelegationHost {
  readonly model: typeof Base;
  readonly isLoaded: boolean;
  readonly target?: Base[];
  _records?: Base[];
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
  at: (records, ...args: [index: number | Range<number>, length?: number]) =>
    arySlice(records, ...args),
  intersection: (records, other: Base[]) =>
    uniq(records.filter((record) => other.some((o) => rbEql(o, record)))),
  union: (records, other: Base[]) => uniq([...records, ...other]),
  plus: (records, other: Base[]) => [...records, ...other],
  difference: (records, other: Base[]) =>
    records.filter((record) => !other.some((o) => rbEql(o, record))),
  isIntersect: (records, other: Base[]) =>
    records.some((record) => other.some((o) => rbEql(record, o))),
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
  slice: (records, ...args: [index: number | Range<number>, length?: number]) =>
    arySlice(records, ...args),
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
  toXml: (records, options?: ToXmlOptions, block?: (builder: XmlBuilder) => void) =>
    toXmlArray(records, options, block),
};
RECORD_DELEGATES.toFormattedS = RECORD_DELEGATES.toFs;

class ImplicitCountError extends globalThis.TypeError {}

export class Delegation {
  respondToMissing(this: any, method: string, _: boolean): boolean {
    return rbObjRespondTo(this.model, method);
  }

  length(this: DelegationHost): number | Promise<number> {
    return withRecords(this, (records) => RECORD_DELEGATES.length(records) as number);
  }

  each(this: DelegationHost, fn: (record: Base, index: number) => void): Base[] | Promise<Base[]> {
    return withRecords(this, (records) => RECORD_DELEGATES.each(records, fn) as Base[]);
  }

  join(this: DelegationHost, separator?: string): string | Promise<string> {
    return withRecords(this, (records) => RECORD_DELEGATES.join(records, separator) as string);
  }

  isIntersect(this: DelegationHost, other: Base[]): boolean | Promise<boolean> {
    return withRecords(this, (records) => RECORD_DELEGATES.isIntersect(records, other) as boolean);
  }

  at(
    this: DelegationHost,
    ...args: [index: number | Range<number>, length?: number]
  ): Base | Base[] | null | Promise<Base | Base[] | null> {
    return withRecords(
      this,
      (records) => RECORD_DELEGATES.at(records, ...args) as Base | Base[] | null,
    );
  }

  intersection(this: DelegationHost, other: Base[]): Base[] | Promise<Base[]> {
    return withRecords(this, (records) => RECORD_DELEGATES.intersection(records, other) as Base[]);
  }

  union(this: DelegationHost, other: Base[]): Base[] | Promise<Base[]> {
    return withRecords(this, (records) => RECORD_DELEGATES.union(records, other) as Base[]);
  }

  plus(this: DelegationHost, other: Base[]): Base[] | Promise<Base[]> {
    return withRecords(this, (records) => RECORD_DELEGATES.plus(records, other) as Base[]);
  }

  difference(this: DelegationHost, other: Base[]): Base[] | Promise<Base[]> {
    return withRecords(this, (records) => RECORD_DELEGATES.difference(records, other) as Base[]);
  }

  reverse(this: DelegationHost): Base[] | Promise<Base[]> {
    return withRecords(this, (records) => RECORD_DELEGATES.reverse(records) as Base[]);
  }

  compact(this: DelegationHost): Base[] | Promise<Base[]> {
    return withRecords(this, (records) => RECORD_DELEGATES.compact(records) as Base[]);
  }

  index(
    this: DelegationHost,
    v: Base | ((record: Base) => unknown),
  ): number | null | Promise<number | null> {
    return withRecords(this, (records) => RECORD_DELEGATES.index(records, v) as number | null);
  }

  rindex(
    this: DelegationHost,
    v: Base | ((record: Base) => unknown),
  ): number | null | Promise<number | null> {
    return withRecords(this, (records) => RECORD_DELEGATES.rindex(records, v) as number | null);
  }

  sample(this: DelegationHost, n?: number): Base | Base[] | null | Promise<Base | Base[] | null> {
    return withRecords(
      this,
      (records) => RECORD_DELEGATES.sample(records, n) as Base | Base[] | null,
    );
  }

  rotate(this: DelegationHost, count = 1): Base[] | Promise<Base[]> {
    return withRecords(this, (records) => RECORD_DELEGATES.rotate(records, count) as Base[]);
  }

  shuffle(this: DelegationHost): Base[] | Promise<Base[]> {
    return withRecords(this, (records) => RECORD_DELEGATES.shuffle(records) as Base[]);
  }

  split(this: DelegationHost, v: Base | ((record: Base) => boolean)): Base[][] | Promise<Base[][]> {
    return withRecords(this, (records) => RECORD_DELEGATES.split(records, v) as Base[][]);
  }

  inGroups(
    this: DelegationHost,
    n: number,
    fill: GroupFill = null,
  ): GroupedRecords | Promise<GroupedRecords> {
    return withRecords(
      this,
      (records) => RECORD_DELEGATES.inGroups(records, n, fill) as GroupedRecords,
    );
  }

  inGroupsOf(
    this: DelegationHost,
    n: number,
    fill: GroupFill = null,
  ): GroupedRecords | Promise<GroupedRecords> {
    return withRecords(
      this,
      (records) => RECORD_DELEGATES.inGroupsOf(records, n, fill) as GroupedRecords,
    );
  }

  toSentence(this: DelegationHost, options?: ToSentenceOptions): string | Promise<string> {
    return withRecords(this, (records) => RECORD_DELEGATES.toSentence(records, options) as string);
  }

  asJson(this: DelegationHost, options?: SerializeOptions): unknown[] | Promise<unknown[]> {
    return withRecords(this, (records) => RECORD_DELEGATES.asJson(records, options) as unknown[]);
  }

  toFs(this: DelegationHost, format?: string): string | Promise<string> {
    return withRecords(this, (records) => RECORD_DELEGATES.toFs(records, format) as string);
  }

  toFormattedS(this: DelegationHost, format?: string): string | Promise<string> {
    return withRecords(this, (records) => RECORD_DELEGATES.toFormattedS(records, format) as string);
  }

  slice(
    this: DelegationHost,
    ...args: [index: number | Range<number>, length?: number]
  ): Base | Base[] | null | Promise<Base | Base[] | null> {
    return withRecords(
      this,
      (records) => RECORD_DELEGATES.slice(records, ...args) as Base | Base[] | null,
    );
  }

  toXml(
    this: DelegationHost,
    options?: ToXmlOptions,
    block?: (builder: XmlBuilder) => void,
  ): string | Promise<string> {
    return withRecords(
      this,
      (records) => RECORD_DELEGATES.toXml(records, options, block) as string,
    );
  }

  get connection(): Promise<DatabaseAdapter | null> {
    return (this as unknown as DelegationHost).model.connection;
  }

  get primaryKey(): string | string[] {
    return (this as unknown as DelegationHost).model.primaryKey;
  }

  get tableName(): string | null {
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

Object.defineProperty(Delegation.prototype.length, Symbol.toPrimitive, {
  value: (): never => {
    throw new ImplicitCountError(
      "`length` is a method on a collection, not a property: it reads as a function, " +
        "not a count. Call `await collection.length()`, or `await collection.size()` " +
        "for the count Rails' `size` gives.",
    );
  },
  configurable: true,
});

function withRecords<R>(host: DelegationHost, fn: (records: Base[]) => R): R | Promise<R> {
  if (host.isLoaded) return fn([...(host.target ?? host._records ?? [])]);
  return host.records().then((records) => fn([...records]));
}

function shuffleInPlace<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
