/**
 * JoinDependency — builds aliased LEFT OUTER JOIN queries and
 * reconstructs nested model instances from flat result rows.
 *
 * Mirrors: ActiveRecord::Associations::JoinDependency
 *
 * Rails assigns each joined table a sequential alias (t0, t1, t2...)
 * and aliases every column as t{table}_r{col} to avoid name collisions.
 * After executing the query, each row is split back into per-table
 * attribute hashes and instantiated into the correct model.
 */

import { Notifications } from "@blazetrails/activesupport";
import type { Base } from "../base.js";
import type { AssociationSpec } from "../relation/query-methods.js";
import { Nodes, tableSqlName, type TableRef } from "@blazetrails/arel";
import { isAssociationCached, _cacheSingularTarget } from "../associations.js";
import { _reflectOnAssociation } from "../reflection.js";
import { JoinBase } from "./join-dependency/join-base.js";
import { JoinAssociation } from "./join-dependency/join-association.js";
import { JoinPart } from "./join-dependency/join-part.js";
import { AssociationNotFoundError, EagerLoadPolymorphicError } from "./errors.js";
import { ConfigurationError, ConnectionNotDefined } from "../errors.js";
import {
  AliasTracker,
  aliasedArelTableFor,
  aliasedArelTableForReflection,
} from "./alias-tracker.js";
import { threadedConnectionFor } from "../connection-handling.js";

/**
 * Identity-cache key for a no-primary-key node. Rails uses `id = keys.map { nil }`
 * — a `[nil]` array, which is truthy in Ruby and compares equal across rows — so
 * every no-PK row for a given parent+node collapses to one cached model. A single
 * shared sentinel reproduces that constant-key behavior.
 */
const NO_PRIMARY_KEY_ID = Symbol("JoinDependency.noPrimaryKeyId");

/**
 * Stable per-reflection ids used to key `@joined_tables` by the remaining
 * reflection chain. Rails uses the `reflection_chain[index..]` array as the hash
 * key (join_dependency.rb:194); Ruby compares those arrays element-wise by the
 * reflections' object identity (no `eql?` override). A JS array can't be a value
 * key, so we intern each reflection to a number and join the suffix's ids.
 */
let _reflectionIdCounter = 0;
const _reflectionIds = new WeakMap<object, number>();
function reflectionChainKey(chain: readonly object[]): string {
  let key = "";
  for (const refl of chain) {
    let id = _reflectionIds.get(refl);
    if (id === undefined) {
      id = ++_reflectionIdCounter;
      _reflectionIds.set(refl, id);
    }
    key += key ? `,${id}` : `${id}`;
  }
  return key;
}

/** Mirrors: ActiveRecord::Associations::JoinDependency::Aliases::Column (name, alias). */
export interface AliasMap {
  column: string;
  alias: string;
}

function getModelColumns(modelClass: any): string[] {
  // columnsHash() triggers loadSchema() which populates _attributeDefinitions
  // from the schema cache before columnNames() reads them. Guard with try/catch
  // in case the model is abstract or has no adapter configured yet.
  let ch: Record<string, unknown> | undefined;
  if (typeof modelClass.columnsHash === "function") {
    try {
      ch = modelClass.columnsHash() as Record<string, unknown>;
    } catch {
      ch = undefined;
    }
  }
  // No columnNames() fallback: it would throw exactly like the caught
  // columnsHash() above (abstract / no table).
  const cols: string[] = ch ? Object.keys(ch) : [];
  // A falsy primaryKey ("" / null) marks a no-primary-key model — there is no
  // PK column to fold into the SELECT list, so leave the columns as-is.
  const pk = modelClass.primaryKey;
  if (Array.isArray(pk)) {
    for (const k of pk) {
      if (k && !cols.includes(k)) cols.unshift(k);
    }
  } else if (pk && !cols.includes(pk)) {
    cols.unshift(pk);
  }
  return cols;
}

/**
 * Mirrors: ActiveRecord::Associations::JoinDependency::Aliases
 *
 * Caches the column alias mappings for joined tables, providing
 * fast lookup from (node, column) to alias string.
 */
export class Aliases {
  private _aliasCache: Map<JoinPart | null, Map<string, string>>;
  private _allColumns: AliasMap[];
  private _tables: Array<{ node: JoinPart | null; table: TableRef; columns: AliasMap[] }>;

  constructor(tables: Array<{ node: JoinPart | null; table: TableRef; columns: AliasMap[] }>) {
    this._aliasCache = new Map();
    this._allColumns = [];
    this._tables = tables;
    for (const table of tables) {
      const colMap = new Map<string, string>();
      for (const col of table.columns) {
        colMap.set(col.column, col.alias);
        this._allColumns.push(col);
      }
      this._aliasCache.set(table.node, colMap);
    }
  }

  columns(): AliasMap[] {
    return this._allColumns;
  }

  columnAlias(node: JoinPart | null, column: string): string | undefined {
    return this._aliasCache.get(node)?.get(column);
  }

  /** The (column, alias) pairs projected for a single node. */
  columnsForNode(node: JoinPart | null): AliasMap[] {
    return this._tables.find((t) => t.node === node)?.columns ?? [];
  }

  /**
   * Build the SELECT projection — `table[column].as(alias)` for every column of
   * every joined table. Mirrors Rails' Aliases#columns returning Arel nodes.
   */
  selectArel(): Nodes.As[] {
    return this._tables.flatMap((t) => t.columns.map((c) => t.table.get(c.column).as(c.alias)));
  }
}

