import type { Base } from "../base.js";
import { Relation } from "../relation.js";
import { QueryMethods } from "../relation/query-methods.js";
import { SpawnMethods } from "../relation/spawn-methods.js";
import {
  CollectionAssociation,
  callback as assocCallback,
  callbacksFor as assocCallbacksFor,
  type CallbackHost,
} from "./collection-association.js";
import type { PrettyPrinter } from "../pretty-print.js";
import { collectionProxyClassFor, wrapWithScopeProxy } from "../relation/delegation.js";
import { _registerRelationFamily } from "../relation/uncacheable-methods-slot.js";

import { applyThenable, stripThenable } from "../relation/thenable.js";
import {
  findNthFromLast as baseFindNthFromLast,
  findNthWithLimit as baseFindNthWithLimit,
  FinderMethods,
} from "../relation/finder-methods.js";
import type { Nodes } from "@blazetrails/arel";
import {
  singularize,
  camelize,
  constantize,
  publicInstanceMethods,
} from "@blazetrails/activesupport";
import type { AssociationDefinition } from "../associations.js";
import { autoloadModel, association as associationProxy } from "../associations.js";
import { _setCollectionProxyCtor } from "./collection-proxy-slot.js";

// @ts-expect-error declaration-merge load() divergence — permanent, see class override
export interface CollectionProxy<T extends Base = Base> {
  then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
  /** @noRailsEquivalent PERMANENT */
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T[] | TResult>;
  /** @noRailsEquivalent PERMANENT */
  finally(onfinally?: (() => void) | null): Promise<T[]>;
}

type DelegatedRelationMethods<T extends Base> = {
  [K in keyof Omit<Relation<T>, keyof CollectionProxy<T>> as K extends `_${string}`
    ? never
    : K]: Omit<Relation<T>, keyof CollectionProxy<T>>[K];
};

export type AssociationProxy<
  T extends Base = Base,
  TExtensions extends Record<string, (...args: any[]) => any> = Record<
    string,
    (...args: any[]) => any
  >,
> = CollectionProxy<T> &
  DelegatedRelationMethods<T> &
  TExtensions & {
    readonly [index: number]: T | undefined;
  };

function sameRecordList(a: Base[], b: Base[]): boolean {
  return a.length === b.length && a.every((record, i) => record.equals(b[i]));
}

/** @internal */
interface ThroughAssociationHandle {
  _throughScope?: unknown;
  concat(...records: Base[]): Promise<Base[] | undefined>;
  insertRecord(
    record: Base,
    validate?: boolean,
    raise?: boolean,
    block?: (record: Base) => void,
  ): Promise<boolean>;
  transaction<R>(block: () => Promise<R>): Promise<R | undefined>;
}

