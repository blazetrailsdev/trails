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

export interface JoinNode {
  tableIndex: number;
  tableAlias: string;
  tableName: string;
  modelClass: typeof Base;
  columns: string[];
  assocName: string;
  assocType: "hasMany" | "hasOne" | "belongsTo";
  arelJoin: Nodes.Join | null;
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
  private _nodes: JoinNode[] = [];
  private _aliases: AliasMap[] = [];
  // Tracks real table names already in use to detect collisions.
  // When a joined table's real name is unique, we skip the tN alias in SQL
  // (matching Rails' AliasTracker which only aliases on collision).
  private _usedTableNames: Set<string>;
  private _arelTablesByIndex: Map<number, Table> = new Map();

  constructor(baseModel: typeof Base) {
    this._baseModel = baseModel;
    this._baseAlias = (baseModel as any).tableName;
    this._usedTableNames = new Set([this._baseAlias]);
    this._arelTablesByIndex.set(this._baseTableIndex, (baseModel as any).arelTable);
    this._buildBaseAliases();
  }

  get nodes(): JoinNode[] {
    return this._nodes;
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

    const effectiveName = this._usedTableNames.has(targetTable!) ? tableAlias : targetTable!;

    const targetArelTable =
      effectiveName === targetTable!
        ? new Table(targetTable!)
        : new Table(targetTable!, { as: effectiveName });
    this._arelTablesByIndex.set(tableIndex, targetArelTable);
    const sourceArelTable = new Table(sourceAlias);

    // Build ON predicate as Arel nodes (mirrors Rails join_dependency.rb build_constraint)
    let predicate: Nodes.Node;
    if (isBelongsTo) {
      predicate = targetArelTable.get(primaryKey!).eq(sourceArelTable.get(foreignKey!));
    } else {
      predicate = targetArelTable.get(foreignKey!).eq(sourceArelTable.get(primaryKey!));
    }

    // Polymorphic :as type predicate
    if (!isBelongsTo && assocDef.options.as) {
      const typeCol = `${_toUnderscore(assocDef.options.as)}_type`;
      const typePred = targetArelTable.get(typeCol).eq(new Nodes.Quoted(modelClass.name));
      predicate = new Nodes.And([predicate, typePred]);
    }

    // Association scope predicates
    if (assocDef.options.scope && typeof assocDef.options.scope === "function") {
      const scopeRel = assocDef.options.scope((targetModel as any)._allForPreload());
      if (scopeRel?._whereClause && !scopeRel._whereClause.isEmpty()) {
        let scopeAst: Nodes.Node = scopeRel._whereClause.ast;
        // When the target table was aliased (collision), the scope's AST
        // references the unaliased table. Rebind attributes to the aliased table.
        if (effectiveName !== targetTable!) {
          scopeAst = rebindTableReferences(scopeAst, targetTable!, targetArelTable);
        }
        predicate =
          predicate instanceof Nodes.And
            ? new Nodes.And([...predicate.children, scopeAst])
            : new Nodes.And([predicate, scopeAst]);
      }
    }

    // STI type constraint as Arel predicate
    predicate = this._addStiConstraintArel(predicate, targetModel!, targetArelTable);

    const targetModelPk = (targetModel as any).primaryKey ?? "id";
    if (Array.isArray(targetModelPk)) return null;

    // Commit-point: all failure guards passed; register the table name.
    this._usedTableNames.add(targetTable!);

    const columns = getModelColumns(targetModel);

    const arelJoin = new Nodes.OuterJoin(targetArelTable, new Nodes.On(predicate));

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
    };

    for (let i = 0; i < columns.length; i++) {
      this._aliases.push({
        alias: `t${tableIndex}_r${i}`,
        tableIndex,
        columnIndex: i,
        column: columns[i],
      });
    }