export class JoinDependency {
  private _baseModel: typeof Base;
  private _baseAlias: string;
  private _aliasTracker: AliasTracker;
  private _aliasesCache?: Aliases;
  /**
   * Mirrors Rails' `@join_root_alias` (join_dependency.rb:154). True when the
   * relation has no explicit `select` — the base table projects all its columns
   * as `t0_r*`. False when an explicit `select` is present — the base table
   * projects only its primary key as `t0_r0`, and the relation's own select list
   * supplies the rest of the projection (hydrated onto the parent record).
   */
  private _joinRootAlias = true;
  private readonly _joinRoot: JoinBase;
  private readonly _joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin;
  /**
   * Mirrors: ActiveRecord::Associations::JoinDependency#@references
   * (join_dependency.rb:88–92). Populated by `joinConstraints` from its
   * `references` argument and read lazily in `makeConstraints` by reflection
   * name. Like Rails — where `@references` keys by referenced table symbol and
   * `make_constraints` reads `@references[reflection.name]` — a join is only
   * re-aliased when a reference and the reflection name coincide.
   */
  private _references: Map<string, string> = new Map();
  /**
   * Mirrors Rails' `@joined_tables` (join_dependency.rb:193-209): the per-emit
   * memo of `[table, terminated]` keyed by the remaining reflection chain
   * (`reflectionChainKey`). A chain tail shared across two through paths (e.g.
   * two `through: :posts` associations both carrying the owner's single `posts`
   * reflection in their chains) reuses the first path's resolved alias and
   * terminates the walk there, so the second path keys off that one alias
   * instead of minting a spurious `{candidate}_join`. Reset every emit in
   * `joinConstraints`.
   * @internal
   */
  private _joinedTables: Map<
    string,
    { aliased: TableRef; effectiveName: string; terminated: boolean }
  > = new Map();
  /**
   * Mirrors: ActiveRecord::Associations::JoinDependency#initialize
   * (join_dependency.rb:71) — `(base, table, associations, join_type)`.
   */
  constructor(
    baseModel: typeof Base,
    table: TableRef | null,
    associations: AssociationSpec | AssociationSpec[] | null,
    joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin | null,
  ) {
    this._baseModel = baseModel;
    const baseTable = table ?? (baseModel as any).arelTable;
    this._baseAlias = baseTable.name ?? (baseModel as any).tableName;
    this._aliasTracker = new AliasTracker(
      this._baseTableAliasLength(),
      new Map([[this._baseAlias, 1]]),
    );
    // `@join_type` is assigned after `@join_root` in Rails; here `build` reads it
    // to construct each node's provisional join, so it is set first.
    this._joinType = joinType ?? Nodes.OuterJoin;
    const tree = JoinDependency.makeTree(associations ?? []);
    this._joinRoot = new JoinBase(baseModel, baseTable, this.build(tree, baseModel));
    this._assignPaths(this._joinRoot, null);
  }

  /**
   * The base model's connection `table_alias_length`, used to cap alias
   * truncation. Rails always builds the tracker inside `pool.with_connection`
   * (alias_tracker.rb:24), so the cap is the connection's value — 256 on MySQL,
   * 63 on PostgreSQL, 64 (default) on SQLite. Prefer the connection threaded by
   * the enclosing `withConnection` wrap over the deprecated `.connection`
   * getter (which flips the lease permanent under a restricted checkout mode);
   * returns `undefined` only when no connection is established (the `.connection`
   * getter throws `ConnectionNotDefined`), letting the tracker fall back to its
   * default so construction never fails on account of alias sizing in
   * connectionless contexts. A genuine connection/adapter error propagates,
   * matching Rails' `pool.with_connection` raise semantics.
   * @internal
   */
  private _baseTableAliasLength(): number | undefined {
    let connection;
    try {
      connection = threadedConnectionFor(this._baseModel) ?? (this._baseModel as any).connection;
    } catch (error) {
      if (error instanceof ConnectionNotDefined) return undefined;
      throw error;
    }
    return typeof connection?.tableAliasLength === "function"
      ? connection.tableAliasLength()
      : undefined;
  }

  /**
   * The t-index for the next table to join: 0 is the base (join root), then one
   * per joined node in allocation order. A counter rather than a walk of the
   * live tree: `build` mirrors Rails in returning the subtree to its caller, so
   * a node is not reachable from the root until the whole tree is built.
   * @internal
   */
  private _tableIndexCounter = 1;

  /** @internal */
  private _nextTableIndex(): number {
    return this._tableIndexCounter++;
  }

  /**
   * Stamp each node's dotted association path (`comments.author`) from the tree
   * shape, once the tree is complete. Rails' JoinAssociation carries no path —
   * it is a trails affordance for path-addressed lookups (`jd.nodes`, preload
   * wiring) — so it cannot be threaded through `build`'s Rails signature.
   * @internal
   */
  private _assignPaths(node: JoinPart, parentPath: string | null): void {
    if (node !== this._joinRoot) {
      node.parentPath = parentPath;
      node.assocName = parentPath
        ? `${parentPath}.${node.immediateAssocName}`
        : node.immediateAssocName;
    }
    for (const child of node.children) {
      this._assignPaths(child, node === this._joinRoot ? null : node.assocName);
    }
  }

  /** @internal */
  get joinRoot(): JoinBase {
    return this._joinRoot;
  }

