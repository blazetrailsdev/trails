/**
 * JoinAssociation — a node in the join dependency tree representing
 * a joined association.
 *
 * Walks the reflection chain, builds scoped JOIN constraints using Arel
 * nodes, and produces InnerJoin/OuterJoin nodes with On conditions.
 *
 * Mirrors: ActiveRecord::Associations::JoinDependency::JoinAssociation
 */

import type { Base } from "../../base.js";
import { Table, Nodes } from "@blazetrails/arel";
import type { AbstractReflection } from "../../reflection.js";
import { JoinPart } from "./join-part.js";

type JoinType = typeof Nodes.InnerJoin | typeof Nodes.OuterJoin;
type TableResolver = (
  reflection: AbstractReflection,
  remainingChain: AbstractReflection[],
) => [Table, boolean];

export class JoinAssociation extends JoinPart {
  readonly reflection: AbstractReflection;
  private _table: Table | null = null;
  readonly tables: Table[] = [];
  private _readonly = false;
  private _strictLoading = false;

  constructor(reflection: AbstractReflection) {
    super(reflection.klass);
    this.reflection = reflection;
  }

  get table(): string {
    const t = this._table;
    if (!t) return this.reflection.tableName;
    return t.tableAlias ?? t.name;
  }

  set table(value: string) {
    this._table = new Table(this.reflection.tableName, { as: value });
    if (!this.tables.some((t) => (t.tableAlias ?? t.name) === value)) {
      this.tables.push(this._table);
    }
  }

  get arelTable(): Table {
    return this._table ?? new Table(this.reflection.tableName);
  }

  isMatch(other: JoinPart | typeof Base): boolean {
    if (other instanceof JoinPart) {
      if (this === other) return true;
      return (
        super.isMatch(other.baseKlass) &&
        other instanceof JoinAssociation &&
        this.reflection === other.reflection
      );
    }
    return super.isMatch(other);
  }

  match(other: JoinPart): boolean {
    return this.isMatch(other);
  }

  /**
   * Build JOIN constraints by walking the reflection chain.
   *
   * For each reflection in the chain, resolves the table (via the yield-like
   * resolver callback), builds a scoped relation via reflection.joinScope(),
   * extracts the WHERE predicates as Arel nodes, and wraps them in
   * join_type(table, On(constraints)).
   *
   * Mirrors: ActiveRecord::Associations::JoinDependency::JoinAssociation#join_constraints
   */
  joinConstraints(
    foreignTable: Table,
    foreignKlass: typeof Base,
    joinType: JoinType,
    resolveTable?: TableResolver,
  ): Nodes.Node[] {
    const joins: Nodes.Node[] = [];
    const chain: [AbstractReflection, Table][] = [];

    const reflectionChain = this.reflection.chain;

    for (let index = 0; index < reflectionChain.length; index++) {
      const refl = reflectionChain[index];
      let table: Table;
      let terminated = false;

      if (resolveTable) {
        [table, terminated] = resolveTable(refl, reflectionChain.slice(index));
      } else {
        table = new Table(refl.tableName);
      }

      if (!this._table) this._table = table;
      if (!this.tables.some((t) => (t.tableAlias ?? t.name) === (table.tableAlias ?? table.name))) {
        this.tables.push(table);
      }

      if (terminated) {
        foreignTable = table;
        foreignKlass = refl.klass;
        break;
      }

      chain.push([refl, table]);
    }

    // Rails reverses the chain — starts from the target table and works back
    chain.reverse();

    for (const [refl, table] of chain) {
      const klass = refl.klass;

      const scope = refl.joinScope(table, foreignTable, foreignKlass);

      // TODO: Rails checks scope.references_values and builds join dependencies
      // for eager-loaded associations here. We skip this until Relation#arel() and
      // construct_join_dependency are implemented.

      let nodes: Nodes.Node;
      if (scope && scope._whereClause && !scope._whereClause.isEmpty()) {
        nodes = scope._whereClause.ast;
      } else {
        // Scope produced no constraints — build direct key equality
        const rawPk = (refl as any).joinPrimaryKey ?? klass.primaryKey ?? "id";
        const reflName = (refl as any).name ?? "";
        const rawFk = (refl as any).joinForeignKey ?? (refl as any).foreignKey ?? `${reflName}_id`;
        const pks = Array.isArray(rawPk) ? rawPk : [rawPk];
        const fks = Array.isArray(rawFk) ? rawFk : [rawFk];
        if (pks.length !== fks.length) {
          throw new Error(
            `joinConstraints: joinPrimaryKey and joinForeignKey must have the same number of columns ` +
              `(got ${pks.length} and ${fks.length})`,
          );
        }
        const eqs = pks.map((pk: string, i: number) => table.get(pk).eq(foreignTable.get(fks[i])));
        nodes = eqs.length === 1 ? eqs[0] : new Nodes.And(eqs);
      }

      // Rails: extract nodes that DON'T belong to this table into "others"
      let others: Nodes.Node[] | null = null;
      if (nodes instanceof Nodes.And) {
        others = [];
        const remaining: Nodes.Node[] = [];
        for (const child of nodes.children) {
          if (!nodeReferencesTable(child, table.tableAlias ?? table.name)) {
            others.push(child);
          } else {
            remaining.push(child);
          }
        }
        if (others.length === 0) {
          others = null;
        } else if (remaining.length === 0) {
          // All predicates are cross-table — use a no-op ON condition;
          // others will be merged back into nodes below
          nodes = new Nodes.True();
        } else {
          nodes = remaining.length === 1 ? remaining[0] : new Nodes.And(remaining);
        }
      }

      if (others && others.length > 0) {
        nodes =
          nodes instanceof Nodes.And
            ? new Nodes.And([...nodes.children, ...others])
            : new Nodes.And([nodes, ...others]);
      }

      joins.push(new joinType(table, new Nodes.On(nodes)));

      foreignTable = table;
      foreignKlass = klass;
    }

    return joins;
  }

  isReadonly(): boolean {
    return this._readonly;
  }

  isStrictLoading(): boolean {
    return this._strictLoading;
  }
}

function nodeReferencesTable(node: Nodes.Node, tableName: string): boolean {
  let found = false;
  node.fetchAttribute((attr: Nodes.Node) => {
    if (attr instanceof Nodes.Attribute) {
      const rel = attr.relation;
      if ((rel.tableAlias ?? rel.name) === tableName) {
        found = true;
        return false;
      }
    }
    return !found;
  });
  return found;
}