    this._nodes.push(node);
    return node;
  }

  /**
   * Add a nested association path like "comments.author".
   * Walks the chain, adding JOINs for each segment.
   */
  addNestedAssociation(path: string): JoinNode | null {
    const parts = path.split(".");
    if (parts.length === 1) return this.addAssociation(parts[0]);

    // Snapshot state so we can roll back on failure
    const snapshotNodes = this._nodes.length;
    const snapshotAliases = this._aliases.length;
    const snapshotNextIndex = this._nextTableIndex;

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
        // Roll back partial additions
        this._nodes.length = snapshotNodes;
        this._aliases.length = snapshotAliases;
        this._nextTableIndex = snapshotNextIndex;
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
    const modelByPath = new Map<string, any>();
    return this._nodes
      .map((node) => {
        const parentModel = node.parentPath
          ? (modelByPath.get(node.parentPath) ?? (this._baseModel as any))
          : (this._baseModel as any);
        const reflection = reflectOnAssociation(parentModel, node.immediateAssocName);
        const nodePath = node.parentPath
          ? `${node.parentPath}.${node.immediateAssocName}`
          : node.immediateAssocName;
        modelByPath.set(nodePath, node.modelClass as any);
        return reflection;
      })
      .filter(Boolean);
  }

  /**
   * @todo `_aliasTracker` is a stub — needs real `JoinDependency` alias-tracking
   *   (Rails' `AliasTracker`) to deconflict table aliases in complex multi-join queries.
   */
  joinConstraints(
    joinsToAdd: JoinDependency[],
    _aliasTracker?: any,
    _references?: string[],
  ): Nodes.Join[] {
    const joins: Nodes.Join[] = this._nodes.map((n) => n.arelJoin!);
    for (const oj of joinsToAdd) {
      joins.push(...oj._nodes.map((n) => n.arelJoin!));
    }
    return joins;
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
    this._nodes.forEach(callback);
  }

  [Symbol.iterator](): Iterator<JoinNode> {
    return this._nodes[Symbol.iterator]();
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

  instantiateFromRows(rows: Record<string, unknown>[]): {
    parents: any[];
    associations: Map<unknown, Map<string, any[]>>;
  } {
    const basePk = (this._baseModel as any).primaryKey ?? "id";
    const parentMap = new Map<unknown, any>();
    const assocMap = new Map<unknown, Map<string, any[]>>();
    const seenChildren = new Map<unknown, Map<string, Set<unknown>>>();
    const seenRawPks = new Set<unknown>();
    const rawToKey = new Map<unknown, unknown>();

    const baseColumns = getModelColumns(this._baseModel);

    for (const row of rows) {
      const parentAttrs: Record<string, unknown> = {};
      for (let i = 0; i < baseColumns.length; i++) {
        parentAttrs[baseColumns[i]] = row[`t${this._baseTableIndex}_r${i}`];
      }

      const rawPk = parentAttrs[basePk];
      let parentKey: unknown;
      if (!seenRawPks.has(rawPk)) {
        seenRawPks.add(rawPk);
        const parent = this.constructModel(parentAttrs, null);
        parentKey = parent._readAttribute(basePk);
        rawToKey.set(rawPk, parentKey);
        parentMap.set(parentKey, parent);
        assocMap.set(parentKey, new Map());
        seenChildren.set(parentKey, new Map());
      } else {
        parentKey = rawToKey.get(rawPk)!;
      }

      for (const node of this._nodes) {
        const childAttrs: Record<string, unknown> = {};
        let hasNonNull = false;
        for (let i = 0; i < node.columns.length; i++) {
          const val = row[`t${node.tableIndex}_r${i}`];
          childAttrs[node.columns[i]] = val;
          if (val !== null && val !== undefined) hasNonNull = true;
        }

        if (!hasNonNull) continue;

        const rawChildPk = childAttrs[(node.modelClass as any).primaryKey ?? "id"];
        const seen = seenChildren.get(parentKey)!;
        if (!seen.has(node.assocName)) seen.set(node.assocName, new Set());
        const seenPks = seen.get(node.assocName)!;

        if (!seenPks.has(rawChildPk)) {
          seenPks.add(rawChildPk);
          const child = this.constructModel(childAttrs, node);
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
    for (const node of this._nodes) {
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
  private construct(resultSet: Record<string, unknown>[], _strictLoadingValue?: boolean): any[] {
    return this.instantiateFromRows(resultSet).parents;
  }

  /**
   * Instantiates a single model record from a hash of aliased row attributes.
   * Deduplication of repeated parent rows is handled by instantiateFromRows
   * (the `seenRawPks` / `parentMap` logic); this method just constructs the
   * model object for a given attribute hash.
   *
   * Mirrors: ActiveRecord::Associations::JoinDependency#construct_model
   */
  private constructModel(attrs: Record<string, unknown>, node: JoinNode | null): any {
    const modelClass = node ? node.modelClass : this._baseModel;
    return (modelClass as any)._instantiate(attrs);
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

    const throughEffective = this._usedTableNames.has(throughTable) ? throughAlias : throughTable;

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

      const snapshotNodes = this._nodes.length;
      const snapshotAliases = this._aliases.length;
      const snapshotNextIndex = this._nextTableIndex;
      const snapshotUsedTableNames = new Set(this._usedTableNames);

      const throughColumns = getModelColumns(throughModel);
      for (let i = 0; i < throughColumns.length; i++) {
        this._aliases.push({
          alias: `t${throughTableIndex}_r${i}`,
          tableIndex: throughTableIndex,
          columnIndex: i,
          column: throughColumns[i],
        });
      }

      this._usedTableNames.add(throughTable);

      const throughNodeName = parentAssocName
        ? `${parentAssocName}._through_${assocDef.options.through}`
        : `_through_${assocDef.options.through}`;
      this._nodes.push({
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
      });

      const recursiveNode = this.addAssociation(sourceName, {
        fromModel: throughModel,
        fromAlias: throughEffective,
        parentAssocName: parentAssocName,
      });

      if (!recursiveNode) {
        this._nodes.length = snapshotNodes;
        this._aliases.length = snapshotAliases;
        this._nextTableIndex = snapshotNextIndex;
        this._usedTableNames = snapshotUsedTableNames;
        return null;
      }

      recursiveNode.assocName = parentAssocName
        ? `${parentAssocName}.${assocDef.name}`
        : assocDef.name;
      recursiveNode.immediateAssocName = assocDef.name;
      recursiveNode.parentPath = parentAssocName ?? null;
      recursiveNode.assocType = assocDef.type === "hasAndBelongsToMany" ? "hasMany" : assocDef.type;

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

      const targetCollides = this._usedTableNames.has(targetTable) || targetTable === throughTable;
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

    const targetCollides = this._usedTableNames.has(targetTable) || targetTable === throughTable;
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
    this._usedTableNames.add(throughTable);
    this._usedTableNames.add(targetTable);

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

    // Push intermediate through node
    const throughNodeName = parentAssocName
      ? `${parentAssocName}._through_${assocDef.options.through}`
      : `_through_${assocDef.options.through}`;
    this._nodes.push({
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
    });

    // Push target node
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
    };

    this._nodes.push(node);
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