  get nodes(): JoinPart[] {
    const result: JoinPart[] = [];
    this._joinRoot.each((part) => {
      if (part !== this._joinRoot && part.tableIndex >= 0) {
        result.push(part);
      }
    });
    return result;
  }

  /**
   * Materialize the JOIN node for one already-checked reflection off
   * `modelClass` — the body of Rails' `JoinAssociation.new(reflection, ...)`,
   * which in trails also allocates the node's t-index. A `through` reflection
   * is ONE node here, as in Rails: `JoinAssociation#join_constraints` walks
   * `reflection.chain` internally (join_association.rb:32-73), and the tree
   * holds only JoinBase and JoinAssociation.
   * @internal
   */
  private addAssociation(reflection: any): JoinPart {
    const assocName: string = reflection.name;

    const assocType: "hasMany" | "hasOne" | "belongsTo" =
      reflection.macro === "hasAndBelongsToMany" ? "hasMany" : reflection.macro;
    const targetModel: typeof Base = reflection.klass;
    const targetTable: string = (targetModel as any).tableName;

    const tableIndex = this._nextTableIndex();
    const tableAlias = `t${tableIndex}`;

    // Aliasing and the ON are FULLY deferred to emit-time `makeConstraints`,
    // which BUILDS the join against the table `aliased_table_for` picks
    // (join_dependency.rb:189-211). Construction only records the node's real
    // table so a caller reading the tree before emit sees the un-aliased name.
    const targetArelTable = aliasedArelTableFor(targetModel as never, targetTable);
    const columns = getModelColumns(targetModel);

    const treePart = new JoinAssociation(reflection);
    treePart.tableIndex = tableIndex;
    treePart.arelTable = targetArelTable;
    treePart.tableAlias = tableAlias;
    treePart.effectiveSqlName = targetTable;
    treePart.columns = columns;
    treePart.immediateAssocName = assocName;
    treePart.assocType = assocType;
    treePart.nodeReflection = reflection;
    return treePart;
  }

  /**
   * Mirrors: ActiveRecord::Associations::JoinDependency#build
   * (join_dependency.rb:228-240) — map the normalized make_tree hash to a tree
   * of JoinAssociation nodes, each owning the nodes built from its own nested
   * hash. `findReflection` (Rails' `find_reflection`) raises ConfigurationError
   * for a name that doesn't resolve; `check_validity!` raises
   * CompositePrimaryKeyMismatchError for a composite PK/FK arity mismatch, so a
   * mismatched composite collection surfaces that error here rather than the
   * generic join-key arity error deeper in `joinConstraints`. There is no
   * lenient mode: every reflection that does resolve is JOINed.
   *
   * Rails' `JoinAssociation.new(reflection, build(right, reflection.klass))`
   * builds the children first; trails materializes the node before recursing
   * because it also allocates the node's t-index, which numbers the tables in
   * tree order.
   * @internal
   */
  private build(associations: Record<string, any>, baseKlass: typeof Base): JoinPart[] {
    return Object.keys(associations).flatMap((name) => {
      const right = associations[name];
      const reflection = this.findReflection(baseKlass, name);
      reflection.checkValidityBang?.();
      reflection.checkEagerLoadableBang?.();
      // Rails raises for polymorphic eager loads — the join target table is not
      // known statically.
      if (reflection.isPolymorphic?.()) {
        throw new EagerLoadPolymorphicError(name);
      }
      const node = this.addAssociation(reflection);
      if (right != null) node.children.push(...this.build(right, reflection.klass));
      return [node];
    });
  }

  private _buildSelectArelNodes(): Nodes.As[] {
    return this.aliases().selectArel();
  }

  get baseKlass(): typeof Base {
    return this._baseModel;
  }

  /**
   * Mirrors: `join_root.drop(1).map!(&:reflection)` (join_dependency.rb:81-83) —
   * the Enumerable walk of the join tree, root dropped, reading the reflection
   * each node already carries.
   */
  get reflections(): any[] {
    return this.joinRoot
      .drop(1)
      .map((node) => (node as any).reflection)
      .filter((reflection) => reflection != null);
  }

  /**
   * Mirrors: ActiveRecord::Associations::JoinDependency#join_type
   *
   * The default join type used when building this dependency's constraints.
   * OuterJoin for eager_load, InnerJoin for joins.
   *
   * @internal
   */
  get joinType(): typeof Nodes.InnerJoin | typeof Nodes.OuterJoin {
    return this._joinType;
  }

  // Mirrors: ActiveRecord::Associations::JoinDependency#join_constraints.
  // Records `references` into the `@references` map (join_dependency.rb:88–92);
  // the referenced-table aliasing decision is then made lazily, per node, in
  // `makeConstraints` (join_dependency.rb:202).
  joinConstraints(
    joinsToAdd: JoinDependency[],
    aliasTracker?: AliasTracker,
    references?: Array<string | Nodes.SqlLiteral>,
  ): Nodes.Join[] {
    // Aliasing is resolved here, at emit-time, against the AliasTracker — either
    // the shared one threaded in from `build_joins` (so merged/eager joins collide
    // and alias against the manual joins) or, absent one, a fresh tracker seeded
    // with just the base table. A fresh tracker per emit keeps re-emit idempotent
    // and mirrors Rails creating one `AliasTracker.create`.
    if (aliasTracker) {
      this._aliasTracker = aliasTracker;
    } else {
      this._aliasTracker = new AliasTracker(
        this._baseTableAliasLength(),
        new Map([[this._baseAlias, 1]]),
      );
    }
    this._references = new Map();
    this._joinedTables = new Map();
    if (references) {
      // `@references[table_name.to_sym] = table_name if table_name.is_a?(SqlLiteral)`
      // (join_dependency.rb:90-92) — a bare-String reference promotes `includes`
      // to an eager JOIN but never renames it.
      for (const tableName of references) {
        if (tableName instanceof Nodes.SqlLiteral)
          this._references.set(tableName.value, tableName.value);
      }
    }
    const joins = this.makeJoinConstraints(this.joinRoot, this.joinType);

    for (const oj of joinsToAdd) {
      if (this.joinRoot.isMatch(oj.joinRoot)) {
        joins.push(...this.walk(this.joinRoot, oj.joinRoot, oj.joinType));
      } else {
        joins.push(...this.makeJoinConstraints(oj.joinRoot, oj.joinType));
      }
    }
    return joins;
  }

