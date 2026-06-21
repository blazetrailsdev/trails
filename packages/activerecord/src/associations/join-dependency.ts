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

import type { Base } from "../base.js";
import type { AssociationSpec } from "../relation/query-methods.js";
import {
  underscore as _toUnderscore,
  camelize as _camelize,
  singularize as _singularize,
} from "@blazetrails/activesupport";
import { Table, Nodes } from "@blazetrails/arel";
import { modelRegistry, isAssociationCached } from "../associations.js";
import { _reflectOnAssociation } from "../reflection.js";
import { getInheritanceColumn, isStiSubclass } from "../inheritance.js";
import { JoinBase } from "./join-dependency/join-base.js";
import { JoinAssociation } from "./join-dependency/join-association.js";
import { JoinPart } from "./join-dependency/join-part.js";
import { AssociationNotFoundError, EagerLoadPolymorphicError } from "./errors.js";
import { ConfigurationError } from "../errors.js";
import { AliasTracker } from "./alias-tracker.js";

/**
 * Identity-cache key for a no-primary-key node. Rails uses `id = keys.map { nil }`
 * — a `[nil]` array, which is truthy in Ruby and compares equal across rows — so
 * every no-PK row for a given parent+node collapses to one cached model. A single
 * shared sentinel reproduces that constant-key behavior.
 */
