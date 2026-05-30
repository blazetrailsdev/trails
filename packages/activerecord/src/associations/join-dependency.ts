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
import { reflectOnAssociation } from "../reflection.js";
import { getInheritanceColumn, isStiSubclass } from "../inheritance.js";
import { JoinBase } from "./join-dependency/join-base.js";
import { JoinAssociation } from "./join-dependency/join-association.js";
import { JoinPart } from "./join-dependency/join-part.js";
import { AssociationNotFoundError, EagerLoadPolymorphicError } from "./errors.js";
import { ConfigurationError } from "../errors.js";
import { AliasTracker } from "./alias-tracker.js";

export interface AliasMap {
  alias: string;
  tableIndex: number;
  columnIndex: number;
  column: string;
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
  const pk = modelClass.primaryKey ?? "id";
  if (Array.isArray(pk)) {
    for (const k of pk) {
      if (!cols.includes(k)) cols.unshift(k);
    }
  } else {
    if (!cols.includes(pk)) cols.unshift(pk);
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
  private _columnsCache: Map<JoinPart | null, AliasMap[]>;
  private _allColumns: AliasMap[];

  constructor(tables: Array<{ node: JoinPart | null; columns: AliasMap[] }>) {
    this._aliasCache = new Map();
    this._columnsCache = new Map();
    this._allColumns = [];
    for (const table of tables) {
      const colMap = new Map<string, string>();
      for (const col of table.columns) {
        colMap.set(col.column, col.alias);
        this._allColumns.push(col);
      }
      this._aliasCache.set(table.node, colMap);
      this._columnsCache.set(table.node, table.columns);
    }
  }

  columns(): AliasMap[] {
    return this._allColumns;
  }

  columnAliases(node: JoinPart | null): AliasMap[] {
    return this._columnsCache.get(node) ?? [];
  }

  columnAlias(node: JoinPart | null, column: string): string | undefined {
    return this._aliasCache.get(node)?.get(column);
  }
}

export class JoinDependency {
  private _baseModel: typeof Base;
  private _baseAlias: string;
  private _baseTableIndex = 0;
  private _nextTableIndex = 1;
  private _aliases: AliasMap[] = [];
  private _aliasTracker: AliasTracker;
  private _arelTablesByIndex: Map<number, Table> = new Map();
  private readonly _joinRoot: JoinBase;
  private readonly _joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin;
  private _treeNodesByPath: Map<string, JoinPart> = new Map();
  private _references: Record<string, string> = Object.create(null) as Record<string, string>;
  constructor(baseModel: typeof Base, joinType?: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin) {
    this._baseModel = baseModel;
    this._baseAlias = (baseModel as any).tableName;
    this._aliasTracker = new AliasTracker(undefined, new Map([[this._baseAlias, 1]]));
    const baseTable = (baseModel as any).arelTable;
    this._arelTablesByIndex.set(this._baseTableIndex, baseTable);
    this._joinRoot = new JoinBase(baseModel, baseTable);
    this._joinType = joinType ?? Nodes.OuterJoin;
    this._buildBaseAliases();
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
    options?: { fromModel?: any; fromAlias?: string; parentAssocName?: string },
  ): JoinPart | null {
    const modelClass = (options?.fromModel ?? this._baseModel) as any;
    const associations: any[] = modelClass._associations ?? [];
    const assocDef = associations.find((a: any) => a.name === assocName);
    if (!assocDef) return null;

    const reflection = reflectOnAssociation(modelClass, assocName);
    if (reflection) {
      // Mirrors: ActiveRecord::Associations::JoinDependency#build (join_dependency.rb:232)
      (reflection as any).checkEagerLoadableBang?.();
    }

    const sourceAlias = options?.fromAlias ?? this._baseAlias;
    const sourcePk = modelClass.primaryKey ?? "id";
    if (Array.isArray(sourcePk)) return null;

    const tableIndex = this._nextTableIndex++;
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
      targetModel = modelRegistry.get(className) as typeof Base | undefined;
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
        this._nextTableIndex--;
        if (reflection && reflection.isThroughReflection()) {
          const snapshotIndex = this._nextTableIndex;
          const result = this._addThroughViaJoinAssociation(
            assocDef,
            reflection,
            modelClass,
            sourceAlias,
            options?.parentAssocName,
          );
          if (result) return result;
          this._nextTableIndex = snapshotIndex;
        }
        return null;
      }
      const className =
        assocDef.options.className ??
        _camelize(assocDef.type === "hasMany" ? _singularize(assocName) : assocName);
      targetModel = modelRegistry.get(className) as typeof Base | undefined;
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