  /** @internal */
  private makeJoinConstraints(
    joinRoot: JoinPart,
    joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin,
  ): Nodes.Join[] {
    return joinRoot.children.flatMap((child) => this.makeConstraints(joinRoot, child, joinType));
  }

  /**
   * Mirrors Rails JoinDependency#walk: partition the right node's children into
   * those matched in the left tree (intersection) and those not (missing).
   * Matched nodes are merged into the existing left join by reassigning the
   * right node's table to the left's (`r.table = l.table`) and recursing;
   * missing nodes get fresh constraints under `left`.
   * @internal
   */
  private walk(
    left: JoinPart,
    right: JoinPart,
    joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin,
  ): Nodes.Join[] {
    const intersection: [JoinPart, JoinPart][] = [];
    const missing: JoinPart[] = [];

    for (const r of right.children) {
      const l = left.children.find((lc) => r.isMatch(lc));
      if (l) intersection.push([l, r]);
      else missing.push(r);
    }

    const joins = intersection.flatMap(([l, r]) => {
      // Rails: `r.table = l.table`.
      if (r instanceof JoinAssociation) {
        const lt = l.table;
        r.table = l.effectiveSqlName || (typeof lt === "string" ? lt : tableSqlName(lt));
      }
      return this.walk(l, r, joinType);
    });

    return joins.concat(missing.flatMap((n) => this.makeConstraints(left, n, joinType)));
  }

  /**
   * Mirrors: `JoinDependency#make_constraints`
   * (`associations/join_dependency.rb:189-211`) — build `child`'s joins through
   * one `child.joinConstraints(...)` call whose block resolves each chain link's
   * table against the shared `AliasTracker`, then concatenate the recursion over
   * `child.children`.
   *
   * Every JoinDependency in a `build_joins` emits against one shared
   * `AliasTracker` in order, so a `merge` onto an already-joined table — or a
   * self-join / dup-include collision WITHIN this dependency — collides and
   * aliases here. A `has_many :through` walks its whole `reflection.chain`
   * through this same block, inside the one JoinAssociation; only the chain's
   * root link is a tree node, and only its columns are projected.
   * @internal
   */
  private makeConstraints(
    parent: JoinPart,
    child: JoinPart,
    joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin,
  ): Nodes.Join[] {
    const foreignTable =
      parent.arelTable ?? aliasedArelTableFor(parent.baseKlass as never, parent.tableName);
    const foreignKlass = parent.baseKlass;
    const joins: Nodes.Join[] = [];

    if (child instanceof JoinAssociation) {
      let resolvedRoot: { aliased: TableRef; effectiveName: string } | undefined;
      const built = child.joinConstraints(
        foreignTable,
        foreignKlass,
        joinType,
        this.aliasTracker,
        (reflection, remainingReflectionChain) => {
          const chainKey = reflectionChainKey(remainingReflectionChain);
          const memo = this._joinedTables.get(chainKey);
          const root = reflection === child.reflection;

          // `table && (!root || !terminated)` (join_dependency.rb:196-199): a
          // chain tail already resolved by an earlier through/include path
          // reuses that alias and terminates the walk here, so the second path
          // keys off the one shared alias rather than minting a spurious
          // `{candidate}_join`.
          if (memo && (!root || !memo.terminated)) {
            if (root) {
              memo.terminated = true;
              resolvedRoot = memo;
            }
            return [memo.aliased, true];
          }

          // `table_name = @references[reflection.name.to_sym]&.to_s`
          // (join_dependency.rb:200).
          const tableName = this._references.get((reflection as any).name);

          const table = this.aliasTracker.aliasedTableFor(
            aliasedArelTableForReflection(reflection, (reflection as any).tableName),
            tableName ?? null,
            () => {
              const name = (reflection as any).aliasCandidate(parent.tableName);
              return root ? name : `${name}_join`;
            },
          );
          const effectiveName = tableSqlName(table);
          const aliased = aliasedArelTableForReflection(
            reflection,
            (reflection as any).tableName,
            effectiveName,
          );
          if (root) resolvedRoot = { aliased, effectiveName };

          // `@joined_tables[remaining_reflection_chain] ||= [table, root] if
          // join_type == Arel::Nodes::OuterJoin` (join_dependency.rb:208). Keyed
          // off the PARAMETER `join_type`, so an eager OUTER-JOIN dependency
          // folded into an INNER-JOIN primary still memoizes its chain tails.
          if (joinType === Nodes.OuterJoin && !this._joinedTables.has(chainKey)) {
            this._joinedTables.set(chainKey, { aliased, effectiveName, terminated: root });
          }
          return [aliased, false];
        },
      );

      // Rails keeps the whole chain inside the one JoinAssociation
      // (join_association.rb:32-73); only the chain's ROOT link is a tree node,
      // so only its resolved table lands back on the node.
      child.arelJoin = null;
      if (resolvedRoot) {
        child.arelTable = resolvedRoot.aliased;
        child.effectiveSqlName = resolvedRoot.effectiveName;
        // `joinConstraints` walks the chain in reverse, so the root link's own
        // constraint join is the one built against the table this block handed
        // back for it. Identity, not table name — a scope join source is built
        // from `scope.arel(...).join_sources` (join_association.rb:64-69) and so
        // is never the same instance even when it joins a same-named table.
        child.arelJoin =
          (built as Nodes.Join[]).find(
            (join) => (join as { left?: unknown }).left === resolvedRoot!.aliased,
          ) ?? null;
      }
      joins.push(...(built as Nodes.Join[]));
      this._aliasesCache = undefined;
    }

    return joins.concat(child.children.flatMap((c) => this.makeConstraints(child, c, joinType)));
  }

