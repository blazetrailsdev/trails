import { Table as ArelTable, Nodes } from "@blazetrails/arel";
import { TableMetadata } from "../table-metadata.js";
import type { Base } from "../base.js";
import type { AssociationReflection, AbstractReflection } from "../reflection.js";
import { RuntimeReflection } from "../reflection.js";
import { AliasTracker, aliasedArelTableForReflection } from "./alias-tracker.js";
import { CompositePrimaryKeyMismatchError } from "./errors.js";
import { WhereClause } from "../relation/where-clause.js";
import { constructJoinDependency } from "../relation/query-methods.js";
import { drop } from "../ruby-drop.js";

export type ValueTransformation<T = unknown> = (v: T) => unknown;

/** @internal */
export type ScopeLambda<R> = (this: R, rel: R, owner: Base) => R | false | null | undefined;

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function invokeScopeLambda<R>(
  fn: ScopeLambda<R>,
  rel: R,
  owner: Base,
): R | false | null | undefined {
  return fn.length === 0
    ? (fn as (this: R) => ReturnType<ScopeLambda<R>>).call(rel)
    : fn.call(rel, rel, owner);
}

export interface AssociationScopeable {
  readonly owner: Base;
  readonly reflection: AssociationReflection;
  readonly klass: typeof Base;
}

type AliasedScope = { where(predicate: unknown): AliasedScope };

type ScopeBuilder = {
  buildScope(table?: unknown, predicateBuilder?: unknown, klass?: typeof Base): AliasedScope;
};

export class ReflectionProxy {
  readonly reflection: AbstractReflection;
  readonly aliasedTable: unknown;

  constructor(reflection: AbstractReflection, aliasedTable: unknown) {
    this.reflection = reflection;
    this.aliasedTable = aliasedTable;
  }

  allIncludes<T>(_cb?: () => T): T | null {
    return null;
  }

  private get _r(): {
    joinPrimaryKey(klass?: typeof Base): string | string[];
    joinForeignKey: string | string[];
    type?: string | null;
    klass: typeof Base;
    name: string;
    scope?: ((rel: unknown) => unknown) | null;
    scopeFor?: (rel: unknown, owner?: unknown) => unknown;
  } {
    return this.reflection as unknown as ReturnType<() => ReflectionProxy["_r"]>;
  }

  joinPrimaryKey(klass?: typeof Base): string | string[] {
    return this._r.joinPrimaryKey(klass);
  }

  get joinForeignKey(): string | string[] {
    return this._r.joinForeignKey;
  }

  get type(): string | null {
    return this._r.type ?? null;
  }

  get klass(): typeof Base {
    return this._r.klass;
  }

  get name(): string {
    return this._r.name;
  }

  get scope(): ((rel: unknown) => unknown) | undefined {
    return (this.reflection as unknown as { scope?: (rel: unknown) => unknown }).scope;
  }

  scopeFor(relation: unknown, owner?: unknown): unknown {
    return (
      (
        this.reflection as unknown as {
          scopeFor?: (rel: unknown, owner?: unknown) => unknown;
        }
      ).scopeFor?.(relation, owner) ?? relation
    );
  }

  buildScope(table?: unknown, predicateBuilder?: unknown, klass?: typeof Base): AliasedScope {
    return (this.reflection as unknown as ScopeBuilder).buildScope(table, predicateBuilder, klass);
  }

  constraints(): Array<(...args: unknown[]) => unknown> {
    return this.reflection.constraints() as Array<(...args: unknown[]) => unknown>;
  }
}

export class AssociationScope {
  private readonly _valueTransformation: ValueTransformation;

  constructor(valueTransformation: ValueTransformation) {
    this._valueTransformation = valueTransformation;
  }

  static create<T extends typeof AssociationScope>(
    this: T,
    valueTransformation?: ValueTransformation,
  ): InstanceType<T> {
    return new this(valueTransformation ?? ((v: unknown) => v)) as InstanceType<T>;
  }

  static readonly INSTANCE: AssociationScope = AssociationScope.create();

  static scope(association: AssociationScopeable): unknown {
    return AssociationScope.INSTANCE.scope(association);
  }

  static getBindValues(
    owner: Base,
    chain: ReadonlyArray<AbstractReflection | ReflectionProxy>,
  ): unknown[] {
    const binds: unknown[] = [];
    const last = chain[chain.length - 1];
    if (!last) return binds;
    const joinFk = (last as { joinForeignKey?: string | string[] }).joinForeignKey;
    const fks = Array.isArray(joinFk) ? joinFk : joinFk ? [joinFk] : [];
    for (const fk of fks) binds.push(owner._readAttribute(fk));
    if ((last as { type?: string | null }).type) {
      binds.push((owner.constructor as typeof Base).polymorphicName());
    }
    for (let i = 0; i < chain.length - 1; i++) {
      const refl = chain[i];
      const next = chain[i + 1];
      if ((refl as { type?: string | null }).type) {
        const nextKlass = (next as { klass?: typeof Base }).klass;
        binds.push(nextKlass ? nextKlass.polymorphicName() : null);
      }
    }
    return binds;
  }