    const effectiveName =
      (this._aliasTracker.aliases.get(targetTable!) ?? 0) > 0 ? tableAlias : targetTable!;

    const targetArelTable =
      effectiveName === targetTable!
        ? new Table(targetTable!)
        : new Table(targetTable!, { as: effectiveName });
    this._arelTablesByIndex.set(tableIndex, targetArelTable);
    const sourceArelTable = new Table(sourceAlias);

    const targetModelPk = (targetModel as any).primaryKey ?? "id";
    if (Array.isArray(targetModelPk)) return null;

    // Commit-point: all failure guards passed; register the table name.
    this._aliasTracker.aliases.set(
      targetTable!,
      (this._aliasTracker.aliases.get(targetTable!) ?? 0) + 1,
    );

    const columns = getModelColumns(targetModel);

    // Build JOIN via JoinAssociation when reflection is available (mirrors Rails),
    // falling back to inline predicate construction otherwise.
    let arelJoin: Nodes.Join;
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
      // When the target table was aliased (collision), scope/STI predicates from
      // klass.all() reference the unaliased table. Rebind to the aliased table.
      if (effectiveName !== targetTable!) {
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
      predicate = this._addStiConstraintArel(predicate, targetModel!, targetArelTable);
      arelJoin = new this._joinType(targetArelTable, new Nodes.On(predicate));
    }

    for (let i = 0; i < columns.length; i++) {
      this._aliases.push({
        alias: `t${tableIndex}_r${i}`,
        tableIndex,
        columnIndex: i,
        column: columns[i],
      });
    }