  /**
   * Constructs AR model instances from a flat result row set, assigning
   * associations. Entry point for the eager-load instantiation phase.
   *
   * Mirrors: ActiveRecord::Associations::JoinDependency#instantiate
   * (returns `parents.values`).
   */
  instantiate(
    resultSet: Record<string, unknown>[],
    strictLoadingValue?: boolean | null,
    columnTypes?: Record<string, { deserialize(value: unknown): unknown }>,
    block?: (record: any) => void,
  ): any[] {
    const payload = {
      record_count: resultSet.length,
      class_name: this._baseModel.baseClass.name,
    };
    const { parents, associations, parentKeys } = Notifications.instrument(
      "instantiation.active_record",
      payload,
      () => this.instantiateFromRows(resultSet, strictLoadingValue, columnTypes),
    );

    const inverseMap = new Map<string, string | undefined>();
    const modelAssocs: any[] = (this._baseModel as any)._associations ?? [];
    for (const assoc of modelAssocs) {
      inverseMap.set(assoc.name, assoc.options?.inverseOf);
    }

    for (const parent of parents) {
      const pk = parentKeys.get(parent);
      const assocs = associations.get(pk);
      for (const node of this.nodes) {
        if (node.immediateAssocName.startsWith("_through_")) continue;
        if (node.parentPath !== null) continue;
        const children = assocs?.get(node.immediateAssocName) ?? [];
        const isSingular = node.assocType === "hasOne" || node.assocType === "belongsTo";

        const inverseName = inverseMap.get(node.immediateAssocName);
        if (inverseName) {
          const targets = isSingular ? (children[0] ? [children[0]] : []) : children;
          for (const child of targets) {
            _cacheSingularTarget(child, inverseName, parent);
          }
        }
      }
    }

    if (block) for (const parent of parents) block(parent);
    return parents;
  }

  /**
   * Mirrors: ActiveRecord::Associations::JoinDependency#apply_column_aliases
   * (join_dependency.rb:153) — `@join_root_alias = relation.select_values.empty?`
   * then `relation._select!(-> { aliases.columns })`. When the relation carries
   * an explicit `select`, the base table's alias columns shrink to its primary
   * key (`!join_root_alias`); the relation's own select list then supplies the
   * rest of the projection. The select value is a thunk, as in Rails, so the
   * alias columns are resolved during `build_select` — after `build_joins` has
   * aliased this dependency's nodes against the shared AliasTracker.
   */
  applyColumnAliases(relation: any): any {
    this._joinRootAlias = (relation?.selectValues?.length ?? 0) === 0;
    this._aliasesCache = undefined;
    return relation._selectBang(() => this._buildSelectArelNodes());
  }

  each(callback: (part: JoinPart, index: number) => void): void {
    this.nodes.forEach(callback);
  }

  /**
   * @noRailsEquivalent PERMANENT
   *   (`vendor/rails/activerecord/lib/active_record/associations/join_dependency.rb:158` — `def
   *   each` forwarding to `join_root`).
   * JS iteration protocol — Ruby reaches iteration through Enumerable#each
   */
  [Symbol.iterator](): Iterator<JoinPart> {
    return this.nodes[Symbol.iterator]();
  }

  static makeTree(associations: any): Record<string, any> {
    const hash: Record<string, any> = Object.create(null);
    JoinDependency.walkTree(associations, hash);
    return hash;
  }

  static walkTree(associations: any, hash: Record<string, any>): void {
    if (typeof associations === "string") {
      // Ruby `when Symbol, String then hash[associations.to_sym] ||= {}`
      // (join_dependency.rb:55-56): a Symbol and the equivalent String key the
      // same node, so a Symbol — spelled `":comments"` — drops its colon here.
      const name = associations.startsWith(":") ? associations.slice(1) : associations;
      // Dotted strings ("comments.author") are a trails affordance: split them
      // into nested levels so the builder joins each segment in turn.
      let cur = hash;
      for (const part of name.split(".")) {
        cur = cur[part] ??= Object.create(null);
      }
    } else if (Array.isArray(associations)) {
      for (const assoc of associations) {
        JoinDependency.walkTree(assoc, hash);
      }
    } else if (associations && typeof associations === "object") {
      for (const key of Reflect.ownKeys(associations)) {
        const value = associations[key];
        // Ruby `cache = hash[k] ||= {}` (join_dependency.rb:61-64) stores the key
        // object as-is, and `find_reflection` resolves a Symbol or a String alike
        // (`_reflect_on_association(name)`). `build` looks the stored key up by
        // its string form, so a Symbol key — `{ ":agents": ":agents" }` — drops
        // its colon here instead.
        const k = typeof key === "string" && key.startsWith(":") ? key.slice(1) : String(key);
        if (!hash[k]) hash[k] = Object.create(null);
        if (value != null) JoinDependency.walkTree(value, hash[k]);
      }
    } else {
      let desc: string;
      try {
        desc = JSON.stringify(associations) ?? String(associations);
      } catch {
        desc = `${typeof associations}`;
      }
      throw new ConfigurationError(`Invalid association spec: ${desc}`);
    }
  }