interface StaleWrapper {
  isStaleTarget?: () => boolean;
  resetScope?: () => void;
  loadedBang?: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CollectionProxy<T extends Base = Base> extends Relation<T> {
  /** @internal */
  static override _railsClassName = "ActiveRecord::Associations::CollectionProxy";

  private _association!: CollectionAssociation;
  private _assocName: string;
  private get _target(): T[] {
    return this._association._targetStore as T[];
  }

  private set _target(records: T[]) {
    this._association._targetStore = records;
  }

  protected override get _records(): T[] {
    return this._target;
  }

  protected override set _records(records: T[]) {
    this._target = records;
  }

  private get _targetLoaded(): boolean {
    return this._association._loadedStore;
  }

  private set _targetLoaded(value: boolean) {
    this._association._loadedStore = value;
  }
  private _scope: unknown;
  private get _replacedOrAddedTargets(): Set<T> {
    return this._association._replacedOrAddedTargets as Set<T>;
  }

  private set _replacedOrAddedTargets(value: Set<T>) {
    this._association._replacedOrAddedTargets = value as Set<Base>;
  }
  private _proxySelf?: this;

  override get isLoaded(): boolean {
    return this._targetLoaded;
  }

  get loaded(): boolean {
    return this._targetLoaded;
  }

  get target(): T[] {
    return this._target;
  }

  /** @internal */
  private get reflection(): AssociationDefinition {
    return this._association.reflection;
  }

  /** @internal */
  private get _callbackHost(): CallbackHost {
    return {
      owner: this._association.owner,
      reflection: this.reflection,
      callback: assocCallback,
      callbacksFor: assocCallbacksFor,
    };
  }

  /** @noRailsEquivalent PERMANENT */
  [Symbol.iterator](): IterableIterator<T> {
    return this.target[Symbol.iterator]();
  }

  /** @internal */
  static _targetModelFor(
    record: Base,
    assocName: string,
    assocDef: AssociationDefinition,
  ): typeof Base {
    const className = assocDef.options.className ?? camelize(singularize(assocName));
    const ownerCtor = record.constructor as typeof Base & {
      _reflectOnAssociation?: (n: string) => { klass?: typeof Base } | null;
    };
    const richKlass = ownerCtor._reflectOnAssociation?.(assocName)?.klass;
    if (richKlass) return richKlass;
    autoloadModel(className);
    return constantize(className) as typeof Base;
  }

  static create<T extends Base = Base>(
    _model: typeof Base,
    association: { owner: Base; reflection: { name: string } },
  ): AssociationProxy<T> {
    return associationProxy<T>(association.owner, association.reflection.name);
  }

  /** @internal */
  static _create<T extends Base = Base>(
    record: Base,
    assocName: string,
    assocDef: AssociationDefinition,
  ): CollectionProxy<T> {
    const targetModel = this._targetModelFor(record, assocName, assocDef);
    const Ctor = collectionProxyClassFor(targetModel);
    const association = record.association(assocName) as unknown as CollectionAssociation;
    return new Ctor(targetModel, association) as CollectionProxy<T>;
  }

  constructor(klass: typeof Base, association: CollectionAssociation) {
    super(klass, klass.arelTable);
    this._association = association;
    this._assocName = association.reflection.name;

    const extensions = association.extensions;
    if (extensions.length > 0) {
      const wrapped = wrapWithScopeProxy(this as unknown as Relation<T>);
      for (const mod of extensions) {
        if (typeof mod === "function") {
          (mod as (rel: unknown) => void)(wrapped);
        } else {
          for (const [name, fn] of Object.entries(
            mod as Record<string, (...args: unknown[]) => unknown>,
          )) {
            (this as unknown as Record<string, unknown>)[name] = fn.bind(wrapped);
          }
        }
      }
    }
  }

  private async _execLoad(): Promise<T[]> {
    const results = (await this._findTargetViaAssociation()) as T[];
    const association = this._association.owner.association(this._assocName) as unknown as {
      setStrictLoading?: (record: Base) => Base;
    };
    if (typeof association.setStrictLoading === "function") {
      for (const r of results) association.setStrictLoading(r);
    }
    const sv = (this as any).strictLoadingValue as boolean | null;
    if (sv != null) {
      for (const r of results) (r as any)._strictLoading = sv;
    }
    return results;
  }

  private async _findTargetViaAssociation(queryExecutor?: () => Promise<Base[]>): Promise<Base[]> {
    if (
      !queryExecutor &&
      !(this._association as unknown as { findTargetNeeded(): boolean }).findTargetNeeded()
    ) {
      return [];
    }
    const { _buildAssociationInstance } = await import("./instance-methods.js");
    const assoc = _buildAssociationInstance.call(
      this._association.owner,
      this.reflection,
    ) as unknown as {
      _queryExecutor?: () => Promise<Base[]>;
      findTarget(): Promise<Base[]>;
    };
    assoc._queryExecutor = queryExecutor;
    return assoc.findTarget();
  }

  async toArray(): Promise<T[]> {
    if (!this._targetLoaded && this.isNullScope()) {
      const results = await this._execLoad();
      return this._association.mergeTargetLists(results, this._target) as T[];
    }
    return this.load();
  }

  // @ts-expect-error CP's load returns the hydrated T[] (loaded records);
  async load(): Promise<T[]> {
    if (this._targetLoaded) {
      const wrapper = this._staleWrapper();
      if (!(wrapper?.isStaleTarget?.() ?? false)) return this._target;
      this._target = [];
      this._targetLoaded = false;
      wrapper?.resetScope?.();
    }
    const results = await this._execLoad();
    this._target = this._association.mergeTargetLists(results, this._target) as T[];
    this._targetLoaded = true;
    this._staleWrapper()?.loadedBang?.();
    return this._target;
  }

  private _staleWrapper(): StaleWrapper | undefined {
    const rec = this._association.owner as unknown as {
      association?: (n: string) => StaleWrapper;
    };
    return typeof rec.association === "function" ? rec.association(this._assocName) : undefined;
  }

  build(attributes: Record<string, unknown>[], block?: (r: T) => void): T[];
  build(attributes?: Record<string, unknown>, block?: (r: T) => void): T;
  build(
    attributes: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): T | T[] {
    const association = this._association.owner.association(
      this._assocName,
    ) as unknown as CollectionAssociation;
    return (
      Array.isArray(attributes)
        ? association.build(attributes, block as (record: Base) => void)
        : association.build(attributes, block as (record: Base) => void)
    ) as T | T[];
  }

  new(attributes: Record<string, unknown>[], block?: (r: T) => void): T[];
  new(attributes?: Record<string, unknown>, block?: (r: T) => void): T;
  new(
    attributes: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): T | T[] {
    return Array.isArray(attributes)
      ? this.build(attributes, block)
      : this.build(attributes, block);
  }

  async create(attributes: Record<string, unknown>[], block?: (r: T) => void): Promise<T[]>;
  async create(attributes?: Record<string, unknown>, block?: (r: T) => void): Promise<T>;
  async create(
    attributes: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): Promise<T | T[]> {
    return (await this._association.create(
      attributes,
      block as ((record: Base) => void) | undefined,
    )) as T | T[];
  }

  async size(): Promise<number> {
    return this._association.size();
  }

  async isEmpty(): Promise<boolean> {
    return this._association.isEmpty();
  }

  async push(...records: T[]): Promise<Omit<this, "then"> | false> {
    if (this.reflection.options.through) {
      await this._pushThrough(records);
      return stripThenable(this._proxySelf ?? this);
    }

    const assoc = this._association.owner.association(this._assocName) as unknown as {
      concat: (...records: Base[]) => Promise<Base[] | undefined>;
    };
    const concatResult = await assoc.concat(...(records as unknown as Base[]));
    if (!concatResult) return false;
    return stripThenable(this._proxySelf ?? this);
  }

  private async _pushThrough(records: T[], throughScope?: unknown): Promise<void> {
    const assoc = this._association.owner.association(
      this._assocName,
    ) as unknown as ThroughAssociationHandle;
    const previousThroughScope = assoc._throughScope;
    if (throughScope != null) assoc._throughScope = throughScope;
    try {
      await assoc.concat(...records);
    } finally {
      assoc._throughScope = previousThroughScope;
    }
    this.resetScope();
  }

  async concat(...records: T[]): Promise<Omit<this, "then"> | false> {
    return this.push(...records);
  }

  // @ts-expect-error CP and Relation share the method name for genuinely
  async delete(...records: Array<T | number | string | bigint>): Promise<Base[] | undefined> {
    const removed = await this._association.delete(
      ...(records as Array<Base | number | string | bigint>),
    );
    this.resetScope();
    return removed;
  }

  // @ts-expect-error CP and Relation share the method name for genuinely
  async destroy(...records: Array<T | number | string | bigint>): Promise<Base[] | undefined> {
    const removed = await this._association.destroy(
      ...(records as Array<Base | number | string | bigint>),
    );
    this.resetScope();
    return removed;
  }

  async clear(): Promise<Omit<this, "then">> {
    await this.deleteAll();
    return stripThenable(this._proxySelf ?? this);
  }

  async isInclude(record: T): Promise<boolean> {
    return !!(await this._association.isInclude(record));
  }

  override last(): Promise<T | null>;
  override last(limit: number): Promise<T[]>;
  override async last(limit?: number): Promise<T | T[] | null> {
    if (this.isFindFromTarget()) await this.loadTarget();
    return FinderMethods.last.call(this as any, limit);
  }

  override take(): Promise<T | null>;
  override take(limit: number): Promise<T[]>;
  override async take(limit?: number): Promise<T | T[] | null> {
    if (this.isFindFromTarget()) await this.loadTarget();
    return super.take(limit as number);
  }

  /** @internal */
  protected override async findNthWithLimit(index: number, limit: number): Promise<T[]> {
    if (this.isFindFromTarget()) await this.loadTarget();
    return baseFindNthWithLimit.call(this as any, index, limit);
  }

  /** @internal */
  protected override async findNthFromLast(index: number): Promise<T | null> {
    if (this.isFindFromTarget()) await this.loadTarget();
    return baseFindNthFromLast.call(this as any, index);
  }

  async replace(otherArray: T[]): Promise<T[] | undefined> {
    const association = this._association;
    return (await association.replace(otherArray)) as T[] | undefined;
  }

  async destroyAll(): Promise<T[]> {
    const records = (await this._association.destroyAll()) as T[];
    this.resetScope();
    return records;
  }

  override find(ids: unknown[]): Promise<T[]>;
  override find(id: unknown): Promise<T>;
  override find(...ids: unknown[]): Promise<T | T[]>;
  override async find(...args: unknown[]): Promise<T | T[]> {
    const assoc = this._association.owner.association(this._assocName) as unknown as {
      find(...args: unknown[]): Promise<Base | Base[] | null>;
    };
    return (await assoc.find(...args)) as T | T[];
  }

  override async pluck(
    ...columnNames: Array<string | Nodes.Attribute | Nodes.NamedFunction | Nodes.SqlLiteral>
  ): Promise<unknown[]> {
    if (this.isNullScope()) return this.scope().pluck(...columnNames);
    if (this.reflection.options.disableJoins) {
      return this.scope().pluck(...columnNames);
    }
    return super.pluck(...columnNames);
  }

  async reload(): Promise<Omit<this, "then">> {
    this._targetLoaded = false;
    this._target = [];
    this._replacedOrAddedTargets.clear();
    await this.load();
    this.resetScope();
    return stripThenable(this);
  }

  override reset(): this {
    super.reset();
    this._targetLoaded = false;
    this._target = [];
    this._replacedOrAddedTargets.clear();
    this.resetScope();
    return this;
  }

  scope(): any {
    const assoc = this._association.owner.association(this._assocName) as unknown as {
      scope(): unknown;
    };
    return (this._scope ??= assoc.scope() as any);
  }
  async loadTarget(): Promise<T[]> {
    return this.load();
  }

  /** @internal */
  isNullScope(): boolean {
    return this._association.isNullScope();
  }

  /** @internal */
  isFindFromTarget(): boolean {
    return this._association.isFindFromTarget(this._targetLoaded);
  }

  // @ts-expect-error async divergence from Relation#inspect — see doc comment.
  async inspect(): Promise<string> {
    if (this.isFindFromTarget()) await this.loadTarget();
    const limitValue = (this as any).limitValue as number | null;
    const take = limitValue != null ? Math.min(limitValue, 11) : 11;
    const subject = this._targetLoaded
      ? this._target
      : await this.annotate("loading for inspect").limit(take);
    const entries = subject.slice(0, take).map((r) => (r as any).inspect() as string);
    if (entries.length === 11) entries[10] = "...";
    return `#<${(this.constructor as typeof Relation)._railsClassName} [${entries.join(", ")}]>`;
  }

  async prettyPrint(pp: PrettyPrinter): Promise<void> {
    if (this.isFindFromTarget()) await this.loadTarget();
    const limitValue = (this as any).limitValue as number | null;
    const take = limitValue != null ? Math.min(limitValue, 11) : 11;
    const subject = this._targetLoaded
      ? this._target
      : await this.annotate("loading for pp").limit(take);
    const entries = subject.slice(0, take) as (T | string)[];
    if (entries.length === 11) entries[10] = "...";
    await pp.pp(entries);
  }

  async createBang(attributes: Record<string, unknown>[], block?: (r: T) => void): Promise<T[]>;
  async createBang(attributes?: Record<string, unknown>, block?: (r: T) => void): Promise<T>;
  async createBang(
    attributes: Record<string, unknown> | Record<string, unknown>[] = {},
    block?: (r: T) => void,
  ): Promise<T | T[]> {
    return (await this._association.createBang(
      attributes,
      block as ((record: Base) => void) | undefined,
    )) as T | T[];
  }

  async deleteAll(dependent?: string): Promise<number> {
    const count = await this._association.deleteAll(dependent);
    this.resetScope();
    return count;
  }

  override async calculate(
    operation: "count",
    column?: string,
  ): Promise<number | Map<unknown, number>>;
  override async calculate(
    operation: "sum",
    column: string | Nodes.Node | number | null,
  ): Promise<number | bigint | Map<unknown, number | bigint>>;
  override async calculate(
    operation: "average" | "minimum" | "maximum",
    column: string,
  ): Promise<unknown | null | Map<unknown, unknown>>;
  override async calculate(
    operation: string,
    columnName?: string | Nodes.Node | number | null,
  ): Promise<unknown> {
    if (this.isNullScope()) return this.scope().calculate(operation, columnName);
    if (this.reflection.options.disableJoins) {
      return this.scope().calculate(operation, columnName);
    }
    return super.calculate(operation, columnName);
  }

  get proxyAssociation(): CollectionAssociation {
    return this._association;
  }

  async records(): Promise<T[]> {
    return this.loadTarget();
  }

  override async equals(other: unknown): Promise<boolean | undefined> {
    const loadTarget = await this.loadTarget();
    if (Array.isArray(other)) {
      return sameRecordList(loadTarget, other as Base[]);
    }
    const otherEquals = (other as { equals?: (o: unknown) => unknown } | null)?.equals;
    if (typeof otherEquals === "function") {
      return (await otherEquals.call(other, loadTarget)) as boolean | undefined;
    }
    return false;
  }

  async append(...records: T[]): Promise<Omit<this, "then"> | false> {
    return this.push(...records);
  }

  prepend(..._args: any[]): never {
    throw new Error("prepend on association is not defined. Please use <<, push or append");
  }

  resetScope(): this {
    this._offsets = undefined;
    this._take = undefined;
    this._scope = undefined;
    return this;
  }

  select(fn: (record: T) => boolean): Promise<T[]>;
  select(...columns: (string | Nodes.SqlLiteral)[]): Relation<T>;
  select(...args: any[]): Promise<T[]> | Relation<T> {
    if (args.length === 1 && typeof args[0] === "function") {
      const predicate = args[0] as (record: T) => boolean;
      return this.loadTarget().then((records) => records.filter(predicate));
    }
    return this.scope().select(...args);
  }

  /** @noRailsEquivalent PERMANENT */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    const records = await this.loadTarget();
    for (const record of records) {
      yield record;
    }
  }
}