  scope(association: AssociationScopeable): unknown {
    const { owner, reflection, klass } = association;
    const scopeRelation = klass.unscoped() as {
      aliasTracker: () => AliasTracker;
    };
    let scope: unknown = scopeRelation;
    const chain = this.getChain(reflection, association, scopeRelation.aliasTracker());
    const extensions =
      typeof (reflection as { extensions?: () => unknown[] }).extensions === "function"
        ? (reflection as { extensions: () => unknown[] }).extensions()
        : [];
    if (extensions.length > 0) {
      scope = (scope as { extendingBang: (...m: unknown[]) => unknown }).extendingBang(
        ...extensions,
      );
    }
    scope = this.addConstraints(scope, owner, chain);
    if (!reflection.isCollection()) {
      scope = (scope as { limit: (n: number) => unknown }).limit(1);
    }
    return scope;
  }

  /** @internal */
  private get valueTransformation(): ValueTransformation {
    return this._valueTransformation;
  }

  private transformValue<T>(value: T): unknown {
    return this.valueTransformation(value);
  }

  private applyScope(
    scope: unknown,
    table: ArelTable | Nodes.TableAlias | null,
    key: string,
    value: unknown,
  ): unknown {
    const w = scope as {
      where: (c: Record<string, unknown> | unknown) => unknown;
      table?: ArelTable;
    };
    if (table && w.table && !arelTableEql(w.table, table)) {
      const meta = new TableMetadata(null, table as unknown as ArelTable);
      const nodes = meta.predicateBuilder.buildFromHash({ [key]: value });
      let result: unknown = scope;
      for (const node of nodes) {
        result = (result as { where: (c: unknown) => unknown }).where(node);
      }
      return result;
    }
    return w.where({ [key]: value });
  }

  private lastChainScope(
    scope: unknown,
    reflection: AbstractReflection | ReflectionProxy,
    owner: Base,
  ): unknown {
    const r = reflection as unknown as {
      joinPrimaryKey(klass?: typeof Base): string | string[];
      joinForeignKey: string | string[];
      type?: string | null;
    };
    const aliased = (reflection as ReflectionProxy).aliasedTable as
      | string
      | { name?: string }
      | null
      | undefined;
    let tableName: string | null;
    if (typeof aliased === "string") {
      tableName = aliased;
    } else if (aliased && typeof aliased === "object" && typeof aliased.name === "string") {
      tableName = aliased.name;
    } else {
      try {
        tableName = (reflection as { klass?: { tableName?: string } }).klass?.tableName ?? null;
      } catch {
        tableName = null;
      }
    }
    const joinPk = r.joinPrimaryKey();
    const joinPks = Array.isArray(joinPk) ? joinPk : [joinPk];
    const joinFks = Array.isArray(r.joinForeignKey) ? r.joinForeignKey : [r.joinForeignKey];
    if (joinPks.length !== joinFks.length) {
      const name = (reflection as { name?: string }).name ?? "<unknown>";
      const ownerName = (owner.constructor as typeof Base).name;
      (owner.constructor as typeof Base)._reflectOnAssociation?.(name)?.checkValidityBang?.();
      throw new CompositePrimaryKeyMismatchError({
        activeRecord: ownerName,
        name,
        primaryKey: joinPks,
        foreignKey: joinFks,
      });
    }
    const table = tableName ? this._arelTableFor(reflection, tableName) : null;
    for (let i = 0; i < joinPks.length; i++) {
      const value = this.transformValue(owner._readAttribute(joinFks[i]));
      scope = this.applyScope(scope, table, joinPks[i], value);
    }
    if (r.type) {
      const polymorphicType = this.transformValue(
        (owner.constructor as typeof Base).polymorphicName(),
      );
      scope = this.applyScope(scope, table, r.type, polymorphicType);
    }
    return scope;
  }

  protected getChain(
    reflection: AssociationReflection,
    association: AssociationScopeable,
    tracker?: AliasTracker,
  ): Array<AbstractReflection | ReflectionProxy> {
    const chain: Array<AbstractReflection | ReflectionProxy> = [
      new RuntimeReflection(reflection, association),
    ];
    const tail = drop(reflection.chain, 1);
    const name = reflection.name;
    for (const refl of tail) {
      const klass = (refl as unknown as { klass?: typeof Base }).klass;
      let aliasedTable: unknown;
      if (tracker && klass) {
        aliasedTable = tracker.aliasedTableFor(klass.arelTable, null, () => {
          const fn = (refl as unknown as { aliasCandidate?: (n: string) => string }).aliasCandidate;
          return typeof fn === "function" ? fn.call(refl, name) : klass.tableName;
        });
      } else {
        aliasedTable = klass?.tableName ?? "";
      }
      chain.push(new ReflectionProxy(refl, aliasedTable));
    }
    return chain;
  }