  /**
   * Hydrate models from a flat result row set, mirroring Rails'
   * JoinDependency#instantiate body. `seen` is the identity-keyed
   * parent → node → id → model map (Rails' `compare_by_identity` hash); a JS
   * `Map` keys by object identity, matching it. `modelCache` caches each node's
   * instances by id, with the join-root's entry doubling as the parent dedup
   * map (`parents = model_cache[join_root]`).
   *
   * Returns `{ parents, associations }` rather than Rails' bare `parents.values`:
   * the `associations` map (parent key → assoc name → children) is a trails
   * affordance derived from the wired proxies after construction.
   */
  instantiateFromRows(
    rows: Record<string, unknown>[],
    strictLoadingValue?: boolean | null,
    columnTypes?: Record<string, { deserialize(value: unknown): unknown }>,
  ): {
    parents: any[];
    associations: Map<unknown, Map<string, any[]>>;
    parentKeys: Map<any, unknown>;
  } {
    const joinRoot = this._joinRoot;
    const aliases = this.aliases();
    const basePk = (this._baseModel as any).primaryKey ?? "id";
    const basePkCols: string[] = Array.isArray(basePk) ? basePk : [basePk];
    // The base table's aliased (column, alias) pairs — all columns normally, or
    // just the primary key under an explicit select (`applyColumnAliases`).
    const baseAliasCols = aliases.columnsForNode(joinRoot);
    const aliasSet = new Set(aliases.columns().map((a) => a.alias));

    const seen = new Map<any, Map<JoinPart, Map<unknown, any>>>();
    const modelCache = new Map<JoinPart, Map<unknown, any>>();
    const parents = new Map<unknown, any>();
    modelCache.set(joinRoot, parents);

    for (const row of rows) {
      const parentAttrs: Record<string, unknown> = Object.create(null);
      for (const { column, alias } of baseAliasCols) {
        parentAttrs[column] = row[alias];
      }
      // Rails appends Aliases::Column.new(name, name) for non-`t\d+_r\d+` columns
      // so they land on the parent (and only the parent) record.
      for (const key of Object.keys(row)) {
        if (!aliasSet.has(key)) parentAttrs[key] = row[key];
      }

      // The base key is read out of the aliased row exactly as the child keys are
      // in `construct` (raw `row[aliases.columnAlias(node, col)]`), reusing the
      // values already pulled into parentAttrs — one accessor, never the cast value.
      const parentKey = this._keyFor(basePkCols.map((c) => parentAttrs[c]));
      let parent = parents.get(parentKey);
      if (!parent) {
        parent = (this._baseModel as any)._instantiate(parentAttrs, undefined, columnTypes);
        if (strictLoadingValue && typeof parent.strictLoadingBang === "function") {
          parent.strictLoadingBang();
        }
        parents.set(parentKey, parent);
      }

      this.construct(parent, joinRoot, row, seen, modelCache, strictLoadingValue);
    }

    const parentList = [...parents.values()];
    // Reverse index: each parent record → the RAW aliased dedup key it was
    // stored under (the same `_keyFor` key `_collectAssociations` uses). The
    // eager inverse-cache loop must look `associations` up by this raw key, not
    // by re-reading the instantiated record's (deserialized) PK, which can
    // diverge from the raw row value on adapters that deserialize PK columns.
    const parentKeys = new Map<any, unknown>();
    for (const [key, parent] of parents) parentKeys.set(parent, key);
    return {
      parents: parentList,
      associations: this._collectAssociations(parents),
      parentKeys,
    };
  }