const NO_PRIMARY_KEY_ID = Symbol("JoinDependency.noPrimaryKeyId");

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
  const cols: string[] = ch ? Object.keys(ch) : (modelClass.columnNames?.() ?? []);
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
  private _tables: Array<{ node: JoinPart | null; table: Table; columns: AliasMap[] }>;

  constructor(tables: Array<{ node: JoinPart | null; table: Table; columns: AliasMap[] }>) {
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
  constructor(baseModel: typeof Base, joinType?: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin) {
    this._baseModel = baseModel;
    this._baseAlias = (baseModel as any).tableName;
    this._aliasTracker = new AliasTracker(undefined, new Map([[this._baseAlias, 1]]));
    const baseTable = (baseModel as any).arelTable;
    this._joinRoot = new JoinBase(baseModel, baseTable);
    this._joinType = joinType ?? Nodes.OuterJoin;
  }

  /**
   * The t-index for the next table to join: 0 is the base (join root), then one
   * per joined node in allocation order. Derived from the live tree rather than
   * a mutable counter, so rollback (node pruning) restores it for free.
   * @internal
   */
  private _nextTableIndex(): number {
    let count = 1;
    this._joinRoot.each((p) => {
      if (p !== this._joinRoot) count++;
    });
    return count;
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

  addAssociation(
    assocName: string,
    options?: {
      fromModel?: any;
      fromAlias?: string;
      parentAssocName?: string;
    },
  ): JoinPart | null {
    const modelClass = options?.fromModel ?? this._baseModel;
    const associations: any[] = modelClass._associations ?? [];
    const assocDef = associations.find((a: any) => a.name === assocName);
    if (!assocDef) return null;

    // Rails' JoinDependency#find_reflection uses `_reflect_on_association`
    // (raw `_reflections`), not the normalized lookup — so the auto-generated
    // HABTM middle reflection (hidden behind its parent in
    // `normalizedReflections`) is still joinable by its own name.
    const reflection = _reflectOnAssociation(modelClass, assocName);
    if (reflection) {
      // Mirrors: ActiveRecord::Associations::JoinDependency#build (join_dependency.rb:232)
      (reflection as any).checkEagerLoadableBang?.();
    }

    const sourceAlias = options?.fromAlias ?? this._baseAlias;
    const sourcePk = modelClass.primaryKey ?? "id";
    if (Array.isArray(sourcePk)) return null;

    const tableIndex = this._nextTableIndex();
    const tableAlias = `t${tableIndex}`;

    let targetModel: typeof Base | undefined;
    let targetTable: string;
    let foreignKey: string;
    let primaryKey: string;
    let isBelongsTo = false;
    const assocType: "hasMany" | "hasOne" | "belongsTo" =
      assocDef.type === "hasAndBelongsToMany" ? "hasMany" : assocDef.type;

    if (assocDef.type === "belongsTo") {
      // Rails raises for polymorphic eager loads — the join target table is
      // not known statically (join_dependency.rb#build). This is distinct from
      // the capability-gap fallbacks below (CPK / unjoinable through), which
      // return null so the caller degrades to preloading.
      if (assocDef.options.polymorphic) {
        throw new EagerLoadPolymorphicError(assocName);
      }
      foreignKey = assocDef.options.foreignKey ?? `${_toUnderscore(assocName)}_id`;
      if (Array.isArray(foreignKey)) return null;
      const className = assocDef.options.className ?? _camelize(assocName);
      targetModel = modelRegistry.get(className);
      if (!targetModel) return null;
      targetTable = (targetModel as any).tableName;
      primaryKey = assocDef.options.primaryKey ?? (targetModel as any).primaryKey ?? "id";
      if (Array.isArray(primaryKey)) return null;
      isBelongsTo = true;
    } else if (
      assocDef.type === "hasMany" ||
      assocDef.type === "hasOne" ||
      assocDef.type === "hasAndBelongsToMany"
    ) {
      if (assocDef.options.through) {
        if (reflection && reflection.isThroughReflection()) {
          const result = this._addThroughViaJoinAssociation(
            assocDef,
            reflection,
            modelClass,
            sourceAlias,
            options?.parentAssocName,
          );
          if (result) return result;
        }
        return null;
      }
      const className =
        assocDef.options.className ??
        _camelize(assocDef.type === "hasMany" ? _singularize(assocName) : assocName);
      targetModel = modelRegistry.get(className);
      if (!targetModel) return null;
      targetTable = (targetModel as any).tableName;
      foreignKey = assocDef.options.as
        ? (assocDef.options.foreignKey ?? `${_toUnderscore(assocDef.options.as)}_id`)
        : (assocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`);
      if (Array.isArray(foreignKey)) return null;
      primaryKey = assocDef.options.primaryKey ?? sourcePk;
      if (Array.isArray(primaryKey)) return null;
    } else {
      return null;
    }

    // Register the join's table for collision tracking, mirroring
    // `aliased_table_for`: the real table on first use, otherwise the
    // reflection's `alias_candidate` (`{plural_name}_{parent_table}`, with `_N`
    // on repeat), not `t{index}`. Referenced-table aliasing
    // (`includes(:author).references(:author)` → `authors AS author`) is NOT
    // resolved here — it is deferred to `makeConstraints` (join_dependency.rb:202),
    // mirroring Rails' lazy consumption of `@references`.
    let effectiveName: string;
    if ((this._aliasTracker.aliases.get(targetTable!) ?? 0) === 0) {
      this._aliasTracker.aliases.set(targetTable!, 1);
      effectiveName = targetTable!;
    } else {
      // Collision: route through AliasTracker with the Rails alias candidate
      // (aliasNameFor bumps the candidate's count and suffixes `_N` on repeat).
      const parentTableName = modelClass.tableName;
      const candidate = reflection
        ? reflection.aliasCandidate(parentTableName)
        : `${targetTable!}_${parentTableName}`;
      effectiveName = this._aliasTracker.aliasNameFor(candidate);
    }

    const targetArelTable =
      effectiveName === targetTable!
        ? new Table(targetTable!)
        : new Table(targetTable!, { as: effectiveName });
    const sourceArelTable = new Table(sourceAlias);

    // A has_many/has_one join keys off the target's foreign key against the
    // source's primary key — the target model's own primary key is never used
    // for the ON clause. A belongs_to join keys off `primaryKey` (already
    // range-checked above). So a composite-PK target (e.g. the auto-generated
    // HABTM middle join model, whose PK is `[ownerFk, targetFk]`) is still a
    // valid join target and must not degrade to preloading.
    if (isBelongsTo) {
      const targetModelPk = (targetModel as any).primaryKey ?? "id";
      if (Array.isArray(targetModelPk)) return null;
    }

    const columns = getModelColumns(targetModel);

    // Build JOIN via JoinAssociation when reflection is available (mirrors Rails),
    // falling back to inline predicate construction otherwise.
    let arelJoin: Nodes.Join;
    let scopeJoinSources: Nodes.Node[] = [];
    if (reflection) {
      const joinAssoc = new JoinAssociation(reflection);
      const joins = joinAssoc.joinConstraints(
        sourceArelTable,
        modelClass,
        this._joinType,
        this._aliasTracker,
        (_refl, _remaining) => [targetArelTable, false],
      );
      arelJoin = joins[0] as Nodes.Join;
      scopeJoinSources = joinAssoc.joinSources;
      // When the target table was aliased (collision), scope/STI predicates from
      // klass.all() reference the unaliased table. Rebind to the aliased table.
      // Skip when the source (foreign) table shares the target's real name — a
      // self-join — because a name-based rebind cannot tell the join's own
      // (already-aliased) target columns from the foreign-side columns, and would
      // wrongly rewrite the FK equality's foreign reference onto the alias.
      if (effectiveName !== targetTable! && sourceAlias !== targetTable!) {
        const on = (arelJoin as any).right as Nodes.On;
        const rebound = rebindTableReferences(on.expr as Nodes.Node, targetTable!, targetArelTable);
        if (rebound !== on.expr) {
          arelJoin = new this._joinType((arelJoin as any).left, new Nodes.On(rebound));
        }
      }
    } else {
      let predicate: Nodes.Node;
      if (isBelongsTo) {
        predicate = targetArelTable.get(primaryKey!).eq(sourceArelTable.get(foreignKey!));
      } else {
        predicate = targetArelTable.get(foreignKey!).eq(sourceArelTable.get(primaryKey!));
      }
      if (!isBelongsTo && assocDef.options.as) {
        const typeCol = `${_toUnderscore(assocDef.options.as)}_type`;
        const typePred = targetArelTable.get(typeCol).eq(new Nodes.Quoted(modelClass.name));
        predicate = new Nodes.And([predicate, typePred]);
      }
      if (assocDef.options.scope && typeof assocDef.options.scope === "function") {
        const scopeRel = assocDef.options.scope((targetModel as any)._allForPreload());
        if (scopeRel?._whereClause && !scopeRel._whereClause.isEmpty()) {
          let scopeAst: Nodes.Node = scopeRel._whereClause.ast;
          if (effectiveName !== targetTable!) {
            scopeAst = rebindTableReferences(scopeAst, targetTable!, targetArelTable);
          }
          predicate =
            predicate instanceof Nodes.And
              ? new Nodes.And([...predicate.children, scopeAst])
              : new Nodes.And([predicate, scopeAst]);
        }
      }
      predicate = this._addStiConstraintArel(predicate, targetModel, targetArelTable);
      arelJoin = new this._joinType(targetArelTable, new Nodes.On(predicate));
    }

    const treePart = reflection ? new JoinAssociation(reflection) : new JoinLeaf(targetModel);
    treePart.scopeJoinSources = scopeJoinSources;
    treePart.tableIndex = tableIndex;
    treePart.arelTable = targetArelTable;
    treePart.tableAlias = tableAlias;
    treePart.tableName = targetTable!;
    treePart.effectiveSqlName = effectiveName;
    treePart.columns = columns;
    treePart.assocName = options?.parentAssocName
      ? `${options.parentAssocName}.${assocName}`
      : assocName;
    treePart.immediateAssocName = assocName;
    treePart.parentPath = options?.parentAssocName ?? null;
    treePart.assocType = assocType;
    treePart.arelJoin = arelJoin;
    treePart.nodeReflection = reflection ?? null;
    treePart.isThroughNode = false;
    this._insertTreeNode(treePart);
    return treePart;
  }

  /**
   * Add a nested association path like "comments.author", joining each segment.
   * Routes through the single make_tree-style build path (`addAssociationSpec`),
   * then returns the leaf node for the path. Returns null if any segment is
   * un-joinable (the whole path is rolled back, per `addAssociationSpec`).
   */
  addNestedAssociation(path: string): JoinPart | null {
    if (!this.addAssociationSpec(path)) return null;
    return this._findNodeByPath(path);
  }

  /**
   * Add an arbitrary nested eager-load spec (string, dotted string, array, or
   * hash like `{ author: "posts" }` / `{ author: ["posts", "comments"] }`).
   * Shared prefixes are deduplicated against the existing tree, so passing
   * specs that overlap reuses already-joined nodes instead of double-joining.
   *
   * All-or-nothing per call. Two distinct outcomes when a segment can't be
   * JOINed (mirrors Rails JoinDependency#build, which raises for the former):
   *   - **Raise-worthy** (polymorphic): `addAssociation` throws
   *     `EagerLoadPolymorphicError`, which propagates out of this method
   *     uncaught — eager-loading a polymorphic association is an error, not a
   *     fallback.
   *   - **Capability gap** (composite key, unjoinable through): the whole spec
   *     is rolled back and `false` is returned so the caller degrades to
   *     preloading.
   *
   * Mirrors: ActiveRecord::Associations::JoinDependency#build (recursive tree
   * construction from the eager_load values hash).
   */
  addAssociationSpec(spec: AssociationSpec): boolean {
    // Normalize the spec into a make_tree-style nested hash up front, then
    // construct the tree from it in one walk (mirrors Rails building the whole
    // tree once from `make_tree(associations)` rather than incrementally).
    // Referenced-table aliasing is resolved lazily in `makeConstraints` from the
    // `references` argument to `joinConstraints`, mirroring Rails' `@references`.
    const tree = JoinDependency.makeTree(spec);
    const snapshot = this._capture();
    try {
      if (!this._buildSpecTree(tree, this._baseModel, this._baseAlias, "")) {
        this._rollback(snapshot);
        return false;
      }
    } catch (e) {
      // addAssociation mutates the tree/aliasTracker before the
      // polymorphic check throws. Restore so the instance is left unchanged
      // (all-or-nothing) before propagating EagerLoadPolymorphicError.
      this._rollback(snapshot);
      throw e;
    }
    return true;
  }

  /**
   * Rails-faithful eager-load validation: walk the spec tree and raise the same
   * errors `construct_join_dependency` does before any SQL is built —
   * `ConfigurationError` for a misspelled/unknown name (via `findReflection`,
   * mirroring Rails `find_reflection`) and `EagerLoadPolymorphicError` for a
   * polymorphic association. Valid-but-unjoinable specs (composite-key
   * belongsTo, through associations trails can't alias) do NOT raise — Rails
   * joins them and trails degrades them to preloading separately.
   *
   * Used by the calculation/exists paths (`Relation#_checkEagerLoadable`), which
   * never build the real join tree but must still surface these errors. Unlike
   * `addAssociationSpec` this only validates — it doesn't mutate the tree —
   * so there's nothing to roll back.
   *
   * Mirrors: ActiveRecord::Associations::JoinDependency#build.
   */
  validateEagerLoadSpec(spec: AssociationSpec): void {
    this.build(JoinDependency.makeTree(spec), this._baseModel);
  }

  /**
   * Build the join tree from a normalized make_tree-style hash (dotted strings
   * already split into nested keys by `walkTree`). Each key becomes a
   * JOIN via `_addOrReuse`; children recurse under the joined node's model and
   * effective alias. Returns false on the first un-joinable segment so the
   * caller can roll back and degrade to preloading.
   * @internal
   */
  private _buildSpecTree(
    hash: Record<PropertyKey, any>,
    model: typeof Base,
    alias: string,
    parentPath: string,
  ): boolean {
    for (const key of Reflect.ownKeys(hash)) {
      const name = typeof key === "symbol" ? (key.description ?? String(key)) : String(key);
      const node = this._addOrReuse(name, model, alias, parentPath);
      if (!node) return false;
      const child = hash[key];
      const childPath = parentPath ? `${parentPath}.${name}` : name;
      if (
        child != null &&
        Reflect.ownKeys(child).length > 0 &&
        !this._buildSpecTree(child, node.baseKlass, node.effectiveSqlName, childPath)
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Add `assocName` under `parentPath`, reusing an existing tree node when the
   * same path was already joined (shared-prefix dedup).
   * @internal
   */
  private _addOrReuse(
    assocName: string,
    fromModel: typeof Base,
    fromAlias: string,
    parentPath: string,
  ): JoinPart | null {
    const existing = this._findNodeByPath(parentPath ? `${parentPath}.${assocName}` : assocName);
    if (existing) return existing;
    return this.addAssociation(assocName, {
      fromModel,
      fromAlias,
      parentAssocName: parentPath || undefined,
    });
  }

  /**
   * Resolve a tree node by its dotted association path (`comments.author`) by
   * walking children from the root. Replaces the `_treeNodesByPath` index:
   * the tree itself is the source of truth. Empty/null path is the root.
   * @internal
   */
  private _findNodeByPath(path: string | null): JoinPart | null {
    if (!path) return this._joinRoot;
    let node: JoinPart = this._joinRoot;
    for (const segment of path.split(".")) {
      const child = node.children.find((c) => c.immediateAssocName === segment);
      if (!child) return null;
      node = child;
    }
    return node;
  }

  /**
   * Snapshot the alias bookkeeping + current tree nodes so an all-or-nothing
   * spec build can be rolled back when a later segment proves un-joinable.
   * @internal
   */
  private _capture(): {
    nodes: Set<JoinPart>;
    tracker: Map<string, number>;
  } {
    const nodes = new Set<JoinPart>();
    this._joinRoot.each((p) => {
      if (p !== this._joinRoot) nodes.add(p);
    });
    return {
      nodes,
      tracker: new Map(this._aliasTracker.aliases),
    };
  }

  /** @internal */
  private _rollback(snapshot: { nodes: Set<JoinPart>; tracker: Map<string, number> }): void {
    const prune = (parent: JoinPart): void => {
      for (let i = parent.children.length - 1; i >= 0; i--) {
        const child = parent.children[i];
        if (snapshot.nodes.has(child)) {
          prune(child);
        } else {
          parent.children.splice(i, 1);
        }
      }
    };
    prune(this._joinRoot);
    this._aliasesCache = undefined;
    this._aliasTracker.aliases.clear();
    for (const [k, v] of snapshot.tracker) this._aliasTracker.aliases.set(k, v);
  }

  private _buildSelectArelNodes(): Nodes.As[] {
    return this.aliases().selectArel();
  }

  get baseKlass(): typeof Base {
    return this._baseModel;
  }

  get reflections(): any[] {
    const result: any[] = [];
    this._joinRoot.eachChildren((parent, child) => {
      if (child.tableIndex < 0) return;
      const reflection = _reflectOnAssociation(parent.baseKlass as any, child.immediateAssocName);
      if (reflection) result.push(reflection);
    });
    return result;
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
    references?: string[],
  ): Nodes.Join[] {
    if (aliasTracker) this._aliasTracker = aliasTracker;
    this._references = new Map();
    if (references) {
      for (const tableName of references) this._references.set(tableName, tableName);
    }
    const joins = this.makeJoinConstraints(this._joinRoot, this._joinType);

    for (const oj of joinsToAdd) {
      if (this._joinRoot.isMatch(oj._joinRoot)) {
        joins.push(...this.walk(this._joinRoot, oj._joinRoot, oj._joinType));
      } else {
        joins.push(...this.makeJoinConstraints(oj._joinRoot, oj._joinType));
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
      this._reassignTable(l, r);
      return this.walk(l, r, joinType);
    });

    return joins.concat(missing.flatMap((n) => this.makeConstraints(left, n, joinType)));
  }

  /**
   * Rails: `r.table = l.table`. trails precomputes each join's ON predicates at
   * tree-construction time, so reassigning the table also rebinds the matched
   * node's child ON predicates from the right tree's table name to the left's.
   * @internal
   */
  private _reassignTable(l: JoinPart, r: JoinPart): void {
    if (!(r instanceof JoinAssociation || r instanceof JoinLeaf)) return;
    const originalTable = r.effectiveSqlName || r.table;
    const lEffective = l.effectiveSqlName;
    let resolvedTable: string;
    if (lEffective) {
      resolvedTable = lEffective;
    } else {
      const lt = l.table;
      resolvedTable = typeof lt === "string" ? lt : (lt.tableAlias ?? lt.name);
    }
    r.table = resolvedTable;
    if (originalTable === resolvedTable) return;

    // r's children were built referencing r's old table name; re-point their ON
    // predicates to the merged (left) table so the emitted SQL is self-consistent.
    const toTable = new Table(resolvedTable);
    for (const child of r.children) {
      const arelJoin = child.arelJoin;
      if (!arelJoin) continue;
      const on = arelJoin.right;
      if (!(on instanceof Nodes.On)) continue;
      const rebound = rebindTableReferences(on.expr as Nodes.Node, originalTable, toTable);
      if (rebound !== on.expr) {
        const JoinClass = arelJoin.constructor as new (
          left: Nodes.Node,
          right: Nodes.Node,
        ) => Nodes.Join;
        child.arelJoin = new JoinClass(arelJoin.left, new Nodes.On(rebound));
      }
    }
  }

  /**
   * Lazily resolve a referenced-table alias for `child`, mirroring Rails
   * `make_constraints` reading `table_name = @references[reflection.name]` and
   * feeding it to `alias_tracker.aliased_table_for(klass.arel_table, table_name)
   * { reflection.alias_candidate(parent.table_name) }` (join_dependency.rb:202,
   * alias_tracker.rb).
   *
   * `includes(:author).references(:author)` records `author` in `@references`;
   * when the join for `:author` is emitted, `aliased_table_for` uses the
   * referenced name on its first use (`authors AS author`), and otherwise — when
   * that name is already taken — the reflection's `alias_candidate`
   * (`{plural}_{parent}`, with `_N` on repeat), NOT a numeric suffix of the
   * referenced name. The node's `effectiveSqlName`/`arelTable` and the join's
   * (and its children's) ON predicates are rebound so the SELECT projection and
   * SQL stay consistent. Idempotent: once the node already carries the resolved
   * name, it no-ops.
   * @internal
   */
  private _applyReferencedAlias(parent: JoinPart, child: JoinPart): void {
    if (this._references.size === 0 || !(child instanceof JoinAssociation)) return;
    const referenced = this._references.get(child.immediateAssocName);
    if (!referenced || referenced === child.effectiveSqlName) return;

    const tableName = child.tableName;
    // Inline of aliased_table_for(klass.arel_table, table_name) { candidate }:
    // the referenced name on first use, else the reflection's alias_candidate.
    let newName: string;
    if ((this._aliasTracker.aliases.get(referenced) ?? 0) === 0) {
      this._aliasTracker.aliases.set(referenced, 1);
      newName = referenced;
    } else {
      const parentTableName = (parent.baseKlass as any)?.tableName ?? parent.table;
      newName = this._aliasTracker.aliasNameFor(child.reflection.aliasCandidate(parentTableName));
    }
    this._rebindChildAlias(child, newName);
  }

  /**
   * Re-point `child` to the SQL alias `newName`: rebuild its arelTable, JOIN
   * left side, and ON predicate (and its children's ON predicates that
   * referenced its old table) so the SELECT projection and JOIN clause name the
   * same table. No-op when `child` already carries `newName`. Shared by the
   * referenced-table aliasing (`_applyReferencedAlias`) and the shared-tracker
   * re-aliasing (`realiasAgainstSharedTracker`).
   * @internal
   */
  private _rebindChildAlias(child: JoinPart, newName: string): void {
    if (newName === child.effectiveSqlName) return;
    const tableName = child.tableName;
    const aliased =
      newName === tableName ? new Table(tableName) : new Table(tableName, { as: newName });

    const fromName = child.effectiveSqlName || tableName;
    const rebindOn = (part: JoinPart): void => {
      const arelJoin = part.arelJoin;
      if (!arelJoin) return;
      const on = arelJoin.right;
      if (!(on instanceof Nodes.On)) return;
      const rebound = rebindTableReferences(on.expr as Nodes.Node, fromName, aliased);
      // The referenced node's own JOIN left side must always move to the alias
      // (so the SELECT projection and the JOIN clause name the same table), even
      // when its ON had no rebindable Attribute (e.g. a SqlLiteral condition). A
      // grandchild is only rewritten when its ON actually referenced the parent's
      // old table name.
      if (part === child) {
        const JoinClass = arelJoin.constructor as new (l: Nodes.Node, r: Nodes.Node) => Nodes.Join;
        part.arelJoin = new JoinClass(aliased, new Nodes.On(rebound));
      } else if (rebound !== on.expr) {
        const JoinClass = arelJoin.constructor as new (l: Nodes.Node, r: Nodes.Node) => Nodes.Join;
        part.arelJoin = new JoinClass(arelJoin.left, new Nodes.On(rebound));
      }
    };
    rebindOn(child);
    for (const grandchild of child.children) rebindOn(grandchild);

    child.arelTable = aliased;
    child.effectiveSqlName = newName;
    this._aliasesCache = undefined;
  }

  /**
   * Re-resolve every association join in this dependency against a shared
   * `AliasTracker`, aliasing any table the tracker already claims to the
   * reflection's `alias_candidate(parent_table)` (`authors_categorizations`).
   *
   * Rails shares one `alias_tracker` across all join dependencies in
   * `build_joins`, so a `merge` that brings an association join onto a table the
   * outer relation already joins is aliased. trails builds each cross-klass
   * merged dependency with its own tracker at merge time (seeded only with its
   * own base), so the duplicate join is never detected as a collision. This
   * walks the dependency parent→child (so a parent's alias is settled before its
   * children rebind onto it) and applies `aliased_table_for` semantics via
   * `aliasNameForTable`, mirroring Rails' lazy per-node aliasing in
   * `make_constraints`.
   */
  realiasAgainstSharedTracker(tracker: AliasTracker): void {
    this._aliasTracker = tracker;
    const visit = (parent: JoinPart): void => {
      for (const child of parent.children) {
        if (child instanceof JoinAssociation) {
          const parentTableName = (parent.baseKlass as any)?.tableName ?? (parent as any).table;
          const alias = tracker.aliasNameForTable(child.tableName, () =>
            child.reflection.aliasCandidate(parentTableName),
          );
          this._rebindChildAlias(child, alias ?? child.tableName);
        }
        visit(child);
      }
    };
    visit(this._joinRoot);
    this._aliasesCache = undefined;
  }

  /** @internal */
  private makeConstraints(
    parent: JoinPart,
    child: JoinPart,
    joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin,
  ): Nodes.Join[] {
    this._applyReferencedAlias(parent, child);
    const joins: Nodes.Join[] = [];
    const arelJoin = child.arelJoin;
    if (arelJoin) {
      if (!(arelJoin instanceof joinType) && arelJoin instanceof Nodes.Join) {
        joins.push(new joinType(arelJoin.left, arelJoin.right));
      } else {
        joins.push(arelJoin);
      }
    }
    // Scope-contributed raw-string joins (Rails `joins.concat arel.join_sources`).
    for (const src of child.scopeJoinSources) joins.push(src as Nodes.Join);
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
    strictLoadingValue?: boolean,
    columnTypes?: Record<string, { deserialize(value: unknown): unknown }>,
  ): any[] {
    return this.instantiateFromRows(resultSet, strictLoadingValue, columnTypes).parents;
  }

  /**
   * Mirrors: ActiveRecord::Associations::JoinDependency#apply_column_aliases
   * (join_dependency.rb:153) — `@join_root_alias = relation.select_values.empty?`
   * then `relation._select!(-> { aliases.columns })`. When the relation carries
   * an explicit `select`, the base table's alias columns shrink to its primary
   * key (`!join_root_alias`); the relation's own select list then supplies the
   * rest of the projection. Returns the alias-column Arel nodes so callers that
   * build the projection manually (the eager-load SelectManager) can append them
   * after the relation's explicit select.
   */
  applyColumnAliases(relation: any): Nodes.As[] {
    this._joinRootAlias = (relation?.selectValues?.length ?? 0) === 0;
    this._aliasesCache = undefined;
    return this._buildSelectArelNodes();
  }

  each(callback: (part: JoinPart, index: number) => void): void {
    this.nodes.forEach(callback);
  }

  [Symbol.iterator](): Iterator<JoinPart> {
    return this.nodes[Symbol.iterator]();
  }

  static makeTree(associations: any): Record<PropertyKey, any> {
    const hash: Record<PropertyKey, any> = Object.create(null);
    JoinDependency.walkTree(associations, hash);
    return hash;
  }

  static walkTree(associations: any, hash: Record<PropertyKey, any>): void {
    if (typeof associations === "symbol") {
      if (!hash[associations]) hash[associations] = Object.create(null);
    } else if (typeof associations === "string") {
      // Dotted strings ("comments.author") are a trails affordance: split them
      // into nested levels so the builder joins each segment in turn.
      let cur = hash;
      for (const part of associations.split(".")) {
        cur = cur[part] ??= Object.create(null);
      }
    } else if (Array.isArray(associations)) {
      for (const assoc of associations) {
        JoinDependency.walkTree(assoc, hash);
      }
    } else if (associations && typeof associations === "object") {
      for (const key of Reflect.ownKeys(associations)) {
        const value = associations[key];
        if (!hash[key]) hash[key] = Object.create(null);
        if (value != null) JoinDependency.walkTree(value, hash[key]);
      }
    }
  }

  private _addStiConstraintArel(
    predicate: Nodes.Node,
    model: typeof Base,
    arelTable: Table,
  ): Nodes.Node {
    const inheritanceCol = getInheritanceColumn(model);
    if (inheritanceCol && isStiSubclass(model)) {
      const stiNames = [model.name, ...((model as any).descendants ?? []).map((d: any) => d.name)];
      const quotedNames = stiNames.map((n: string) => new Nodes.Quoted(n));
      const stiPred = arelTable.get(inheritanceCol).in(quotedNames);
      return predicate instanceof Nodes.And
        ? new Nodes.And([...predicate.children, stiPred])
        : new Nodes.And([predicate, stiPred]);
    }
    return predicate;
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
    strictLoadingValue?: boolean,
    columnTypes?: Record<string, { deserialize(value: unknown): unknown }>,
  ): {
    parents: any[];
    associations: Map<unknown, Map<string, any[]>>;
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
    return { parents: parentList, associations: this._collectAssociations(parents) };
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
    strictLoadingValue?: boolean,
  ): void {
    if (arParent == null) return;
    const aliases = this.aliases();
    for (const node of parent.children) {
      if (node.tableIndex < 0) continue;

      // trails through-chain intermediates carry no AR record — pass the
      // current parent straight through to the real target node.
      if (node.isThroughNode) {
        this.construct(arParent, node, row, seen, modelCache, strictLoadingValue);
        continue;
      }

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
        if (child.tableIndex < 0 || child.isThroughNode) continue;
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
   * @internal
   * Mirrors: ActiveRecord::Associations::JoinDependency#build
   */
  private build(associations: Record<PropertyKey, any>, baseKlass: typeof Base): JoinAssociation[] {
    if (!associations || typeof associations !== "object") return [];
    return Reflect.ownKeys(associations).map((key) => {
      const right = associations[key];
      const name = typeof key === "symbol" ? (key.description ?? String(key)) : String(key);
      const reflection = this.findReflection(baseKlass, name);
      reflection.checkValidityBang?.();
      reflection.checkEagerLoadableBang?.();

      if (reflection.isPolymorphic?.()) {
        throw new EagerLoadPolymorphicError(name);
      }

      return new JoinAssociation(reflection, this.build(right, reflection.klass));
    });
  }

  /**
   * Build the `Aliases` value object lazily from the tree (mirrors Rails
   * JoinDependency#aliases — `join_root.each_with_index` over column names).
   * The base table is keyed by the join root; each joined node supplies its own
   * column names and Arel table. Replaces the index-keyed `_aliases`/`_arelTablesByIndex`.
   *
   * Memoized like Rails' `@aliases ||=`; the cache is cleared on any tree
   * mutation (`_insertTreeNode` / `_rollback`) so it can never go stale.
   * @internal
   */
  private aliases(): Aliases {
    if (this._aliasesCache) return this._aliasesCache;
    const columnsFor = (
      node: JoinPart,
      columns: string[],
      tableIndex: number,
    ): { node: JoinPart; table: Table; columns: AliasMap[] } => ({
      node,
      table: node.arelTable!,
      columns: columns.map((column, columnIndex) => ({
        column,
        alias: `t${tableIndex}_r${columnIndex}`,
      })),
    });

    // Rails: when the relation carries an explicit select (`!join_root_alias`),
    // the base table contributes only its primary key (or nothing for a no-PK
    // model); otherwise it contributes every column.
    let rootColumns: string[];
    if (this._joinRootAlias) {
      rootColumns = getModelColumns(this._baseModel);
    } else {
      const pk = (this._baseModel as any).primaryKey;
      rootColumns = pk ? (Array.isArray(pk) ? pk : [pk]) : [];
    }
    const tables = [columnsFor(this._joinRoot, rootColumns, 0)];
    for (const node of this.nodes) {
      tables.push(columnsFor(node, node.columns, node.tableIndex));
    }
    return (this._aliasesCache = new Aliases(tables));
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
    strictLoadingValue?: boolean,
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
      model = (node.baseKlass as any)._instantiate(attrs);
      if (strictLoadingValue && typeof model.strictLoadingBang === "function") {
        model.strictLoadingBang();
      }
      if (id != null) nodeCache.set(id, model);
    }

    const isCollection = node.assocType === "hasMany";
    if (!record._preloadedAssociations) {
      record._preloadedAssociations = new Map();
    }
    if (isCollection) {
      if (!record._preloadedAssociations.has(node.immediateAssocName)) {
        record._preloadedAssociations.set(node.immediateAssocName, []);
      }
    } else {
      record._preloadedAssociations.set(node.immediateAssocName, model);
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
          proxy.loadedBang();
        }
        if (Array.isArray(proxy.target)) {
          proxy.target.push(child);
        }
      } else {
        proxy.setTarget(child);
      }
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
      proxy.loadedBang?.();
      if (!parent._preloadedAssociations) {
        parent._preloadedAssociations = new Map();
      }
      if (!parent._preloadedAssociations.has(node.immediateAssocName)) {
        parent._preloadedAssociations.set(node.immediateAssocName, []);
      }
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
      proxy.setTarget(isCollection ? [] : null);
    } catch (e) {
      if (!(e instanceof AssociationNotFoundError)) throw e;
    }
  }

  private _insertTreeNode(treePart: JoinPart): void {
    const parentPath = treePart.parentPath;
    const parent = this._findNodeByPath(parentPath);
    if (!parent) {
      throw new Error(
        `JoinDependency tree: parent path "${parentPath}" not found for "${treePart.immediateAssocName}"`,
      );
    }
    parent.children.push(treePart);
    this._aliasesCache = undefined;
  }

  private _addThroughViaJoinAssociation(
    assocDef: any,
    reflection: any,
    modelClass: any,
    sourceAlias: string,
    parentAssocName?: string,
  ): JoinPart | null {
    const chain = reflection.chain;
    if (!chain || chain.length < 2) return null;

    const joinAssoc = new JoinAssociation(reflection);
    const sourceArelTable = new Table(sourceAlias);

    // Pre-allocate table indices and resolve tables for each chain entry.
    // chain[0] is the target reflection (ThroughReflection),
    // chain[1..N] are intermediate through reflections.
    // joinConstraints reverses internally, so the resolver sees them
    // in forward order but joins are emitted reversed.
    const chainTables: Array<{
      table: Table;
      tableName: string;
      effectiveName: string;
      tableIndex: number;
      tableAlias: string;
      model: typeof Base;
    }> = [];

    // Nothing is inserted into the tree yet, so the indices for the whole chain
    // are allocated up front off the current next-index (base + already-joined).
    const startIndex = this._nextTableIndex();
    for (let i = 0; i < chain.length; i++) {
      const refl = chain[i];
      const model = refl.klass as typeof Base;
      const tableName = (model as any).tableName;
      const tableIndex = startIndex + i;
      const tableAlias = `t${tableIndex}`;
      const collides =
        (this._aliasTracker.aliases.get(tableName) ?? 0) > 0 ||
        chainTables.some((ct) => ct.tableName === tableName);
      // Rails-compatible self-join alias naming (join_dependency.rb:204-206):
      // a colliding table gets `{reflection.alias_candidate(parent.table_name)}`,
      // with `_join` appended for the non-root through links of the chain.
      // chain[0] is the target reflection (root); chain[1..] are through.
      // parent.table_name is the parent's real table name (JoinPart delegates
      // table_name to base_klass), not its alias.
      const parentTableName = modelClass.tableName;
      const effectiveName = collides
        ? this._aliasTracker.aliasNameFor(
            i === 0
              ? refl.aliasCandidate(parentTableName)
              : `${refl.aliasCandidate(parentTableName)}_join`,
          )
        : tableName;
      const arelTable =
        effectiveName === tableName
          ? new Table(tableName)
          : new Table(tableName, { as: effectiveName });

      chainTables.push({
        table: arelTable,
        tableName,
        effectiveName,
        tableIndex,
        tableAlias,
        model,
      });
    }

    const joins = joinAssoc.joinConstraints(
      sourceArelTable,
      modelClass,
      this._joinType,
      this._aliasTracker,
      (_refl, remaining) => {
        const idx = chain.length - remaining.length;
        const entry = chainTables[idx];
        if (!entry) return [new Table((_refl.klass as any).tableName), false];
        return [entry.table, false];
      },
    );

    if (joins.length === 0) return null;

    // Rebind ON predicates when tables were aliased (scope/STI predicates
    // from klass.all() reference the unaliased table name).
    for (let i = 0; i < joins.length; i++) {
      const chainIdx = chain.length - 1 - i;
      const entry = chainTables[chainIdx];
      if (entry.effectiveName !== entry.tableName) {
        const on = (joins[i] as Nodes.Join).right as Nodes.On;
        if (on instanceof Nodes.On) {
          const rebound = rebindTableReferences(
            on.expr as Nodes.Node,
            entry.tableName,
            entry.table,
          );
          if (rebound !== on.expr) {
            joins[i] = new this._joinType(entry.table, new Nodes.On(rebound));
          }
        }
      }
    }

    // joins are in reversed-chain order: first N-1 are intermediate (through),
    // last is the target. chainTables is in forward order.
    // After joinConstraints reversal: joins[0] corresponds to chain[last],
    // joins[last] corresponds to chain[0] (the target/ThroughReflection).
    // Register all tables and create JoinParts.
    let targetNode: JoinPart | null = null;

    // Map each join to its chain entry. joinConstraints reverses the chain,
    // so joins[i] corresponds to chainTables[chain.length - 1 - i].
    for (let i = 0; i < joins.length; i++) {
      const chainIdx = chain.length - 1 - i;
      const entry = chainTables[chainIdx];
      const isTarget = chainIdx === 0;
      const arelJoin = joins[i] as Nodes.Join;

      this._aliasTracker.aliases.set(
        entry.tableName,
        (this._aliasTracker.aliases.get(entry.tableName) ?? 0) + 1,
      );

      const columns = getModelColumns(entry.model);

      if (isTarget) {
        const fullAssocName = parentAssocName
          ? `${parentAssocName}.${assocDef.name}`
          : assocDef.name;
        const treePart = new JoinAssociation(reflection);
        treePart.tableIndex = entry.tableIndex;
        treePart.arelTable = entry.table;
        treePart.tableAlias = entry.tableAlias;
        treePart.tableName = entry.tableName;
        treePart.effectiveSqlName = entry.effectiveName;
        treePart.columns = columns;
        treePart.assocName = fullAssocName;
        treePart.immediateAssocName = assocDef.name;
        treePart.parentPath = parentAssocName ?? null;
        treePart.assocType = assocDef.type === "hasAndBelongsToMany" ? "hasMany" : assocDef.type;
        treePart.arelJoin = arelJoin;
        treePart.nodeReflection = reflection;
        treePart.isThroughNode = false;
        this._insertTreeNode(treePart);
        targetNode = treePart;
      } else {
        const reflName = chain[chainIdx].name ?? entry.tableName;
        const throughName = `_through_${reflName}`;
        const throughNodeName = parentAssocName ? `${parentAssocName}.${throughName}` : throughName;
        const refl = chain[chainIdx];
        const treePart = new JoinLeaf(entry.model);
        treePart.tableIndex = entry.tableIndex;
        treePart.arelTable = entry.table;
        treePart.tableAlias = entry.tableAlias;
        treePart.tableName = entry.tableName;
        treePart.effectiveSqlName = entry.effectiveName;
        treePart.columns = columns;
        treePart.assocName = throughNodeName;
        treePart.immediateAssocName = throughName;
        treePart.parentPath = parentAssocName ?? null;
        treePart.assocType = (refl._reflection ?? refl).macro === "hasOne" ? "hasOne" : "hasMany";
        treePart.arelJoin = arelJoin;
        treePart.isThroughNode = true;
        this._insertTreeNode(treePart);
      }
    }

    return targetNode;
  }
}

function rebindTableReferences(
  node: Nodes.Node,
  fromTableName: string,
  toTable: Table,
): Nodes.Node {
  if (node instanceof Nodes.Attribute) {
    const rel = node.relation;
    // Match by the table's *effective* SQL name: an unaliased table uses its
    // real name; a join whose table was already aliased (a second join onto the
    // same table) is identified by its alias. Both must rebind when the
    // referenced-alias pass renames the table. No false-positive risk: AliasTracker
    // mints aliases from a namespace seeded with every real table name in the
    // query (bumping on collision), so an alias can never equal a sibling join's
    // real table name — and this rebind only walks one join's ON (its own table
    // plus its grandchildren), not the whole FROM list.
    if (rel instanceof Table && (rel.tableAlias ?? rel.name) === fromTableName) {
      return toTable.get(node.name);
    }
    return node;
  }
  if (node instanceof Nodes.And) {
    return new Nodes.And(
      node.children.map((c: Nodes.Node) => rebindTableReferences(c, fromTableName, toTable)),
    );
  }
  // Nary nodes (Or) — have children array
  if ("children" in node && Array.isArray((node as any).children)) {
    if (node instanceof Nodes.And) return node;
    const rebound = (node as any).children.map((c: Nodes.Node) =>
      rebindTableReferences(c, fromTableName, toTable),
    );
    const clone = Object.assign(Object.create(Object.getPrototypeOf(node)), node);
    clone.children = rebound;
    return clone;
  }
  // Unary nodes (Grouping, Not, etc.) — have expr
  if ("expr" in node && (node as any).expr instanceof Nodes.Node) {
    const rebound = rebindTableReferences((node as any).expr, fromTableName, toTable);
    if (rebound === (node as any).expr) return node;
    const clone = Object.assign(Object.create(Object.getPrototypeOf(node)), node);
    clone.expr = rebound;
    return clone;
  }
  // Binary nodes (Equality, In, InfixOperation, Matches, etc.) — have left/right.
  // Shallow-clone to preserve extra fields (operator, escape, caseSensitive).
  if ("left" in node && "right" in node) {
    const bin = node as any;
    const left =
      bin.left instanceof Nodes.Node
        ? rebindTableReferences(bin.left, fromTableName, toTable)
        : bin.left;
    const right =
      bin.right instanceof Nodes.Node
        ? rebindTableReferences(bin.right, fromTableName, toTable)
        : bin.right;
    if (left === bin.left && right === bin.right) return node;
    const clone = Object.assign(Object.create(Object.getPrototypeOf(node)), node);
    clone.left = left;
    clone.right = right;
    return clone;
  }
  return node;
}

class JoinLeaf extends JoinPart {
  private _tableOverride: string | null = null;

  constructor(baseKlass: typeof Base) {
    super(baseKlass);
  }

  get table(): string {
    return this._tableOverride ?? this.effectiveSqlName;
  }

  set table(value: string) {
    this._tableOverride = value;
  }

  override isMatch(other: JoinPart): boolean {
    if (this === other) return true;
    if (!(other instanceof JoinLeaf)) return false;
    return (
      this.immediateAssocName === other.immediateAssocName && this.baseKlass === other.baseKlass
    );
  }
}