  private nextChainScope(
    scope: unknown,
    reflection: AbstractReflection | ReflectionProxy,
    nextReflection: AbstractReflection | ReflectionProxy,
  ): unknown {
    const r = reflection as unknown as {
      joinPrimaryKey(klass?: typeof Base): string | string[];
      joinForeignKey: string | string[];
      klass?: { tableName?: string };
      type?: string | null;
    };
    const nr = nextReflection as {
      joinPrimaryKey(klass?: typeof Base): string | string[];
      joinForeignKey: string | string[];
      klass?: { tableName?: string };
      aliasedTable?: string | { name?: string };
    };
    const rJoinPk = r.joinPrimaryKey();
    const joinPks = Array.isArray(rJoinPk) ? rJoinPk : [rJoinPk];
    const joinFks = Array.isArray(r.joinForeignKey) ? r.joinForeignKey : [r.joinForeignKey];
    if (joinPks.length !== joinFks.length) {
      const base =
        (reflection as { reflection?: { name?: string; activeRecord?: { name?: string } } })
          .reflection ?? (reflection as { name?: string; activeRecord?: { name?: string } });
      const name = base.name ?? "<unknown>";
      const ownerName = base.activeRecord?.name ?? "<unknown>";
      const ownerClass = base.activeRecord as unknown as typeof Base | undefined;
      ownerClass?._reflectOnAssociation?.(name)?.checkValidityBang?.();
      throw new CompositePrimaryKeyMismatchError({
        activeRecord: ownerName,
        name,
        primaryKey: joinPks,
        foreignKey: joinFks,
      });
    }
    const rAliased = (reflection as ReflectionProxy).aliasedTable as
      | string
      | { name?: string }
      | null
      | undefined;
    let tableName: string;
    if (typeof rAliased === "string") {
      tableName = rAliased;
    } else if (rAliased && typeof rAliased === "object" && typeof rAliased.name === "string") {
      tableName = rAliased.name;
    } else {
      try {
        tableName = r.klass?.tableName ?? "";
      } catch {
        tableName = "";
      }
    }
    const aliased = nr.aliasedTable;
    const foreignTableName =
      typeof aliased === "string"
        ? aliased
        : aliased && typeof aliased === "object" && typeof aliased.name === "string"
          ? aliased.name
          : (nr.klass?.tableName ?? "");
    const table = this._arelTableFor(reflection, tableName);
    const foreignTable = this._arelTableFor(nextReflection, foreignTableName);
    let constraints: Nodes.Node = table.get(joinPks[0]).eq(foreignTable.get(joinFks[0]));
    for (let i = 1; i < joinPks.length; i++) {
      constraints = constraints.and(table.get(joinPks[i]).eq(foreignTable.get(joinFks[i])));
    }
    if (r.type) {
      const nextKlass = (nextReflection as { klass?: typeof Base }).klass;
      const value = this.transformValue(nextKlass ? nextKlass.polymorphicName() : "");
      scope = this.applyScope(scope, table, r.type, value);
    }
    return (scope as { joins: (node: Nodes.Join) => unknown }).joins(
      this.join(foreignTable, constraints) as Nodes.Join,
    );
  }

  /** @internal */
  private _arelTableFor(
    reflection: AbstractReflection | ReflectionProxy,
    name: string,
  ): ArelTable | Nodes.TableAlias {
    const aliased = (reflection as ReflectionProxy).aliasedTable;
    if (aliased instanceof ArelTable || aliased instanceof Nodes.TableAlias) return aliased;
    if (typeof aliased === "string" && aliased) {
      return aliasedArelTableForReflection(reflection, name, aliased);
    }
    if (
      aliased &&
      typeof aliased === "object" &&
      typeof (aliased as { name?: unknown }).name === "string"
    ) {
      return aliasedArelTableForReflection(reflection, name, (aliased as { name: string }).name);
    }
    return aliasedArelTableForReflection(reflection, name);
  }