/** @internal */
export const MIXIN_PUBLIC_INSTANCE_METHODS = [QueryMethods, SpawnMethods].flatMap((klass) =>
  publicInstanceMethods(klass, false),
);

const ownPublicInstanceMethods = publicInstanceMethods(CollectionProxy, false);

const delegateMethods = MIXIN_PUBLIC_INSTANCE_METHODS.filter(
  (name) => !ownPublicInstanceMethods.includes(name) && name !== "select",
).concat([
  "scoping",
  "values",
  "insert",
  "insertAll",
  "insertBang",
  "insertAllBang",
  "upsert",
  "upsertAll",
  "loadAsync",
]);

const valueAccessorNames = [
  ...Relation.MULTI_VALUE_METHODS.map((name) => `${name}Values`),
  ...Relation.SINGLE_VALUE_METHODS.map((name) => `${name}Value`),
  ...Relation.CLAUSE_METHODS.map((name) => `${name}Clause`),
];

for (const name of valueAccessorNames) {
  Object.defineProperty(CollectionProxy.prototype, name, {
    get(this: CollectionProxy<Base>): unknown {
      return (this.scope() as Record<string, unknown>)[name];
    },
    set(this: CollectionProxy<Base>, value: unknown) {
      (this.scope() as Record<string, unknown>)[name] = value;
    },
    configurable: true,
  });
}

for (const name of delegateMethods) {
  Object.defineProperty(CollectionProxy.prototype, name, {
    value: function (this: CollectionProxy<Base>, ...args: unknown[]): unknown {
      const scope = this.scope() as Record<string, (...a: unknown[]) => unknown>;
      return scope[name](...args);
    },
    writable: true,
    configurable: true,
  });
}

applyThenable(CollectionProxy.prototype, "load");

_setCollectionProxyCtor(
  CollectionProxy as unknown as Parameters<typeof _setCollectionProxyCtor>[0],
);

_registerRelationFamily(
  "collectionProxy",
  CollectionProxy as unknown as new (...a: never[]) => unknown,
);
