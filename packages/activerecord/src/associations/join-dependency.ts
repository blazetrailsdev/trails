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
import {
  underscore as _toUnderscore,
  camelize as _camelize,
  singularize as _singularize,
} from "@blazetrails/activesupport";
import { Table, Nodes } from "@blazetrails/arel";
import { modelRegistry } from "../associations.js";
import { reflectOnAssociation } from "../reflection.js";
import { getInheritanceColumn, isStiSubclass } from "../inheritance.js";
import { JoinBase } from "./join-dependency/join-base.js";
import { JoinAssociation } from "./join-dependency/join-association.js";
import { JoinPart } from "./join-dependency/join-part.js";
import { AssociationNotFoundError } from "./errors.js";
import { AliasTracker } from "./alias-tracker.js";

export interface JoinNode {
  tableIndex: number;
  tableAlias: string;
  tableName: string;
  modelClass: typeof Base;
  columns: string[];
  assocName: string;
  assocType: "hasMany" | "hasOne" | "belongsTo";
  arelJoin: Nodes.Join | null;
  /** Reflection for this association — used by hydration for readonly/strictLoading propagation. */
  reflection: any | null;
  /** True for intermediate through-table nodes (JOIN chain only, not hydrated). */
  isThroughNode: boolean;
  /** The immediate association name (without parent prefix) */
  immediateAssocName: string;
  /** Dotted parent path, or null if directly on the base model */
  parentPath: string | null;
  /**
   * The SQL name used for this node's table in JOIN and SELECT expressions.
   * Equals tableName when the real name was free (no collision); equals
   * tableAlias (tN) when there was a naming collision.
   */
  effectiveSqlName: string;
}

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
  private _aliasCache: Map<JoinNode | null, Map<string, string>>;
  private _columnsCache: Map<JoinNode | null, AliasMap[]>;
  private _allColumns: AliasMap[];

  constructor(tables: Array<{ node: JoinNode | null; columns: AliasMap[] }>) {
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

  columnAliases(node: JoinNode | null): AliasMap[] {
    return this._columnsCache.get(node) ?? [];
  }

  columnAlias(node: JoinNode | null, column: string): string | undefined {
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

  get nodes(): JoinNode[] {
    const result: JoinNode[] = [];
    this._joinRoot.each((part) => {
      if (part !== this._joinRoot && part._joinNode) {
        result.push(part._joinNode);
      }
    });
    return result;
  }

  addAssociation(
    assocName: string,
    options?: { fromModel?: any; fromAlias?: string; parentAssocName?: string },
  ): JoinNode | null {
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
      if (assocDef.options.polymorphic) return null;
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
        return this._addThroughAssociation(
          assocDef,
          modelClass,
          sourceAlias,
          sourcePk,
          options?.parentAssocName,
        );
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

    const node: JoinNode = {
      tableIndex,
      tableAlias,
      tableName: targetTable!,
      effectiveSqlName: effectiveName,
      modelClass: targetModel!,
      columns,
      assocName: options?.parentAssocName ? `${options.parentAssocName}.${assocName}` : assocName,
      immediateAssocName: assocName,
      parentPath: options?.parentAssocName ?? null,
      assocType,
      arelJoin,
      reflection: reflection ?? null,
      isThroughNode: false,
    };

    for (let i = 0; i < columns.length; i++) {
      this._aliases.push({
        alias: `t${tableIndex}_r${i}`,
        tableIndex,
        columnIndex: i,
        column: columns[i],
      });
    }

    this._pushTreeNode(node);
    return node;
  }

  /**
   * Add a nested association path like "comments.author".
   * Walks the chain, adding JOINs for each segment.
   */
  addNestedAssociation(path: string): JoinNode | null {
    const parts = path.split(".");
    if (parts.length === 1) return this.addAssociation(parts[0]);

    const snapshotPaths = new Set(this._treeNodesByPath.keys());
    const snapshotAliases = this._aliases.length;
    const snapshotNextIndex = this._nextTableIndex;
    const snapshotTrackerAliases = new Map(this._aliasTracker.aliases);

    let currentModel = this._baseModel as any;
    let currentAlias = this._baseAlias;
    let lastNode: JoinNode | null = null;
    let parentPath = "";

    for (const part of parts) {
      const node = this.addAssociation(part, {
        fromModel: currentModel,
        fromAlias: currentAlias,
        parentAssocName: parentPath || undefined,
      });
      if (!node) {
        this._rollbackTree(snapshotPaths);
        this._aliases.length = snapshotAliases;
        this._nextTableIndex = snapshotNextIndex;
        this._aliasTracker.aliases.clear();
        for (const [k, v] of snapshotTrackerAliases) this._aliasTracker.aliases.set(k, v);
        return null;
      }
      lastNode = node;
      currentModel = node.modelClass;
      // Use effectiveSqlName, not tableAlias: the JOIN SQL references the
      // effective name (real table name or tN alias), so the next level's ON
      // clause must use the same name as the source of the join.
      currentAlias = node.effectiveSqlName;
      parentPath = parentPath ? `${parentPath}.${part}` : part;
    }
    return lastNode;
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
      const node = child._joinNode;
      if (!node) return;
      const reflection = reflectOnAssociation(parent.baseKlass as any, node.immediateAssocName);
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
    _references?: string[],
  ): Nodes.Join[] {
    if (aliasTracker) this._aliasTracker = aliasTracker;
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
      if (r instanceof JoinAssociation || r instanceof JoinTreeNode) {
        const originalTable = r._joinNode?.effectiveSqlName ?? r.table;
        const lEffective = l._joinNode?.effectiveSqlName;
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
    const arelJoin = child._joinNode?.arelJoin;
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
      const joinNode = child._joinNode;
      if (!joinNode?.arelJoin) continue;
      const arelJoin = joinNode.arelJoin;
      const on = arelJoin.right;
      if (!(on instanceof Nodes.On)) continue;
      const rebound = rebindTableReferences(on.expr as Nodes.Node, fromTableName, toTable);
      if (rebound !== on.expr) {
        const JoinClass = arelJoin.constructor as new (
          left: Nodes.Node,
          right: Nodes.Node,
        ) => Nodes.Join;
        joinNode.arelJoin = new JoinClass(arelJoin.left, new Nodes.On(rebound));
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

  each(callback: (node: JoinNode, index: number) => void): void {
    this.nodes.forEach(callback);
  }

  [Symbol.iterator](): Iterator<JoinNode> {
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
    const seenChildren = new Map<unknown, Map<string, Set<unknown>>>();
    const seenRawPks = new Set<unknown>();
    const rawToKey = new Map<unknown, unknown>();
    const modelCache = new Map<JoinNode, Map<unknown, any>>();

    const baseColumns = getModelColumns(this._baseModel);

    const allNodes = this.nodes;
    const nodeReadonly = new Map<JoinNode, boolean>();
    const nodeStrictLoading = new Map<JoinNode, boolean>();
    for (const node of allNodes) {
      nodeReadonly.set(node, this._isNodeReadonly(node));
      nodeStrictLoading.set(node, this._isNodeStrictLoading(node));
    }

    const columnNames = new Set(this._aliases.map((a) => a.alias));

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
        seenChildren.set(parentKey, new Map());
      } else {
        parentKey = rawToKey.get(rawPk)!;
        parent = parentMap.get(parentKey);
      }

      for (const node of allNodes) {
        if (node.isThroughNode) continue;

        const childAttrs: Record<string, unknown> = {};
        let hasNonNull = false;
        for (let i = 0; i < node.columns.length; i++) {
          const val = row[`t${node.tableIndex}_r${i}`];
          childAttrs[node.columns[i]] = val;
          if (val !== null && val !== undefined) hasNonNull = true;
        }

        if (!hasNonNull) {
          this._markAssociationLoaded(parent, node);
          continue;
        }

        const rawChildPk = childAttrs[(node.modelClass as any).primaryKey ?? "id"];
        const seen = seenChildren.get(parentKey)!;
        if (!seen.has(node.assocName)) seen.set(node.assocName, new Set());
        const seenPks = seen.get(node.assocName)!;

        if (!seenPks.has(rawChildPk)) {
          seenPks.add(rawChildPk);

          let nodeCache = modelCache.get(node);
          if (!nodeCache) {
            nodeCache = new Map();
            modelCache.set(node, nodeCache);
          }
          let child = nodeCache.get(rawChildPk);
          if (!child) {
            child = this.constructModel(childAttrs, node, strictLoadingValue);
            if (rawChildPk != null) nodeCache.set(rawChildPk, child);
          }

          this._wireAssociationProxy(parent, node, child);

          if (nodeReadonly.get(node)) {
            (child as any)._readonly = true;
          }
          if (
            nodeStrictLoading.get(node) &&
            typeof (child as any).strictLoadingBang === "function"
          ) {
            (child as any).strictLoadingBang();
          }

          const parentAssocs = assocMap.get(parentKey)!;
          if (!parentAssocs.has(node.assocName)) {
            parentAssocs.set(node.assocName, []);
          }
          parentAssocs.get(node.assocName)!.push(child);
        }
      }
    }

    return { parents: [...parentMap.values()], associations: assocMap };
  }

  /**
   * Mirrors: ActiveRecord::Associations::JoinDependency#join_root_alias
   * (protected in Rails — the alias used for the root table in the query)
   */
  protected get joinRootAlias(): string {
    return this._baseAlias;
  }

  /**
   * Builds and returns an Aliases object covering all tables in this dependency.
   *
   * Mirrors: ActiveRecord::Associations::JoinDependency#aliases
   */
  private aliases(): Aliases {
    const baseAliasMap: AliasMap[] = this._aliases.filter(
      (a) => a.tableIndex === this._baseTableIndex,
    );
    const tables: Array<{ node: JoinNode | null; columns: AliasMap[] }> = [
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
    node: JoinNode | null,
    strictLoadingValue?: boolean,
  ): any {
    const modelClass = node ? node.modelClass : this._baseModel;
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
  private _wireAssociationProxy(parent: any, node: JoinNode, child: any): void {
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
  private _markAssociationLoaded(parent: any, node: JoinNode): void {
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
  private _isNodeReadonly(node: JoinNode): boolean {
    const refl = node.reflection;
    if (!refl || typeof refl.scopeFor !== "function") return false;
    try {
      const baseRel = (node.modelClass as any)._allForPreload?.();
      if (!baseRel) return false;
      const scopeRel = refl.scopeFor(baseRel);
      return !!scopeRel?._isReadonly;
    } catch {
      return false;
    }
  }

  /**
   * @internal
   * Mirrors Rails' `JoinAssociation#strict_loading?` — checks if the
   * reflection has `strict_loading: true` in its options.
   */
  private _isNodeStrictLoading(node: JoinNode): boolean {
    const refl = node.reflection;
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

  private _pushTreeNode(node: JoinNode): void {
    const parentPath = node.parentPath;
    let parent: JoinPart;
    if (parentPath) {
      const found = this._treeNodesByPath.get(parentPath);
      if (!found) {
        throw new Error(
          `JoinDependency tree: parent path "${parentPath}" not found for "${node.immediateAssocName}"`,
        );
      }
      parent = found;
    } else {
      parent = this._joinRoot;
    }
    let treePart: JoinPart;
    if (node.reflection) {
      const ja = new JoinAssociation(node.reflection);
      (ja as any)._joinNode = node;
      treePart = ja;
    } else {
      treePart = new JoinTreeNode(node.modelClass, node);
    }
    parent.children.push(treePart);
    const fullPath = parentPath
      ? `${parentPath}.${node.immediateAssocName}`
      : node.immediateAssocName;
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
  ): JoinNode | null {
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
      const effectiveName = collides ? tableAlias : tableName;
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
    // Register all tables and create JoinNodes.
    let targetNode: JoinNode | null = null;

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
        const node: JoinNode = {
          tableIndex: entry.tableIndex,
          tableAlias: entry.tableAlias,
          tableName: entry.tableName,
          effectiveSqlName: entry.effectiveName,
          modelClass: entry.model,
          columns,
          assocName: fullAssocName,
          immediateAssocName: assocDef.name,
          parentPath: parentAssocName ?? null,
          assocType: assocDef.type === "hasAndBelongsToMany" ? "hasMany" : assocDef.type,
          arelJoin,
          reflection,
          isThroughNode: false,
        };
        this._pushTreeNode(node);
        targetNode = node;
      } else {
        const reflName = chain[chainIdx].name ?? entry.tableName;
        const throughName = `_through_${reflName}`;
        const throughNodeName = parentAssocName ? `${parentAssocName}.${throughName}` : throughName;
        const refl = chain[chainIdx];
        const node: JoinNode = {
          tableIndex: entry.tableIndex,
          tableAlias: entry.tableAlias,
          tableName: entry.tableName,
          effectiveSqlName: entry.effectiveName,
          modelClass: entry.model,
          columns,
          assocName: throughNodeName,
          immediateAssocName: throughName,
          parentPath: parentAssocName ?? null,
          assocType: ((refl as any)._reflection ?? refl).macro === "hasOne" ? "hasOne" : "hasMany",
          arelJoin,
          reflection: null,
          isThroughNode: true,
        };
        this._pushTreeNode(node);
      }
    }

    return targetNode;
  }

  private _addThroughAssociation(
    assocDef: any,
    modelClass: any,
    sourceAlias: string,
    sourcePk: string,
    parentAssocName?: string,
  ): JoinNode | null {
    const associations: any[] = modelClass._associations ?? [];
    const throughAssocDef = associations.find((a: any) => a.name === assocDef.options.through);
    if (!throughAssocDef) return null;

    const throughClassName =
      throughAssocDef.options.className ?? _camelize(_singularize(throughAssocDef.name));
    const throughModel = modelRegistry.get(throughClassName) as typeof Base | undefined;
    if (!throughModel) return null;
    const throughTable = (throughModel as any).tableName;
    const throughTableIndex = this._nextTableIndex++;
    const throughAlias = `t${throughTableIndex}`;

    const throughFk = throughAssocDef.options.as
      ? (throughAssocDef.options.foreignKey ?? `${_toUnderscore(throughAssocDef.options.as)}_id`)
      : (throughAssocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`);
    if (Array.isArray(throughFk)) return null;

    const throughEffective =
      (this._aliasTracker.aliases.get(throughTable) ?? 0) > 0 ? throughAlias : throughTable;

    // Build Arel tables for through join
    const throughArelTable =
      throughEffective === throughTable
        ? new Table(throughTable)
        : new Table(throughTable, { as: throughEffective });
    this._arelTablesByIndex.set(throughTableIndex, throughArelTable);
    const sourceArelTable = new Table(sourceAlias);

    // Through ON predicate: throughTable.fk = sourceTable.pk
    let throughPredicate: Nodes.Node = throughArelTable
      .get(throughFk)
      .eq(sourceArelTable.get(sourcePk));

    // Polymorphic :as on through association
    if (throughAssocDef.options.as) {
      const typeCol = `${_toUnderscore(throughAssocDef.options.as)}_type`;
      const typePred = throughArelTable.get(typeCol).eq(new Nodes.Quoted(modelClass.name));
      throughPredicate = new Nodes.And([throughPredicate, typePred]);
    }

    const throughArelJoin = new Nodes.OuterJoin(throughArelTable, new Nodes.On(throughPredicate));

    const sourceName = assocDef.options.source ?? _singularize(assocDef.name);
    const throughAssocs: any[] = (throughModel as any)._associations ?? [];
    const sourceAssocDef = throughAssocs.find((a: any) => a.name === sourceName);

    let targetModel: typeof Base | undefined;
    let targetTable!: string;
    const targetTableIndex = this._nextTableIndex++;
    const targetAlias = `t${targetTableIndex}`;

    if (!sourceAssocDef) return null;

    // If the source association is itself a through, recursively resolve
    if (sourceAssocDef.options?.through) {
      this._nextTableIndex--;

      const snapshotPaths = new Set(this._treeNodesByPath.keys());
      const snapshotAliases = this._aliases.length;
      const snapshotNextIndex = this._nextTableIndex;
      const snapshotTrackerAliases = new Map(this._aliasTracker.aliases);

      const throughColumns = getModelColumns(throughModel);
      for (let i = 0; i < throughColumns.length; i++) {
        this._aliases.push({
          alias: `t${throughTableIndex}_r${i}`,
          tableIndex: throughTableIndex,
          columnIndex: i,
          column: throughColumns[i],
        });
      }

      this._aliasTracker.aliases.set(
        throughTable,
        (this._aliasTracker.aliases.get(throughTable) ?? 0) + 1,
      );

      const throughNodeName = parentAssocName
        ? `${parentAssocName}._through_${assocDef.options.through}`
        : `_through_${assocDef.options.through}`;
      const throughNode: JoinNode = {
        tableIndex: throughTableIndex,
        tableAlias: throughAlias,
        tableName: throughTable,
        effectiveSqlName: throughEffective,
        modelClass: throughModel as typeof Base,
        columns: throughColumns,
        assocName: throughNodeName,
        immediateAssocName: `_through_${assocDef.options.through}`,
        parentPath: parentAssocName ?? null,
        assocType: throughAssocDef.type === "hasOne" ? "hasOne" : "hasMany",
        arelJoin: throughArelJoin,
        reflection: null,
        isThroughNode: true,
      };
      this._pushTreeNode(throughNode);

      const recursiveNode = this.addAssociation(sourceName, {
        fromModel: throughModel,
        fromAlias: throughEffective,
        parentAssocName: parentAssocName,
      });

      if (!recursiveNode) {
        this._rollbackTree(snapshotPaths);
        this._aliases.length = snapshotAliases;
        this._nextTableIndex = snapshotNextIndex;
        this._aliasTracker.aliases.clear();
        for (const [k, v] of snapshotTrackerAliases) this._aliasTracker.aliases.set(k, v);
        return null;
      }

      const oldImmediateName = recursiveNode.immediateAssocName;
      const oldParentPath = recursiveNode.parentPath;
      recursiveNode.assocName = parentAssocName
        ? `${parentAssocName}.${assocDef.name}`
        : assocDef.name;
      recursiveNode.immediateAssocName = assocDef.name;
      recursiveNode.parentPath = parentAssocName ?? null;
      recursiveNode.assocType = assocDef.type === "hasAndBelongsToMany" ? "hasMany" : assocDef.type;

      // Rekey tree node: update _treeNodesByPath to reflect renamed association
      const oldKey = oldParentPath ? `${oldParentPath}.${oldImmediateName}` : oldImmediateName;
      const treePart = this._treeNodesByPath.get(oldKey);
      if (treePart) {
        this._treeNodesByPath.delete(oldKey);
        const newKey = recursiveNode.parentPath
          ? `${recursiveNode.parentPath}.${recursiveNode.immediateAssocName}`
          : recursiveNode.immediateAssocName;
        this._treeNodesByPath.set(newKey, treePart);
        if (oldParentPath !== recursiveNode.parentPath) {
          const oldParent = oldParentPath ? this._resolveTreeParent(oldParentPath) : this._joinRoot;
          const idx = oldParent.children.indexOf(treePart);
          if (idx !== -1) oldParent.children.splice(idx, 1);
          const newParent = recursiveNode.parentPath
            ? this._resolveTreeParent(recursiveNode.parentPath)
            : this._joinRoot;
          newParent.children.push(treePart);
        }
      }

      return recursiveNode;
    }

    // Build target join predicate as Arel nodes
    let targetPredicate: Nodes.Node;

    if (sourceAssocDef.type === "belongsTo") {
      const isPoly = sourceAssocDef.options.polymorphic === true;
      if (isPoly && !assocDef.options.sourceType) return null;
      const targetFk = sourceAssocDef.options.foreignKey ?? `${_toUnderscore(sourceName)}_id`;
      if (Array.isArray(targetFk)) return null;
      const className = isPoly
        ? assocDef.options.sourceType
        : (sourceAssocDef.options.className ?? _camelize(sourceName));
      targetModel = modelRegistry.get(className) as typeof Base | undefined;
      if (!targetModel) return null;
      targetTable = (targetModel as any).tableName;
      const targetPk = sourceAssocDef.options.primaryKey ?? (targetModel as any).primaryKey ?? "id";
      if (Array.isArray(targetPk)) return null;

      const targetCollides =
        (this._aliasTracker.aliases.get(targetTable) ?? 0) > 0 || targetTable === throughTable;
      const targetEffective = targetCollides ? targetAlias : targetTable;
      const targetArelTable =
        targetEffective === targetTable
          ? new Table(targetTable)
          : new Table(targetTable, { as: targetEffective });

      // belongsTo: target.pk = through.fk
      targetPredicate = targetArelTable.get(targetPk).eq(throughArelTable.get(targetFk));

      if (isPoly) {
        const typeCol = sourceAssocDef.options.foreignType ?? `${_toUnderscore(sourceName)}_type`;
        const typePred = throughArelTable
          .get(typeCol)
          .eq(new Nodes.Quoted(assocDef.options.sourceType));
        targetPredicate = new Nodes.And([targetPredicate, typePred]);
      }

      return this._finishThroughTarget(
        assocDef,
        targetModel,
        targetTable,
        targetEffective,
        targetArelTable,
        targetPredicate,
        targetTableIndex,
        targetAlias,
        throughTable,
        throughArelJoin,
        throughTableIndex,
        throughAlias,
        throughEffective,
        throughModel,
        throughAssocDef,
        parentAssocName,
      );
    }

    const className = sourceAssocDef?.options?.className ?? _camelize(_singularize(sourceName));
    targetModel = modelRegistry.get(className) as typeof Base | undefined;
    if (!targetModel) return null;
    targetTable = (targetModel as any).tableName;
    const targetFk = sourceAssocDef?.options?.foreignKey ?? `${_toUnderscore(throughClassName)}_id`;
    if (Array.isArray(targetFk)) return null;
    const throughPk = (throughModel as any).primaryKey ?? "id";
    if (Array.isArray(throughPk)) return null;

    const targetCollides =
      (this._aliasTracker.aliases.get(targetTable) ?? 0) > 0 || targetTable === throughTable;
    const targetEffective = targetCollides ? targetAlias : targetTable;
    const targetArelTable =
      targetEffective === targetTable
        ? new Table(targetTable)
        : new Table(targetTable, { as: targetEffective });

    // hasMany/hasOne: target.fk = through.pk
    targetPredicate = targetArelTable.get(targetFk).eq(throughArelTable.get(throughPk));

    return this._finishThroughTarget(
      assocDef,
      targetModel,
      targetTable,
      targetEffective,
      targetArelTable,
      targetPredicate,
      targetTableIndex,
      targetAlias,
      throughTable,
      throughArelJoin,
      throughTableIndex,
      throughAlias,
      throughEffective,
      throughModel,
      throughAssocDef,
      parentAssocName,
    );
  }

  private _finishThroughTarget(
    assocDef: any,
    targetModel: typeof Base,
    targetTable: string,
    targetEffective: string,
    targetArelTable: Table,
    predicate: Nodes.Node,
    targetTableIndex: number,
    targetAlias: string,
    throughTable: string,
    throughArelJoin: Nodes.OuterJoin,
    throughTableIndex: number,
    throughAlias: string,
    throughEffective: string,
    throughModel: typeof Base,
    throughAssocDef: any,
    parentAssocName?: string,
  ): JoinNode | null {
    // Association scope predicates (Arel-based, no regex)
    if (assocDef.options.scope && typeof assocDef.options.scope === "function") {
      const scopeRel = assocDef.options.scope((targetModel as any)._allForPreload());
      if (scopeRel?._whereClause && !scopeRel._whereClause.isEmpty()) {
        let scopeAst: Nodes.Node = scopeRel._whereClause.ast;
        if (targetEffective !== targetTable) {
          scopeAst = rebindTableReferences(scopeAst, targetTable, targetArelTable);
        }
        predicate =
          predicate instanceof Nodes.And
            ? new Nodes.And([...predicate.children, scopeAst])
            : new Nodes.And([predicate, scopeAst]);
      }
    }

    // STI type constraint
    predicate = this._addStiConstraintArel(predicate, targetModel, targetArelTable);

    const targetModelPk = (targetModel as any).primaryKey ?? "id";
    if (Array.isArray(targetModelPk)) return null;

    // Commit-point: register both tables
    this._aliasTracker.aliases.set(
      throughTable,
      (this._aliasTracker.aliases.get(throughTable) ?? 0) + 1,
    );
    this._aliasTracker.aliases.set(
      targetTable,
      (this._aliasTracker.aliases.get(targetTable) ?? 0) + 1,
    );

    const targetColumns = getModelColumns(targetModel);
    const throughColumns = getModelColumns(throughModel);

    // Register through-table column aliases
    for (let i = 0; i < throughColumns.length; i++) {
      this._aliases.push({
        alias: `t${throughTableIndex}_r${i}`,
        tableIndex: throughTableIndex,
        columnIndex: i,
        column: throughColumns[i],
      });
    }

    for (let i = 0; i < targetColumns.length; i++) {
      this._aliases.push({
        alias: `t${targetTableIndex}_r${i}`,
        tableIndex: targetTableIndex,
        columnIndex: i,
        column: targetColumns[i],
      });
    }

    const fullAssocName = parentAssocName ? `${parentAssocName}.${assocDef.name}` : assocDef.name;

    const targetArelJoin = new Nodes.OuterJoin(targetArelTable, new Nodes.On(predicate));
    this._arelTablesByIndex.set(targetTableIndex, targetArelTable);

    const throughNodeName = parentAssocName
      ? `${parentAssocName}._through_${assocDef.options.through}`
      : `_through_${assocDef.options.through}`;
    const throughNode: JoinNode = {
      tableIndex: throughTableIndex,
      tableAlias: throughAlias,
      tableName: throughTable,
      effectiveSqlName: throughEffective,
      modelClass: throughModel as typeof Base,
      columns: throughColumns,
      assocName: throughNodeName,
      immediateAssocName: `_through_${assocDef.options.through}`,
      parentPath: parentAssocName ?? null,
      assocType: throughAssocDef.type === "hasOne" ? "hasOne" : "hasMany",
      arelJoin: throughArelJoin,
      reflection: null,
      isThroughNode: true,
    };
    this._pushTreeNode(throughNode);

    const parentModel = parentAssocName
      ? (this._treeNodesByPath.get(parentAssocName)?._joinNode?.modelClass ?? this._baseModel)
      : this._baseModel;
    const targetReflection = reflectOnAssociation(parentModel as any, assocDef.name);
    const node: JoinNode = {
      tableIndex: targetTableIndex,
      tableAlias: targetAlias,
      effectiveSqlName: targetEffective,
      tableName: targetTable,
      modelClass: targetModel,
      columns: targetColumns,
      assocName: fullAssocName,
      immediateAssocName: assocDef.name,
      parentPath: parentAssocName ?? null,
      assocType: assocDef.type === "hasAndBelongsToMany" ? "hasMany" : assocDef.type,
      arelJoin: targetArelJoin,
      reflection: targetReflection ?? null,
      isThroughNode: false,
    };
    this._pushTreeNode(node);
    return node;
  }
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
      node.children.map((c) => rebindTableReferences(c, fromTableName, toTable)),
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

class JoinTreeNode extends JoinPart {
  override readonly _joinNode: JoinNode;
  private _tableOverride: string | null = null;

  constructor(baseKlass: typeof Base, joinNode: JoinNode) {
    super(baseKlass);
    this._joinNode = joinNode;
  }

  get table(): string {
    return this._tableOverride ?? this._joinNode.effectiveSqlName;
  }

  set table(value: string) {
    this._tableOverride = value;
  }

  override isMatch(other: JoinPart): boolean {
    if (this === other) return true;
    if (!(other instanceof JoinTreeNode)) return false;
    return (
      this._joinNode.immediateAssocName === other._joinNode.immediateAssocName &&
      this._joinNode.modelClass === other._joinNode.modelClass
    );
  }

  match(other: JoinPart): boolean {
    return this.isMatch(other);
  }
}