  /** @missingRailsCall empty? — PERMANENT */
  private addConstraints(
    scope: unknown,
    owner: Base,
    chain: Array<AbstractReflection | ReflectionProxy>,
  ): unknown {
    const last = chain[chain.length - 1];
    scope = this.lastChainScope(scope, last, owner);
    for (let i = 0; i < chain.length - 1; i++) {
      scope = this.nextChainScope(scope, chain[i], chain[i + 1]);
    }

    const chainHead = chain[0];
    for (let i = chain.length - 1; i >= 0; i--) {
      const reflection = chain[i];
      const constraints =
        (
          reflection as { constraints?: () => Array<(...args: unknown[]) => unknown> }
        ).constraints?.() ?? [];
      for (const scopeChainItem of constraints) {
        if (typeof scopeChainItem !== "function") continue;
        const item = this.evalScope(reflection, scopeChainItem, owner);

        if (scopeChainItem === (chainHead as { scope?: unknown } | undefined)?.scope) {
          (scope as { mergeBang: (other: unknown) => unknown }).mergeBang(
            (item as { except: (...skips: string[]) => unknown }).except(
              "where",
              "includes",
              "unscope",
              "order",
            ),
          );
        } else if (
          (
            ((item as { referencesValues?: Array<string | Nodes.SqlLiteral> }).referencesValues ??
              []) as unknown[]
          ).length > 0
        ) {
          (scope as { mergeBang: (other: unknown) => unknown }).mergeBang(
            (item as { only: (...onlies: string[]) => unknown }).only("joins", "leftOuterJoins"),
          );

          const itemValues = item as {
            includesValues?: unknown[];
            eagerLoadValues?: unknown[];
          };
          const associations = [
            ...new Set([
              ...(itemValues.eagerLoadValues ?? []),
              ...(itemValues.includesValues ?? []),
            ]),
          ];
          if (associations.length > 0) {
            (scope as { joinsBang: (...values: unknown[]) => unknown }).joinsBang(
              constructJoinDependency.call(
                itemValues as never,
                associations as never,
                Nodes.OuterJoin,
              ),
            );
          }
        }

        const allIncludes = (
          reflection as { allIncludes?: (cb: () => void) => unknown } | undefined
        )?.allIncludes?.bind(reflection);
        if (allIncludes) {
          allIncludes(() => {
            const itemIncludes = (item as { includesValues?: unknown[] }).includesValues ?? [];
            if (itemIncludes.length === 0) return;
            const host = scope as { includesValues?: unknown[] };
            const current = host.includesValues ?? [];
            host.includesValues = [...current, ...itemIncludes.filter((v) => !current.includes(v))];
          });
        }
        const itemUnscope = (item as { unscopeValues?: unknown[] }).unscopeValues ?? [];
        if (itemUnscope.length > 0) {
          (scope as { unscopeBang: (...v: unknown[]) => unknown }).unscopeBang(...itemUnscope);
        }
        const merged = scope as { whereClause: WhereClause; orderValues?: unknown[] };
        const itemPredicates =
          (item as { whereClause?: { predicates?: unknown[] } }).whereClause?.predicates ?? [];
        if (itemPredicates.length > 0) {
          merged.whereClause = merged.whereClause.plus(
            new WhereClause(itemPredicates as Nodes.Node[]),
          );
        }
        const itemOrders = (item as { orderValues?: unknown[] }).orderValues ?? [];
        if (itemOrders.length > 0) {
          merged.orderValues = unionOrderClauses(itemOrders, merged.orderValues ?? []);
        }
        scope = merged;
      }
    }

    return scope;
  }

  /** @internal */
  protected evalScope(
    reflection: AbstractReflection | ReflectionProxy,
    scope: (...args: unknown[]) => unknown,
    owner: Base,
  ): unknown {
    const relation = (reflection as unknown as ScopeBuilder).buildScope(
      (reflection as ReflectionProxy).aliasedTable,
    );
    const evaluated = invokeScopeLambda(scope as ScopeLambda<unknown>, relation, owner);
    return evaluated != null && evaluated !== false ? evaluated : relation;
  }

  /** @internal */
  private join(table: unknown, constraint: unknown): unknown {
    return new Nodes.LeadingJoin(table as never, new Nodes.On(constraint as never));
  }
}

function arelTableEql(a: ArelTable | Nodes.TableAlias, b: ArelTable | Nodes.TableAlias): boolean {
  if (a instanceof ArelTable && b instanceof ArelTable) return a.eql(b);
  if (a instanceof Nodes.TableAlias && b instanceof Nodes.TableAlias) {
    return a.name === b.name && a.tableName === b.tableName;
  }
  return false;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function unionOrderClauses(first: unknown[], second: unknown[]): unknown[] {
  const result: unknown[] = [];
  const seen = new Set<string>();
  for (const o of [...first, ...second]) {
    const key =
      Array.isArray(o) && o.length === 2
        ? `T:${String(o[0])}:${String(o[1])}`
        : typeof o === "string"
          ? `S:${o}`
          : `J:${JSON.stringify(o)}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(o);
    }
  }
  return result;
}
