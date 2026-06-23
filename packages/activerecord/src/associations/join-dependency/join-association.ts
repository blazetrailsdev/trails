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
import type { AliasTracker } from "../alias-tracker.js";

type JoinType = typeof Nodes.InnerJoin | typeof Nodes.OuterJoin;
type TableResolver = (
  reflection: AbstractReflection,
  remainingChain: AbstractReflection[],
) => [Table, boolean];

export class JoinAssociation extends JoinPart {
  readonly reflection: AbstractReflection;
  private _table: Table | null = null;
  readonly tables: Table[] = [];
  /**
   * Extra join sources contributed by the association scope's own `joins(...)`
   * (Rails `joins.concat arel.join_sources`). Kept separate from the per-chain
   * constraint joins so callers that map joins 1:1 to chain entries aren't
   * disturbed; `makeConstraints` emits these after the node's own join.
   * @internal
   */
  readonly joinSources: Nodes.Node[] = [];
  private _readonly?: boolean;
  private _strictLoading?: boolean;

  constructor(reflection: AbstractReflection, children?: JoinPart[]) {
    super(reflection.klass, children);
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

  isMatch(other: JoinPart): boolean {
    if (this === other) return true;
    return (
      super.isMatch(other) &&
      other instanceof JoinAssociation &&
      this.reflection === other.reflection
    );
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
    aliasTracker?: AliasTracker,
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

      // Rails: extract predicates that DON'T belong to this table into "others"
      const others: Nodes.Node[] = [];
      if (nodes instanceof Nodes.And) {
        const remaining: Nodes.Node[] = [];
        for (const child of nodes.children) {
          if (!nodeReferencesTable(child, table.tableAlias ?? table.name)) {
            others.push(child);
          } else {
            remaining.push(child);
          }
        }
        if (others.length > 0) {
          if (remaining.length === 0) nodes = new Nodes.True();
          else nodes = remaining.length === 1 ? remaining[0] : new Nodes.And(remaining);
        }
      }

      joins.push(new joinType(table, new Nodes.On(nodes)));

      // Rails, gated on `unless others.empty?`:
      //   joins.concat arel.join_sources
      //   append_constraints(joins.last, others)
      // A raw-string join in the scope (e.g. `joins("JOIN posts AS p1 ON ...")`)
      // is emitted as its own join source, and the cross-table `others`
      // predicates are appended to that trailing source's ON — keeping the
      // source's alias in scope for stricter adapters (PG/MySQL), which reject an
      // ON that references a table joined further right. When the scope has no
      // join source, `joins.last` is this association's own join, so `others`
      // fold back into its ON (Rails' behaviour for a plain cross-table scope).
      if (others.length > 0) {
        // Rails reads `arel.join_sources` — the fully-materialized Arel manager
        // output, always proper Arel join nodes (raw-SQL strings become
        // `Nodes.StringJoin`, association-name join sources become real join
        // nodes). `arel()` builds the manager off the scope's join values.
        const sources: Nodes.Node[] = scope?.arel ? (scope.arel().joinSources as Nodes.Node[]) : [];
        // NOTE: `this.joinSources` accumulates across the chain but is only
        // consumed by the single-step `has_one`/`has_many` join path
        // (JoinDependency#addAssociation), whose reflection chain is length 1, so
        // each source maps to its own join step. A through association whose
        // intermediate scope also contributes string joins is not wired to
        // capture `joinSources` at all yet — a separate fidelity gap, not a
        // mis-ordering of this path.
        if (sources.length > 0) {
          const lastIdx = sources.length - 1;
          sources[lastIdx] = appendConstraints(sources[lastIdx], others) ?? sources[lastIdx];
          this.joinSources.push(...sources);
        } else {
          const lastIdx = joins.length - 1;
          joins[lastIdx] = (appendConstraints(joins[lastIdx], others) ??
            joins[lastIdx]) as Nodes.Join;
        }
      }

      foreignTable = table;
      foreignKlass = klass;
    }

    return joins;
  }

  /**
   * Mirrors: ActiveRecord::Associations::JoinDependency::JoinAssociation#readonly?
   *
   *   @readonly = reflection.scope && reflection.scope_for(base_klass.unscoped).readonly_value
   *
   * Memoized like Rails' `@readonly`.
   */
  override isReadonly(): boolean {
    if (this._readonly !== undefined) return this._readonly;
    this._readonly = !!this._scopeRelation()?._isReadonly;
    return this._readonly;
  }

  /**
   * Mirrors: ActiveRecord::Associations::JoinDependency::JoinAssociation#strict_loading?
   *
   *   @strict_loading = reflection.scope && reflection.scope_for(base_klass.unscoped).strict_loading_value
   *
   * Memoized like Rails' `@strict_loading`. Covers both the reflection's direct
   * `strictLoading: true` option and scope-driven strict loading (e.g.
   * `hasMany("posts", () => rel.strictLoading())`) via the scoped relation.
   */
  override isStrictLoading(): boolean {
    if (this._strictLoading !== undefined) return this._strictLoading;
    this._strictLoading =
      !!(this.reflection as any)?.strictLoading || !!this._scopeRelation()?._isStrictLoading;
    return this._strictLoading;
  }

  /**
   * `reflection.scope && reflection.scope_for(base_klass.unscoped)` — the scoped
   * relation Rails reads `readonly_value` / `strict_loading_value` off of, or
   * null when the reflection has no scope. Always builds from `unscoped` (per
   * Rails) so default scopes don't perturb the result.
   * @internal
   */
  private _scopeRelation(): any | null {
    const refl = this.reflection as any;
    if (!refl?.scope || typeof refl.scopeFor !== "function") return null;
    try {
      const unscoped = (this.baseKlass as any).unscoped?.();
      return unscoped ? (refl.scopeFor(unscoped) ?? null) : null;
    } catch {
      return null;
    }
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

/** @internal */
function appendConstraints(join: unknown, constraints: unknown[]): Nodes.Node | null {
  // Rails: if StringJoin, prepend constraints to left; otherwise combine via Arel::Nodes::And.
  // Arel join node fields are readonly — return a new join with updated On constraint.
  void Nodes.StringJoin;
  if (!join || !constraints.length) return join as Nodes.Node | null;
  const arelConstraints = constraints.filter((c): c is Nodes.Node => c instanceof Nodes.Node);
  if (!arelConstraints.length) return join as Nodes.Node | null;
  const joinAny = join as any;
  if (join instanceof Nodes.StringJoin) {
    const existing = joinAny.left;
    const allExprs: Nodes.Node[] =
      existing instanceof Nodes.Node ? [existing, ...arelConstraints] : arelConstraints;
    const newLeft = allExprs.length === 1 ? allExprs[0] : new Nodes.And(allExprs);
    return new Nodes.StringJoin(newLeft);
  } else if (joinAny.right?.expr instanceof Nodes.Node) {
    // Rails `append_constraints`: `right.expr = And.new([right.expr, *constraints])`
    // — `right.expr` is nested as the first element rather than flattened, so an
    // existing And stays nested (`And([And([...]), ...new])`). Matches Rails
    // structurally (SQL-equivalent either way).
    const existing = joinAny.right.expr as Nodes.Node;
    const newExpr = new Nodes.And([existing, ...arelConstraints]);
    return new (join as any).constructor(joinAny.left, new Nodes.On(newExpr));
  }
  return join as Nodes.Node | null;
}
