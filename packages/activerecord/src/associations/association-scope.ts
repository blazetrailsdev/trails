import { Table as ArelTable, Nodes } from "@blazetrails/arel";
import { TableMetadata } from "../table-metadata.js";
import type { Base } from "../base.js";
import type { AssociationReflection, AbstractReflection } from "../reflection.js";
import { RuntimeReflection } from "../reflection.js";
import { AliasTracker } from "./alias-tracker.js";
import { WhereClause } from "../relation/where-clause.js";
import { constructJoinDependency } from "../relation/query-methods.js";
import { kernelArray } from "@blazetrails/activesupport";
import { drop } from "@blazetrails/ruby-compat";
import { methodMissingProxy } from "@blazetrails/ruby-compat";
import { Associations } from "../namespaces.js";

export type ValueTransformation<T = unknown> = (v: T) => unknown;

export interface AssociationScopeable {
  readonly owner: Base;
  readonly reflection: AssociationReflection;
  readonly klass: typeof Base;
}

type ChainReflection = {
  joinPrimaryKey(): string | string[];
  joinForeignKey: string | string[];
  aliasedTable: ArelTable | Nodes.TableAlias;
  klass: typeof Base;
  type?: string | null;
};

type AliasedScope = { where(predicate: unknown): AliasedScope };

type ScopeBuilder = {
  buildScope(table?: unknown, predicateBuilder?: unknown, klass?: typeof Base): AliasedScope;
};

export class ReflectionProxy {
  readonly aliasedTable: ArelTable | Nodes.TableAlias;

  constructor(reflection: AbstractReflection, aliasedTable: ArelTable | Nodes.TableAlias) {
    this.aliasedTable = aliasedTable;
    return methodMissingProxy(this, { delegate: () => reflection });
  }

  allIncludes<T>(_cb?: () => T): T | null {
    return null;
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

  static getBindValues(owner: Base, chain: ReadonlyArray<AbstractReflection>): unknown[] {
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

  private lastChainScope(scope: unknown, reflection: ChainReflection, owner: Base): unknown {
    const primaryKey = kernelArray(reflection.joinPrimaryKey());
    const foreignKey = kernelArray(reflection.joinForeignKey);

    const table = reflection.aliasedTable;
    const primaryKeyForeignKeyPairs = primaryKey.map((key, i) => [key, foreignKey[i]] as const);
    for (const [joinKey, foreignKey] of primaryKeyForeignKeyPairs) {
      const value = this.transformValue(owner._readAttribute(foreignKey));
      scope = this.applyScope(scope, table, joinKey, value);
    }

    if (reflection.type) {
      const polymorphicType = this.transformValue(
        (owner.constructor as typeof Base).polymorphicName(),
      );
      scope = this.applyScope(scope, table, reflection.type, polymorphicType);
    }

    return scope;
  }

  protected getChain(
    reflection: AssociationReflection,
    association: AssociationScopeable,
    tracker: AliasTracker,
  ): Array<AbstractReflection> {
    const name = reflection.name;
    const chain: Array<AbstractReflection> = [new RuntimeReflection(reflection, association)];
    for (const refl of drop(reflection.chain, 1)) {
      const aliasedTable = tracker.aliasedTableFor(
        (refl as unknown as ChainReflection).klass.arelTable,
        null,
        () => (refl as unknown as { aliasCandidate(name: string): string }).aliasCandidate(name),
      );
      chain.push(new ReflectionProxy(refl, aliasedTable) as ReflectionProxy & typeof refl);
    }
    return chain;
  }

  private nextChainScope(
    scope: unknown,
    reflection: ChainReflection,
    nextReflection: ChainReflection,
  ): unknown {
    const primaryKey = kernelArray(reflection.joinPrimaryKey());
    const foreignKey = kernelArray(reflection.joinForeignKey);

    const table = reflection.aliasedTable;
    const foreignTable = nextReflection.aliasedTable;

    const primaryKeyForeignKeyPairs = primaryKey.map((key, i) => [key, foreignKey[i]] as const);
    const constraints = primaryKeyForeignKeyPairs
      .map(([joinPrimaryKey, foreignKey]) =>
        table.get(joinPrimaryKey).eq(foreignTable.get(foreignKey)),
      )
      .reduce<Nodes.Node | null>((memo, node) => (memo === null ? node : memo.and(node)), null);

    if (reflection.type) {
      const value = this.transformValue(nextReflection.klass.polymorphicName());
      scope = this.applyScope(scope, table, reflection.type, value);
    }

    return (scope as { joinsBang: (node: Nodes.Join) => unknown }).joinsBang(
      this.join(foreignTable, constraints) as Nodes.Join,
    );
  }

  /** @missingRailsCall empty? — PERMANENT */
  private addConstraints(scope: unknown, owner: Base, chain: Array<AbstractReflection>): unknown {
    const last = chain[chain.length - 1];
    scope = this.lastChainScope(scope, last as unknown as ChainReflection, owner);
    for (let i = 0; i < chain.length - 1; i++) {
      scope = this.nextChainScope(
        scope,
        chain[i] as unknown as ChainReflection,
        chain[i + 1] as unknown as ChainReflection,
      );
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
    reflection: AbstractReflection,
    scope: (...args: unknown[]) => unknown,
    owner: Base,
  ): unknown {
    const relation = (reflection as unknown as ScopeBuilder).buildScope(
      (reflection as Partial<ReflectionProxy>).aliasedTable,
    );
    return scope.call(relation, owner) || relation;
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
 * @noRailsEquivalent CONVERGEABLE union-order-clauses-is-a-second-spelling-of-ruby-array-union
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

Associations.AssociationScope = AssociationScope;