    const treePart = reflection ? new JoinAssociation(reflection) : new JoinLeaf(targetModel!);
    treePart.tableIndex = tableIndex;
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
   * Add a nested association path like "comments.author".
   * Walks the chain, adding JOINs for each segment.
   */
  addNestedAssociation(path: string): JoinPart | null {
    const parts = path.split(".");
    if (parts.length === 1) return this.addAssociation(parts[0]);

    const snapshot = this._snapshotTree();

    let currentModel = this._baseModel as any;
    let currentAlias = this._baseAlias;
    let lastNode: JoinPart | null = null;
    let parentPath = "";

    try {
      for (const part of parts) {
        const node = this._addOrReuse(part, currentModel, currentAlias, parentPath);
        if (!node) {
          this._restoreTree(snapshot);
          return null;
        }
        lastNode = node;
        currentModel = node.baseKlass;
        // Use effectiveSqlName, not tableAlias: the JOIN SQL references the
        // effective name (real table name or tN alias), so the next level's ON
        // clause must use the same name as the source of the join.
        currentAlias = node.effectiveSqlName;
        parentPath = parentPath ? `${parentPath}.${part}` : part;
      }
    } catch (e) {
      // addAssociation mutates _nextTableIndex/aliasTracker before the
      // polymorphic check throws; restore so a mid-walk throw leaves the
      // instance unchanged before propagating (e.g. EagerLoadPolymorphicError).
      this._restoreTree(snapshot);
      throw e;
    }
    return lastNode;
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
    const snapshot = this._snapshotTree();
    try {
      if (!this._walkSpec(spec, this._baseModel, this._baseAlias, "")) {
        this._restoreTree(snapshot);
        return false;
      }
    } catch (e) {
      // addAssociation mutates _nextTableIndex/aliasTracker before the
      // polymorphic check throws. Restore so the instance is left unchanged
      // (all-or-nothing) before propagating EagerLoadPolymorphicError.
      this._restoreTree(snapshot);
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
    this.build(eagerSpecToTree(spec), this._baseModel);
  }

  /** @internal */
  private _walkSpec(
    spec: AssociationSpec | AssociationSpec[],
    model: typeof Base,
    alias: string,
    parentPath: string,
  ): boolean {
    if (Array.isArray(spec)) {
      return spec.every((s) => this._walkSpec(s, model, alias, parentPath));
    }
    if (typeof spec === "string") {
      // Dotted strings ("comments.author") are walked segment-by-segment so
      // each level threads the correct source model/alias.
      let m = model;
      let a = alias;
      let pp = parentPath;
      for (const part of spec.split(".")) {
        const node = this._addOrReuse(part, m, a, pp);
        if (!node) return false;
        m = node.baseKlass;
        a = node.effectiveSqlName;
        pp = pp ? `${pp}.${part}` : part;
      }
      return true;
    }
    for (const key of Object.keys(spec)) {
      const node = this._addOrReuse(key, model, alias, parentPath);
      if (!node) return false;
      const child = spec[key];
      const childPath = parentPath ? `${parentPath}.${key}` : key;
      if (
        child != null &&
        !this._walkSpec(child, node.baseKlass, node.effectiveSqlName, childPath)
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
    const fullPath = parentPath ? `${parentPath}.${assocName}` : assocName;
    const existing = this._treeNodesByPath.get(fullPath);
    if (existing) return existing;
    return this.addAssociation(assocName, {
      fromModel,
      fromAlias,
      parentAssocName: parentPath || undefined,
    });
  }

  /** @internal */
  private _snapshotTree(): {
    paths: Set<string>;
    aliases: number;
    nextIndex: number;
    tracker: Map<string, number>;
  } {
    return {
      paths: new Set(this._treeNodesByPath.keys()),
      aliases: this._aliases.length,
      nextIndex: this._nextTableIndex,
      tracker: new Map(this._aliasTracker.aliases),
    };
  }

  /** @internal */
  private _restoreTree(snapshot: {
    paths: Set<string>;
    aliases: number;
    nextIndex: number;
    tracker: Map<string, number>;
  }): void {
    this._rollbackTree(snapshot.paths);
    this._aliases.length = snapshot.aliases;
    this._nextTableIndex = snapshot.nextIndex;
    this._aliasTracker.aliases.clear();
    for (const [k, v] of snapshot.tracker) this._aliasTracker.aliases.set(k, v);
  }

  private _buildSelectArelNodes(): Nodes.As[] {
    return this._aliases.map((a) => {
      const table = this._arelTablesByIndex.get(a.tableIndex)!;
      return table.get(a.column).as(a.alias);
    });
  }

  buildSelectArel(): Nodes.As[] {
    return this._buildSelectArelNodes();
  }

  get baseKlass(): typeof Base {
    return this._baseModel;
  }

  get reflections(): any[] {
    const result: any[] = [];
    this._joinRoot.eachChildren((parent, child) => {
      if (child.tableIndex < 0) return;
      const reflection = reflectOnAssociation(parent.baseKlass as any, child.immediateAssocName);
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

  joinConstraints(
    joinsToAdd: JoinDependency[],
    aliasTracker?: AliasTracker,
    references?: string[],
  ): Nodes.Join[] {
    if (aliasTracker) this._aliasTracker = aliasTracker;
    this._references = Object.create(null) as Record<string, string>;
    if (references) {
      for (const tableName of references) {
        this._references[tableName] = tableName;
      }
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

  /** @internal */
  private walk(
    left: JoinPart,
    right: JoinPart,
    joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin,
  ): Nodes.Join[] {
    const intersection: [JoinPart, JoinPart][] = [];
    const missing: JoinPart[] = [];

    for (const rc of right.children) {
      const lc = left.children.find((l) => rc.isMatch(l));
      if (lc) {
        intersection.push([lc, rc]);
      } else {
        missing.push(rc);
      }
    }

    const joins = intersection.flatMap(([l, r]) => {
      if (r instanceof JoinAssociation || r instanceof JoinLeaf) {
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
        if (originalTable !== resolvedTable) {
          this._rebindChildOnPredicates(r, originalTable, resolvedTable);
        }
      }
      return this.walk(l, r, joinType);
    });

    return joins.concat(missing.flatMap((n) => this.makeConstraints(left, n, joinType)));
  }

  /** @internal */
  private makeConstraints(
    _parent: JoinPart,
    child: JoinPart,
    joinType: typeof Nodes.InnerJoin | typeof Nodes.OuterJoin,
  ): Nodes.Join[] {
    const joins: Nodes.Join[] = [];
    const arelJoin = child.arelJoin;
    if (arelJoin) {
      if (!(arelJoin instanceof joinType) && arelJoin instanceof Nodes.Join) {
        joins.push(new joinType(arelJoin.left, arelJoin.right));
      } else {
        joins.push(arelJoin);
      }
    }
    return joins.concat(child.children.flatMap((c) => this.makeConstraints(child, c, joinType)));
  }

  /** @internal */
  private _rebindChildOnPredicates(
    parent: JoinPart,
    fromTableName: string,
    toTableName: string,
  ): void {
    const toTable = new Table(toTableName);
    for (const child of parent.children) {
      if (!child.arelJoin) continue;
      const arelJoin = child.arelJoin;
      const on = arelJoin.right;
      if (!(on instanceof Nodes.On)) continue;
      const rebound = rebindTableReferences(on.expr as Nodes.Node, fromTableName, toTable);
      if (rebound !== on.expr) {
        const JoinClass = arelJoin.constructor as new (
          left: Nodes.Node,
          right: Nodes.Node,
        ) => Nodes.Join;
        child.arelJoin = new JoinClass(arelJoin.left, new Nodes.On(rebound));
      }
    }
  }

  instantiate(resultSet: Record<string, unknown>[], strictLoadingValue?: boolean): any[] {
    return this.construct(resultSet, strictLoadingValue);
  }

  applyColumnAliases(relation: any): any {
    const arelNodes = this._buildSelectArelNodes();
    if (typeof relation.reselectBang === "function") {
      relation.reselectBang(...arelNodes);
      return relation;
    } else if (typeof relation.select === "function") {
      return relation.select(...arelNodes);
    }
    return relation;
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
    if (typeof associations === "string" || typeof associations === "symbol") {
      if (!hash[associations]) hash[associations] = Object.create(null);
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

  instantiateFromRows(
    rows: Record<string, unknown>[],
    strictLoadingValue?: boolean,
  ): {
    parents: any[];
    associations: Map<unknown, Map<string, any[]>>;
  } {
    const basePk = (this._baseModel as any).primaryKey ?? "id";
    const parentMap = new Map<unknown, any>();
    const assocMap = new Map<unknown, Map<string, any[]>>();
    const seenRawPks = new Set<unknown>();
    const rawToKey = new Map<unknown, unknown>();

    const modelCache = new Map<JoinPart, Map<unknown, any>>();
    const seenChildren = new WeakMap<object, Map<string, Set<unknown>>>();

    const baseColumns = getModelColumns(this._baseModel);
    const columnNames = new Set(this._aliases.map((a) => a.alias));

    const nodeReadonly = new Map<JoinPart, boolean>();
    const nodeStrictLoading = new Map<JoinPart, boolean>();
    for (const node of this.nodes) {
      nodeReadonly.set(node, this._isNodeReadonly(node));
      nodeStrictLoading.set(node, this._isNodeStrictLoading(node));
    }

    for (const row of rows) {
      const parentAttrs: Record<string, unknown> = Object.create(null);
      for (let i = 0; i < baseColumns.length; i++) {
        parentAttrs[baseColumns[i]] = row[`t${this._baseTableIndex}_r${i}`];
      }
      for (const key of Object.keys(row)) {
        if (!columnNames.has(key)) {
          parentAttrs[key] = row[key];
        }
      }

      const rawPk = parentAttrs[basePk];
      let parentKey: unknown;
      let parent: any;
      if (!seenRawPks.has(rawPk)) {
        seenRawPks.add(rawPk);
        parent = this.constructModel(parentAttrs, null, strictLoadingValue);
        parentKey = parent._readAttribute(basePk);
        rawToKey.set(rawPk, parentKey);
        parentMap.set(parentKey, parent);
        assocMap.set(parentKey, new Map());
      } else {
        parentKey = rawToKey.get(rawPk)!;
        parent = parentMap.get(parentKey);
      }

      this._constructRecursive(
        this._joinRoot,
        parent,
        parentKey,
        row,
        modelCache,
        seenChildren,
        assocMap,
        nodeReadonly,
        nodeStrictLoading,
        strictLoadingValue,
      );
    }

    return { parents: [...parentMap.values()], associations: assocMap };
  }

  /**
   * Recursive tree-walk hydration — mirrors Rails' JoinDependency#construct.
   * @internal
   */
  private _constructRecursive(
    treeNode: JoinPart,
    arParent: any,
    rootParentKey: unknown,
    row: Record<string, unknown>,
    modelCache: Map<JoinPart, Map<unknown, any>>,
    seenChildren: WeakMap<object, Map<string, Set<unknown>>>,
    assocMap: Map<unknown, Map<string, any[]>>,
    nodeReadonly: Map<JoinPart, boolean>,
    nodeStrictLoading: Map<JoinPart, boolean>,
    strictLoadingValue?: boolean,
  ): void {
    if (arParent == null) return;
    for (const child of treeNode.children) {
      if (child.tableIndex < 0) continue;

      if (child.isThroughNode) {
        this._constructRecursive(
          child,
          arParent,
          rootParentKey,
          row,
          modelCache,
          seenChildren,
          assocMap,
          nodeReadonly,
          nodeStrictLoading,
          strictLoadingValue,
        );
        continue;
      }

      if (
        child.assocType !== "hasMany" &&
        arParent._associationInstances &&
        isAssociationCached(arParent, child.immediateAssocName)
      ) {
        const model = arParent.association?.(child.immediateAssocName)?.target;
        this._constructRecursive(
          child,
          model,
          rootParentKey,
          row,
          modelCache,
          seenChildren,
          assocMap,
          nodeReadonly,
          nodeStrictLoading,
          strictLoadingValue,
        );
        continue;
      }

      const childAttrs: Record<string, unknown> = {};
      let hasNonNull = false;
      for (let i = 0; i < child.columns.length; i++) {
        const val = row[`t${child.tableIndex}_r${i}`];
        childAttrs[child.columns[i]] = val;
        if (val !== null && val !== undefined) hasNonNull = true;
      }

      if (!hasNonNull) {
        this._markAssociationLoaded(arParent, child);
        continue;
      }

      const rawChildPk = childAttrs[(child.baseKlass as any).primaryKey ?? "id"];

      let parentSeen = seenChildren.get(arParent);
      if (!parentSeen) {
        parentSeen = new Map();
        seenChildren.set(arParent, parentSeen);
      }
      let seenPks = parentSeen.get(child.immediateAssocName);
      if (!seenPks) {
        seenPks = new Set();
        parentSeen.set(child.immediateAssocName, seenPks);
      }
      const alreadySeen = seenPks.has(rawChildPk);

      let nodeCache = modelCache.get(child);
      if (!nodeCache) {
        nodeCache = new Map();
        modelCache.set(child, nodeCache);
      }
      let childInstance = nodeCache.get(rawChildPk);
      if (!childInstance) {
        childInstance = this.constructModel(childAttrs, child, strictLoadingValue);
        if (rawChildPk != null) nodeCache.set(rawChildPk, childInstance);
      }

      if (!alreadySeen) {
        seenPks.add(rawChildPk);

        const isCollection = child.assocType === "hasMany";

        if (!(arParent as any)._preloadedAssociations) {
          (arParent as any)._preloadedAssociations = new Map();
        }
        if (
          isCollection &&
          !(arParent as any)._preloadedAssociations.has(child.immediateAssocName)
        ) {
          (arParent as any)._preloadedAssociations.set(child.immediateAssocName, []);
        }

        this._wireAssociationProxy(arParent, child, childInstance);

        if (nodeReadonly.get(child)) {
          (childInstance as any)._readonly = true;
        }
        if (
          nodeStrictLoading.get(child) &&
          typeof (childInstance as any).strictLoadingBang === "function"
        ) {
          (childInstance as any).strictLoadingBang();
        }

        if (!isCollection) {
          (arParent as any)._preloadedAssociations.set(child.immediateAssocName, childInstance);
        }

        if (treeNode === this._joinRoot) {
          const rootAssocs = assocMap.get(rootParentKey)!;
          if (!rootAssocs.has(child.immediateAssocName))
            rootAssocs.set(child.immediateAssocName, []);
          rootAssocs.get(child.immediateAssocName)!.push(childInstance);
        }
      }

      this._constructRecursive(
        child,
        childInstance,
        rootParentKey,
        row,
        modelCache,
        seenChildren,
        assocMap,
        nodeReadonly,
        nodeStrictLoading,
        strictLoadingValue,
      );
    }
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
    const reflection = reflectOnAssociation(klass as any, name);
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
      (reflection as any).checkValidityBang?.();
      (reflection as any).checkEagerLoadableBang?.();

      if (reflection.isPolymorphic?.()) {
        throw new EagerLoadPolymorphicError(name);
      }

      return new JoinAssociation(reflection, this.build(right, reflection.klass));
    });
  }

  /** @internal */
  private aliases(): Aliases {
    const baseAliasMap: AliasMap[] = this._aliases.filter(
      (a) => a.tableIndex === this._baseTableIndex,
    );
    const tables: Array<{ node: JoinPart | null; columns: AliasMap[] }> = [
      { node: null, columns: baseAliasMap },
    ];
    for (const node of this.nodes) {
      const nodeCols = this._aliases.filter((a) => a.tableIndex === node.tableIndex);
      tables.push({ node, columns: nodeCols });
    }
    return new Aliases(tables);
  }

  /**
   * Constructs AR model instances from a flat result row set, assigning
   * associations. Entry point for the eager-load instantiation phase.
   *
   * Mirrors: ActiveRecord::Associations::JoinDependency#construct
   */
  private construct(resultSet: Record<string, unknown>[], strictLoadingValue?: boolean): any[] {
    return this.instantiateFromRows(resultSet, strictLoadingValue).parents;
  }

  /**
   * Instantiates a single model record from a hash of aliased row attributes.
   * Deduplication of repeated parent rows is handled by instantiateFromRows
   * (the `seenRawPks` / `parentMap` logic); this method just constructs the
   * model object for a given attribute hash.
   *
   * Mirrors: ActiveRecord::Associations::JoinDependency#construct_model
   */
  private constructModel(
    attrs: Record<string, unknown>,
    node: JoinPart | null,
    strictLoadingValue?: boolean,
  ): any {
    const modelClass = node ? node.baseKlass : this._baseModel;
    const model = (modelClass as any)._instantiate(attrs);
    if (strictLoadingValue && typeof model.strictLoadingBang === "function") {
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

  /**
   * @internal
   * Mirrors Rails' `JoinAssociation#readonly?` — checks if the reflection's
   * scope marks the association as readonly.
   */
  private _isNodeReadonly(node: JoinPart): boolean {
    const refl = node.nodeReflection;
    if (!refl || typeof refl.scopeFor !== "function") return false;
    try {
      const baseRel = (node.baseKlass as any)._allForPreload?.();
      if (!baseRel) return false;
      const scopeRel = refl.scopeFor(baseRel);
      return !!scopeRel?._isReadonly;
    } catch {
      return false;
    }
  }

  /** @internal */
  private _isNodeStrictLoading(node: JoinPart): boolean {
    const refl = node.nodeReflection;
    if (!refl) return false;
    return !!refl.strictLoading;
  }

  private _buildBaseAliases(): void {
    const columns = getModelColumns(this._baseModel);
    for (let i = 0; i < columns.length; i++) {
      this._aliases.push({
        alias: `t${this._baseTableIndex}_r${i}`,
        tableIndex: this._baseTableIndex,
        columnIndex: i,
        column: columns[i],
      });
    }
  }

  private _insertTreeNode(treePart: JoinPart): void {
    const parentPath = treePart.parentPath;
    let parent: JoinPart;
    if (parentPath) {
      const found = this._treeNodesByPath.get(parentPath);
      if (!found) {
        throw new Error(
          `JoinDependency tree: parent path "${parentPath}" not found for "${treePart.immediateAssocName}"`,
        );
      }
      parent = found;
    } else {
      parent = this._joinRoot;
    }
    parent.children.push(treePart);
    const fullPath = parentPath
      ? `${parentPath}.${treePart.immediateAssocName}`
      : treePart.immediateAssocName;
    this._treeNodesByPath.set(fullPath, treePart);
  }

  private _rollbackTree(snapshotPaths: Set<string>): void {
    const toRemove: string[] = [];
    for (const key of this._treeNodesByPath.keys()) {
      if (!snapshotPaths.has(key)) toRemove.push(key);
    }
    for (const key of toRemove.reverse()) {
      const part = this._treeNodesByPath.get(key)!;
      this._treeNodesByPath.delete(key);
      const lastDot = key.lastIndexOf(".");
      const parentKey = lastDot === -1 ? null : key.slice(0, lastDot);
      const parent = parentKey
        ? (this._treeNodesByPath.get(parentKey) ?? this._joinRoot)
        : this._joinRoot;
      const idx = parent.children.indexOf(part);
      if (idx !== -1) parent.children.splice(idx, 1);
    }
  }

  private _resolveTreeParent(parentPath: string): JoinPart {
    const found = this._treeNodesByPath.get(parentPath);
    if (!found) {
      throw new Error(`JoinDependency tree: parent path "${parentPath}" not found`);
    }
    return found;
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

    for (let i = 0; i < chain.length; i++) {
      const refl = chain[i];
      const model = refl.klass as typeof Base;
      const tableName = (model as any).tableName;
      const tableIndex = this._nextTableIndex++;
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
      const parentTableName = (modelClass as any).tableName;
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

      this._arelTablesByIndex.set(entry.tableIndex, entry.table);
      this._aliasTracker.aliases.set(
        entry.tableName,
        (this._aliasTracker.aliases.get(entry.tableName) ?? 0) + 1,
      );

      const columns = getModelColumns(entry.model);
      for (let c = 0; c < columns.length; c++) {
        this._aliases.push({
          alias: `t${entry.tableIndex}_r${c}`,
          tableIndex: entry.tableIndex,
          columnIndex: c,
          column: columns[c],
        });
      }

      if (isTarget) {
        const fullAssocName = parentAssocName
          ? `${parentAssocName}.${assocDef.name}`
          : assocDef.name;
        const treePart = new JoinAssociation(reflection);
        treePart.tableIndex = entry.tableIndex;
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
        treePart.tableAlias = entry.tableAlias;
        treePart.tableName = entry.tableName;
        treePart.effectiveSqlName = entry.effectiveName;
        treePart.columns = columns;
        treePart.assocName = throughNodeName;
        treePart.immediateAssocName = throughName;
        treePart.parentPath = parentAssocName ?? null;
        treePart.assocType =
          ((refl as any)._reflection ?? refl).macro === "hasOne" ? "hasOne" : "hasMany";
        treePart.arelJoin = arelJoin;
        treePart.isThroughNode = true;
        this._insertTreeNode(treePart);
      }
    }

    return targetNode;
  }
}

/**
 * Convert an eager-load spec (string, dotted string, array, or nested hash)
 * into the nested-hash tree `JoinDependency#build` consumes. Unlike
 * `JoinDependency.makeTree`, dotted strings ("comments.author") are split into
 * nested levels, matching how `_walkSpec` walks them segment-by-segment.
 */
function eagerSpecToTree(
  spec: AssociationSpec | AssociationSpec[],
  hash: Record<PropertyKey, any> = Object.create(null),
): Record<PropertyKey, any> {
  if (typeof spec === "string") {
    let cur = hash;
    for (const part of spec.split(".")) {
      cur = cur[part] ??= Object.create(null);
    }
  } else if (Array.isArray(spec)) {
    for (const s of spec) eagerSpecToTree(s, hash);
  } else if (spec && typeof spec === "object") {
    for (const key of Reflect.ownKeys(spec)) {
      const child = (spec as any)[key];
      const sub = (hash[key] ??= Object.create(null));
      if (child != null) eagerSpecToTree(child, sub);
    }
  }
  return hash;
}

function rebindTableReferences(
  node: Nodes.Node,
  fromTableName: string,
  toTable: Table,
): Nodes.Node {
  if (node instanceof Nodes.Attribute) {
    const rel = node.relation;
    if (rel instanceof Table && rel.name === fromTableName && !rel.tableAlias) {
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
