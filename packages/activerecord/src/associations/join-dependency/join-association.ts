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
import { Nodes, Table, fetchAttribute } from "@blazetrails/arel";
import type { AbstractReflection } from "../../reflection.js";
import { JoinPart } from "./join-part.js";
import { aliasedArelTableForReflection, type AliasTracker } from "../alias-tracker.js";
import { structuralUnionEq } from "../../relation/query-methods.js";

type JoinType = typeof Nodes.InnerJoin | typeof Nodes.OuterJoin;
type TableResolver = (
  reflection: AbstractReflection,
  remainingChain: AbstractReflection[],
) => [Table | Nodes.TableAlias, boolean];

export class JoinAssociation extends JoinPart {
  readonly reflection: AbstractReflection;
  private _table: Table | Nodes.TableAlias | null = null;
  readonly tables: (Table | Nodes.TableAlias)[] = [];
  private _readonly?: boolean;
  private _strictLoading?: boolean;

  constructor(reflection: AbstractReflection, children?: JoinPart[]) {
    super(reflection.klass, children);
    this.reflection = reflection;
  }

  get table(): string {
    const t = this._table;
    if (!t) return this.reflection.tableName;
    return String(t.tableAlias ?? t.name);
  }

  set table(value: string) {
    const table = aliasedArelTableForReflection(this.reflection, this.reflection.tableName, value);
    this._table = table;
    if (!this.tables.some((t) => String(t.tableAlias ?? t.name) === value)) {
      this.tables.push(table);
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
   * materializes it once through `scope.arel(alias_tracker.aliases)` and reads
   * the join predicates off `arel.constraints.first`
   * (join_association.rb:56-57), then wraps them in
   * join_type(table, On(constraints)).
   *
   * Mirrors: ActiveRecord::Associations::JoinDependency::JoinAssociation#join_constraints
   *
   * @missingRailsCall empty? — PERMANENT: Verified per-site (RFC 0106):
   *   `others.empty?` / `scope.references_values.empty?` / `associations.empty?`
   *   (join_association.rb:47, :50, :65) — `empty?` on Ruby Arrays, whose
   *   faithful JS spelling is `xs.length === 0`. That emits no callee, so no TS
   *   call can ever credit the Ruby one. Surfaced only when `join_constraints`
   *   stopped reading `where_clause.empty?`, a call Rails never makes here.
   * @missingRailsCall first — PERMANENT: Verified per-site (RFC 0106 wave 4g):
   *   `arel.constraints.first` (join_dependency/join_association.rb:56) is
   *   index-0 access on a Ruby Array, spelled `arel.constraints[0]`
   *   (join-association.ts:147). `Array#first` is a positional idiom with no JS
   *   call form — deliberately uncredited by RFC 0092 (JS_ENUMERABLE_ALIASES) —
   *   so nothing was dropped from the TS body.
   */
  joinConstraints(
    foreignTable: Table | Nodes.TableAlias,
    foreignKlass: typeof Base,
    joinType: JoinType,
    aliasTracker?: AliasTracker,
    resolveTable?: TableResolver,
  ): Nodes.Node[] {
    const joins: Nodes.Node[] = [];
    const chain: [AbstractReflection, Table | Nodes.TableAlias][] = [];

    const reflectionChain = this.reflection.chain;

    for (let index = 0; index < reflectionChain.length; index++) {
      const refl = reflectionChain[index];
      let table: Table | Nodes.TableAlias;
      let terminated = false;

      if (resolveTable) {
        [table, terminated] = resolveTable(refl, reflectionChain.slice(index));
      } else {
        table = aliasedArelTableForReflection(refl, refl.tableName);
      }

      if (!this._table) this._table = table;
      if (
        !this.tables.some(
          (t) => String(t.tableAlias ?? t.name) === String(table.tableAlias ?? table.name),
        )
      ) {
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

      if (scope && scope.referencesValues.length > 0) {
        // `scope.eager_load_values | scope.includes_values` — Ruby's array
        // union, which compares a Hash/String spec by `eql?`; `structuralUnionEq`
        // is the same comparison `joins!` unions with. Inlined rather than
        // reusing query-methods' private `unionAppend`: exporting that helper
        // adds a novel public name to a Rails-matched file (measured — it takes
        // `relation/query-methods.ts` from 9 novel to 10 on `parity:api:extra`),
        // and Rails spells this as one `|` operator with no helper at all.
        const associations = [...scope.eagerLoadValues];
        for (const spec of scope.includesValues) {
          if (!associations.some((seen: unknown) => structuralUnionEq(seen, spec))) {
            associations.push(spec);
          }
        }

        if (associations.length > 0) {
          scope.joinsBang(scope.constructJoinDependency(associations, Nodes.OuterJoin));
        }
      }

      const arel = scope.arel(aliasTracker);
      let nodes: Nodes.Node = arel.constraints[0];

      // Rails: extract predicates that DON'T belong to this table into "others"
      const others: Nodes.Node[] = [];
      if (nodes instanceof Nodes.And) {
        const remaining: Nodes.Node[] = [];
        for (const child of nodes.children) {
          if (!nodeReferencesTable(child, String(table.tableAlias ?? table.name))) {
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
        // nodes). Build it with the OUTER alias tracker so a scope `joins(:post)`
        // that re-joins a table already claimed by the through chain (e.g.
        // `comments_for_first_author` re-joining `posts`) is re-aliased instead
        // of emitting a duplicate `posts` that yields ambiguous columns — Rails'
        // `join_scope.arel(alias_tracker.aliases)` (join_dependency.rb:56).
        const sources: Nodes.Node[] = [...arel.joinSources()] as Nodes.Node[];
        joins.push(...sources);
        const lastIdx = joins.length - 1;
        joins[lastIdx] = (appendConstraints(joins[lastIdx], others) ??
          joins[lastIdx]) as Nodes.Join;
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
    this._readonly = !!this._scopeRelation()?.readonlyValue;
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
      !!(this.reflection as any)?.strictLoading || !!this._scopeRelation()?.strictLoadingValue;
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
  fetchAttribute(node, (attr: Nodes.Node) => {
    if (attr instanceof Nodes.Attribute) {
      const rel = attr.relation;
      if (String(rel.tableAlias ?? rel.name) === tableName) {
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
  // `constraints` can still hold non-Arel residue here, which Ruby's
  // `unshift`-into-`And` would carry into the visitor; narrow to nodes while
  // keeping the Rails identifier so the call reads as Rails' does.
  constraints = constraints.filter((c): c is Nodes.Node => c instanceof Nodes.Node);
  if (!constraints.length) return join as Nodes.Node | null;
  const joinAny = join as any;
  if (join instanceof Nodes.StringJoin) {
    const joinString = new Nodes.And([joinAny.left, ...constraints]);
    return new Nodes.StringJoin(joinString);
  } else if (joinAny.right?.expr instanceof Nodes.Node) {
    // Rails `append_constraints`: `right.expr = And.new(constraints.unshift right.expr)`
    // — `right.expr` is nested as the first element rather than flattened, so an
    // existing And stays nested (`And([And([...]), ...new])`). Matches Rails
    // structurally (SQL-equivalent either way). Arel join node fields are
    // readonly in trails, so we rebuild the join rather than assign to it.
    const right = joinAny.right;
    return new (join as any).constructor(
      joinAny.left,
      new Nodes.On(new Nodes.And([right.expr, ...constraints])),
    );
  }
  return join as Nodes.Node | null;
}