  /**
   * Recursive tree-walk hydration — mirrors Rails' JoinDependency#construct.
   * @internal
   */
  private construct(
    arParent: any,
    parent: JoinPart,
    row: Record<string, unknown>,
    seen: Map<any, Map<JoinPart, Map<unknown, any>>>,
    modelCache: Map<JoinPart, Map<unknown, any>>,
    strictLoadingValue?: boolean | null,
  ): void {
    if (arParent == null) return;
    const aliases = this.aliases();
    for (const node of parent.children) {
      if (node.tableIndex < 0) continue;

      const isCollection = node.assocType === "hasMany";
      if (isCollection) {
        this._markCollectionLoaded(arParent, node);
      } else if (
        arParent._associationInstances &&
        isAssociationCached(arParent, node.immediateAssocName)
      ) {
        const model = arParent.association?.(node.immediateAssocName)?.target;
        this.construct(model, node, row, seen, modelCache, strictLoadingValue);
        continue;
      }

      // Mirrors Rails' two-branch identity-key derivation in
      // JoinDependency#construct. A node whose model has a primary key keys its
      // identity off the aliased PK columns; one without (a join/HABTM record
      // or a view) keys the nil-check off `reflection.join_primary_key`. trails
      // marks "no primary key" with a falsy primaryKey ("" / null), matching
      // Rails' nil `node.primary_key`.
      const nodePk = (node.baseKlass as any).primaryKey;
      let keyCols: string[];
      if (nodePk) {
        keyCols = Array.isArray(nodePk) ? nodePk : [nodePk];
      } else {
        const jpk = ((node as JoinAssociation).reflection as any).joinPrimaryKey as
          | string
          | string[];
        keyCols = Array.isArray(jpk) ? jpk : [jpk];
      }
      const keyVals = keyCols.map((c) => row[aliases.columnAlias(node, String(c))!]);
      if (keyVals.some((v) => v === null || v === undefined)) {
        this._markAssociationLoaded(arParent, node);
        continue;
      }
      // Rails: PK nodes key on the real id values; no-PK nodes use the constant
      // `[nil]` sentinel (see NO_PRIMARY_KEY_ID). Both are truthy, so the row is
      // always inserted into `seen` / `model_cache` (`seen[...][id] = model if id`),
      // and multiple no-PK rows for one parent+node collapse to a single model.
      const id = nodePk ? this._keyFor(keyVals) : NO_PRIMARY_KEY_ID;

      let parentSeen = seen.get(arParent);
      if (!parentSeen) {
        parentSeen = new Map();
        seen.set(arParent, parentSeen);
      }
      let nodeSeen = parentSeen.get(node);
      if (!nodeSeen) {
        nodeSeen = new Map();
        parentSeen.set(node, nodeSeen);
      }
      let model = nodeSeen.get(id);
      if (!model) {
        model = this.constructModel(arParent, node, row, modelCache, id, strictLoadingValue);
        nodeSeen.set(id, model);
      }

      this.construct(model, node, row, seen, modelCache, strictLoadingValue);
    }
  }

  /**
   * Derive a dedup key from a node's (possibly composite) primary-key VALUES.
   *
   * Callers always supply the RAW aliased column values pulled straight out of the
   * row (`row[aliases.column_alias(node, col)]`, per Rails join_dependency.rb:144,
   * :256) — never the model-cast value. Routing every key through this one helper
   * (the parents map, the per-node `seen`/modelCache identity, and the returned
   * associations map) guarantees a key can't be written one way and read another,
   * which would silently split or collide parents. Single-column keys pass the bare
   * value through (a JS Map keys primitives by value); composite keys join on NUL,
   * a separator that can't appear in a column value, mirroring Rails' array id.
   * @internal
   */
  private _keyFor(vals: unknown[]): unknown {
    return vals.length === 1 ? vals[0] : vals.join("\u0000");
  }

  /**
   * Build the parent-key → assoc-name → children map from the wired proxies.
   * A trails affordance with no Rails analogue (Rails returns only
   * `parents.values`). Keyed by the SAME raw aliased dedup key the `parents` map
   * uses (`_keyFor`), so an entry seeded during instantiation is found again with
   * the identical key — no raw-vs-cast / `_readAttribute` divergence on the key path.
   * @internal
   */
  private _collectAssociations(parents: Map<unknown, any>): Map<unknown, Map<string, any[]>> {
    const associations = new Map<unknown, Map<string, any[]>>();
    for (const [key, parent] of parents) {
      const assocs = new Map<string, any[]>();
      for (const child of this._joinRoot.children) {
        if (child.tableIndex < 0) continue;
        const proxy = parent.association?.(child.immediateAssocName);
        const target = proxy?.target;
        assocs.set(
          child.immediateAssocName,
          Array.isArray(target) ? target : target ? [target] : [],
        );
      }
      associations.set(key, assocs);
    }
    return associations;
  }

  /**
   * Mirrors: ActiveRecord::Associations::JoinDependency#join_root_alias
   * (protected in Rails — the alias used for the root table in the query)
   */
  protected get joinRootAlias(): string {
    return this._baseAlias;
  }

  /** @internal */
  private get aliasTracker(): AliasTracker {
    return this._aliasTracker;
  }

  /**
   * @internal
   * Mirrors: ActiveRecord::Associations::JoinDependency#find_reflection
   */
  private findReflection(klass: typeof Base, name: string): any {
    const reflection = _reflectOnAssociation(klass as any, name);
    if (!reflection) {
      throw new ConfigurationError(
        `Can't join '${(klass as any).name}' to association named '${name}'; perhaps you misspelled it?`,
      );
    }
    return reflection;
  }

  /**
   * Build the `Aliases` value object lazily from the tree (mirrors Rails
   * JoinDependency#aliases — `join_root.each_with_index` over column names).
   * The base table is keyed by the join root; each joined node supplies its own
   * column names and Arel table. Replaces the index-keyed `_aliases`/`_arelTablesByIndex`.
   *
   * Memoized like Rails' `@aliases ||=`; the tree is fully built in the
   * constructor and never mutated afterwards, so the memo can never go stale.
   * @internal
   */
  private aliases(): Aliases {
    // Rails' join_root tree holds only the reflected association nodes — the
    // through/HABTM join-table links are joined by JoinAssociation#join_constraints
    // but never become JoinParts, so their columns are not projected into the
    // eager SELECT (and thus never need a GROUP BY entry). The table index is
    // the node's own `tableIndex` rather than Ruby's `each_with_index` position.
    return (this._aliasesCache ??= new Aliases(
      [this._joinRoot, ...this.nodes].map((joinPart) => {
        const isJoinRoot = joinPart === this._joinRoot;
        let columnNames: string[];
        if (isJoinRoot && !this._joinRootAlias) {
          const primaryKey = (this._baseModel as any).primaryKey;
          columnNames = primaryKey ? (Array.isArray(primaryKey) ? primaryKey : [primaryKey]) : [];
        } else {
          columnNames = isJoinRoot ? getModelColumns(this._baseModel) : joinPart.columns;
        }
        const i = isJoinRoot ? 0 : joinPart.tableIndex;
        const columns: AliasMap[] = columnNames.map((columnName, j) => ({
          column: columnName,
          alias: `t${i}_r${j}`,
        }));
        return { node: joinPart, table: joinPart.arelTable as TableRef, columns };
      }),
    ));
  }

  /**
   * Build (or fetch from `modelCache`) the child record for `node`, wire it into
   * `record`'s association, and apply readonly / strict-loading flags.
   *
   * Mirrors: ActiveRecord::Associations::JoinDependency#construct_model
   */
  private constructModel(
    record: any,
    node: JoinPart,
    row: Record<string, unknown>,
    modelCache: Map<JoinPart, Map<unknown, any>>,
    id: unknown,
    strictLoadingValue?: boolean | null,
  ): any {
    let nodeCache = modelCache.get(node);
    if (!nodeCache) {
      nodeCache = new Map();
      modelCache.set(node, nodeCache);
    }
    let model = nodeCache.get(id);
    if (!model) {
      const attrs: Record<string, unknown> = {};
      const aliases = this.aliases();
      for (let i = 0; i < node.columns.length; i++) {
        attrs[node.columns[i]] = row[aliases.columnAlias(node, node.columns[i])!];
      }
      // Apply strict-loading and wire the inverse inside the instantiation
      // block so both land BEFORE the child's find/initialize callbacks fire.
      // Mirrors Rails' `construct_model`, whose `node.instantiate` block runs
      // `m.strict_loading! if strict_loading_value` then
      // `other.set_inverse_instance(m)`. For a cache hit the inverse was already
      // wired when the model was first built; `_wireAssociationProxy` re-applies
      // it idempotently below.
      model = (node.baseKlass as any)._instantiate(attrs, (built: any) => {
        if (strictLoadingValue && typeof built.strictLoadingBang === "function") {
          built.strictLoadingBang();
        }
        this._setInverseBeforeCallbacks(record, node, built);
      });
      if (id != null) nodeCache.set(id, model);
    }

    this._wireAssociationProxy(record, node, model);

    if (node.isReadonly()) model._readonly = true;
    if (node.isStrictLoading() && typeof model.strictLoadingBang === "function") {
      model.strictLoadingBang();
    }
    return model;
  }

  /**
   * @internal
   * Wire only the inverse target on a freshly instantiated eager-loaded child,
   * routed as the `_instantiate` block so it runs before the child's
   * find/initialize callbacks. Pushing the child into the parent's proxy target
   * still happens in `_wireAssociationProxy` after instantiation.
   */
  private _setInverseBeforeCallbacks(parent: any, node: JoinPart, child: any): void {
    if (typeof parent.association !== "function") return;
    try {
      const proxy = parent.association(node.immediateAssocName);
      if (proxy && typeof proxy.setInverseInstance === "function") {
        proxy.setInverseInstance(child);
      }
    } catch (e) {
      if (!(e instanceof AssociationNotFoundError)) throw e;
    }
  }

  /**
   * @internal
   * Wire a child model into the parent's association proxy.
   * Mirrors Rails' `construct_model` setting `other.target` and `other.loaded`.
   */
  private _wireAssociationProxy(parent: any, node: JoinPart, child: any): void {
    if (typeof parent.association !== "function") return;
    try {
      const proxy = parent.association(node.immediateAssocName);
      if (!proxy) return;
      const isCollection = node.assocType === "hasMany";
      if (isCollection) {
        if (!proxy.loaded) {
          proxy.target = [];
        }
        if (Array.isArray(proxy.target)) {
          proxy.target.push(child);
        }
      } else {
        proxy._setTargetFromLoader(child);
      }
      proxy._loadedFromPreload = true;
      if (typeof proxy.setInverseInstance === "function") {
        proxy.setInverseInstance(child);
      }
    } catch (e) {
      if (!(e instanceof AssociationNotFoundError)) throw e;
    }
  }

  /**
   * @internal
   * Mirrors Rails' `other.loaded!` at the top of `construct` for a collection
   * node: mark the proxy loaded (seeding an empty target) without clobbering any
   * children already pushed by a prior row.
   */
  private _markCollectionLoaded(parent: any, node: JoinPart): void {
    if (typeof parent.association !== "function") return;
    try {
      const proxy = parent.association(node.immediateAssocName);
      if (!proxy || proxy.loaded) return;
      proxy.target = [];
      proxy._loadedFromPreload = true;
    } catch (e) {
      if (!(e instanceof AssociationNotFoundError)) throw e;
    }
  }

  /**
   * @internal
   * Mark an association as loaded (empty) when the join row is all-null.
   */
  private _markAssociationLoaded(parent: any, node: JoinPart): void {
    if (typeof parent.association !== "function") return;
    try {
      const proxy = parent.association(node.immediateAssocName);
      if (!proxy || proxy.loaded) return;
      const isCollection = node.assocType === "hasMany";
      proxy._setTargetFromLoader(isCollection ? [] : null);
      proxy._loadedFromPreload = true;
    } catch (e) {
      if (!(e instanceof AssociationNotFoundError)) throw e;
    }
  }
}
