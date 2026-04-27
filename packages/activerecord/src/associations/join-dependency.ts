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
import { sql as arelSql, Nodes } from "@blazetrails/arel";
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
  joinSql: string;
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

  constructor(baseModel: typeof Base) {
    this._baseModel = baseModel;
    this._baseAlias = (baseModel as any).tableName;
    this._usedTableNames = new Set([this._baseAlias]);
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

    const sourceAlias = options?.fromAlias ?? this._baseAlias;
    const sourcePk = modelClass.primaryKey ?? "id";
    if (Array.isArray(sourcePk)) return null;

    const tableIndex = this._nextTableIndex++;
    const tableAlias = `t${tableIndex}`;

    let targetModel: typeof Base | undefined;
    let targetTable: string;
    let joinOn: string;
    const assocType: "hasMany" | "hasOne" | "belongsTo" = assocDef.type;

    if (assocDef.type === "belongsTo") {
      if (assocDef.options.polymorphic) return null;
      const foreignKey = assocDef.options.foreignKey ?? `${_toUnderscore(assocName)}_id`;
      if (Array.isArray(foreignKey)) return null;
      const className = assocDef.options.className ?? _camelize(assocName);
      targetModel = modelRegistry.get(className) as typeof Base | undefined;
      if (!targetModel) return null;
      targetTable = (targetModel as any).tableName;
      const targetPk = assocDef.options.primaryKey ?? (targetModel as any).primaryKey ?? "id";
      if (Array.isArray(targetPk)) return null;
      // effectiveName resolved below after targetTable is known
      joinOn = `PLACEHOLDER."${targetPk}" = "${sourceAlias}"."${foreignKey}"`;
    } else if (assocDef.type === "hasMany" || assocDef.type === "hasOne") {
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
      const foreignKey = assocDef.options.as
        ? (assocDef.options.foreignKey ?? `${_toUnderscore(assocDef.options.as)}_id`)
        : (assocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`);
      if (Array.isArray(foreignKey)) return null;
      const primaryKey = assocDef.options.primaryKey ?? sourcePk;
      if (Array.isArray(primaryKey)) return null;
      joinOn = `PLACEHOLDER."${foreignKey}" = "${sourceAlias}"."${primaryKey}"`;

      if (assocDef.options.as) {
        const typeCol = `${_toUnderscore(assocDef.options.as)}_type`;
        joinOn += ` AND PLACEHOLDER."${typeCol}" = '${modelClass.name}'`;
      }
    } else {
      return null;
    }

    // Rails only aliases a joined table when its real name is already in use
    // (AliasTracker: aliases[table_name] == 0 → use real name). Mirror that:
    // use the real table name in SQL when there's no collision, otherwise fall
    // back to the sequential tN alias.
    // Track real table names only — collision check is against the real name.
    // effectiveName is the tN alias when there IS a collision, but we still
    // record targetTable so future joins against the same real table also alias.
    const effectiveName = this._usedTableNames.has(targetTable!) ? tableAlias : targetTable!;
    this._usedTableNames.add(targetTable!);

    // Substitute the PLACEHOLDER with the effective SQL name
    joinOn = joinOn.replace(/PLACEHOLDER/g, `"${effectiveName}"`);

    // Apply association scope as additional ON conditions
    if (assocDef.options.scope && typeof assocDef.options.scope === "function") {
      const scopeRel = assocDef.options.scope((targetModel as any)._allForPreload());
      const scopeSql = scopeRel?.toSql?.();
      if (scopeSql) {
        const whereMatch = scopeSql.match(/\bWHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/i);
        if (whereMatch) {
          const scopeWhere = whereMatch[1].replaceAll(`"${targetTable!}"`, `"${effectiveName}"`);
          joinOn += ` AND ${scopeWhere}`;
        }
      }
    }

    // Add STI type constraint if target is an STI subclass
    joinOn = this._addStiConstraint(joinOn, targetModel!, effectiveName);

    // Guard against composite PK on target model
    const targetModelPk = (targetModel as any).primaryKey ?? "id";
    if (Array.isArray(targetModelPk)) return null;

    const columns = getModelColumns(targetModel);

    // Build JOIN SQL: only emit the alias clause when effectiveName differs
    // from the real table name (i.e. there was a collision and we used tN).
    const joinTableExpr =
      effectiveName === targetTable! ? `"${targetTable!}"` : `"${targetTable!}" "${effectiveName}"`;

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
      joinSql: `LEFT OUTER JOIN ${joinTableExpr} ON ${joinOn}`,
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

  private _buildSelectExpressions(): string[] {
    const effectiveNameByIndex = new Map<number, string>();
    effectiveNameByIndex.set(this._baseTableIndex, this._baseAlias);
    for (const node of this._nodes) {
      effectiveNameByIndex.set(node.tableIndex, node.effectiveSqlName);
    }

    return this._aliases.map((a) => {
      const effectiveName = effectiveNameByIndex.get(a.tableIndex)!;
      // Rails emits column aliases as SqlLiteral (bare, not quoted).
      return `"${effectiveName}"."${a.column}" AS ${a.alias}`;
    });
  }

  buildSelectSql(): string {
    return this._buildSelectExpressions().join(", ");
  }

  buildJoinSql(): string {
    return this._nodes.map((n) => n.joinSql).join(" ");
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

  joinConstraints(
    joinsToAdd: JoinDependency[],
    _aliasTracker?: any,
    _references?: string[],
  ): any[] {
    const joins = this._nodes.map((n) => arelSql(n.joinSql));
    for (const oj of joinsToAdd) {
      joins.push(...oj._nodes.map((n) => arelSql(n.joinSql)));
    }
    return joins;
  }

  instantiate(resultSet: Record<string, unknown>[], strictLoadingValue?: boolean): any[] {
    return this.construct(resultSet, strictLoadingValue);
  }

  applyColumnAliases(relation: any): any {
    // Rails: aliases.columns.map { |c| Arel::Nodes::As.new(...) }
    // Trails: build the same SQL strings via the aliases object.
    const effectiveNameByIndex = new Map<number, string>();
    effectiveNameByIndex.set(this._baseTableIndex, this._baseAlias);
    for (const node of this._nodes) {
      effectiveNameByIndex.set(node.tableIndex, node.effectiveSqlName);
    }
    const selectExprs = this.aliases()
      .columns()
      .map((a) => `"${effectiveNameByIndex.get(a.tableIndex)!}"."${a.column}" AS ${a.alias}`);
    if (typeof relation.reselectBang === "function") {
      relation.reselectBang(...selectExprs);
      return relation;
    } else if (typeof relation.select === "function") {
      return relation.select(...selectExprs);
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

  private _addStiConstraint(joinOn: string, model: typeof Base, alias: string): string {
    const inheritanceCol = getInheritanceColumn(model);
    if (inheritanceCol && isStiSubclass(model)) {
      const stiNames = [model.name, ...((model as any).descendants ?? []).map((d: any) => d.name)];
      const inList = stiNames.map((n: string) => `'${n}'`).join(", ");
      joinOn += ` AND "${alias}"."${inheritanceCol}" IN (${inList})`;
    }
    return joinOn;
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

    let throughJoinOn = `"${throughAlias}"."${throughFk}" = "${sourceAlias}"."${sourcePk}"`;
    if (throughAssocDef.options.as) {
      const typeCol = `${_toUnderscore(throughAssocDef.options.as)}_type`;
      throughJoinOn += ` AND "${throughAlias}"."${typeCol}" = '${modelClass.name}'`;
    }
    const throughJoinSql = `LEFT OUTER JOIN "${throughTable}" "${throughAlias}" ON ${throughJoinOn}`;

    const sourceName = assocDef.options.source ?? _singularize(assocDef.name);
    const throughAssocs: any[] = (throughModel as any)._associations ?? [];
    const sourceAssocDef = throughAssocs.find((a: any) => a.name === sourceName);

    let targetModel: typeof Base | undefined;
    let targetTable: string;
    let targetJoinOn: string;
    const targetTableIndex = this._nextTableIndex++;
    const targetAlias = `t${targetTableIndex}`;

    if (!sourceAssocDef) return null;

    // If the source association is itself a through, recursively resolve
    // the chain by first adding the through JOIN, then delegating to
    // addAssociation on the through model for the source name.
    if (sourceAssocDef.options?.through) {
      // We already consumed a table index for the target, give it back
      this._nextTableIndex--;

      // Snapshot state for rollback if recursive call fails
      const snapshotNodes = this._nodes.length;
      const snapshotAliases = this._aliases.length;
      const snapshotNextIndex = this._nextTableIndex;

      // Add the through table JOIN as a standalone node (intermediate)
      const throughColumns = getModelColumns(throughModel);
      for (let i = 0; i < throughColumns.length; i++) {
        this._aliases.push({
          alias: `t${throughTableIndex}_r${i}`,
          tableIndex: throughTableIndex,
          columnIndex: i,
          column: throughColumns[i],
        });
      }

      const throughNodeName = parentAssocName
        ? `${parentAssocName}._through_${assocDef.options.through}`
        : `_through_${assocDef.options.through}`;
      this._nodes.push({
        tableIndex: throughTableIndex,
        tableAlias: throughAlias,
        tableName: throughTable,
        effectiveSqlName: throughAlias,
        modelClass: throughModel as typeof Base,
        columns: throughColumns,
        assocName: throughNodeName,
        immediateAssocName: `_through_${assocDef.options.through}`,
        parentPath: parentAssocName ?? null,
        assocType: throughAssocDef.type === "hasOne" ? "hasOne" : "hasMany",
        joinSql: throughJoinSql,
      });

      // Now recursively add the source association from the through model
      const recursiveNode = this.addAssociation(sourceName, {
        fromModel: throughModel,
        fromAlias: throughAlias,
        parentAssocName: parentAssocName,
      });

      if (!recursiveNode) {
        // Roll back intermediate state
        this._nodes.length = snapshotNodes;
        this._aliases.length = snapshotAliases;
        this._nextTableIndex = snapshotNextIndex;
        return null;
      }

      // Patch the recursive node to reflect the outer association
      recursiveNode.assocName = parentAssocName
        ? `${parentAssocName}.${assocDef.name}`
        : assocDef.name;
      recursiveNode.immediateAssocName = assocDef.name;
      recursiveNode.parentPath = parentAssocName ?? null;
      recursiveNode.assocType = assocDef.type;

      return recursiveNode;
    }

    if (sourceAssocDef.type === "belongsTo") {
      const targetFk = sourceAssocDef.options.foreignKey ?? `${_toUnderscore(sourceName)}_id`;
      if (Array.isArray(targetFk)) return null;
      const className = sourceAssocDef.options.className ?? _camelize(sourceName);
      targetModel = modelRegistry.get(className) as typeof Base | undefined;
      if (!targetModel) return null;
      targetTable = (targetModel as any).tableName;
      const targetPk = sourceAssocDef.options.primaryKey ?? (targetModel as any).primaryKey ?? "id";
      if (Array.isArray(targetPk)) return null;
      targetJoinOn = `"${targetAlias}"."${targetPk}" = "${throughAlias}"."${targetFk}"`;
    } else {
      const className = sourceAssocDef?.options?.className ?? _camelize(_singularize(sourceName));
      targetModel = modelRegistry.get(className) as typeof Base | undefined;
      if (!targetModel) return null;
      targetTable = (targetModel as any).tableName;
      const targetFk =
        sourceAssocDef?.options?.foreignKey ?? `${_toUnderscore(throughClassName)}_id`;
      if (Array.isArray(targetFk)) return null;
      const throughPk = (throughModel as any).primaryKey ?? "id";
      if (Array.isArray(throughPk)) return null;
      targetJoinOn = `"${targetAlias}"."${targetFk}" = "${throughAlias}"."${throughPk}"`;
    }

    // Apply association scope
    if (assocDef.options.scope && typeof assocDef.options.scope === "function") {
      const scopeRel = assocDef.options.scope((targetModel as any)._allForPreload());
      const scopeSql = scopeRel?.toSql?.();
      if (scopeSql) {
        const whereMatch = scopeSql.match(/\bWHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/i);
        if (whereMatch) {
          const scopeWhere = whereMatch[1].replaceAll(`"${targetTable}"`, `"${targetAlias}"`);
          targetJoinOn += ` AND ${scopeWhere}`;
        }
      }
    }

    // Add STI type constraint on target
    targetJoinOn = this._addStiConstraint(targetJoinOn, targetModel, targetAlias);

    // Guard against composite PK on target
    const targetModelPk = (targetModel as any).primaryKey ?? "id";
    if (Array.isArray(targetModelPk)) return null;

    const targetColumns = getModelColumns(targetModel);

    for (let i = 0; i < targetColumns.length; i++) {
      this._aliases.push({
        alias: `t${targetTableIndex}_r${i}`,
        tableIndex: targetTableIndex,
        columnIndex: i,
        column: targetColumns[i],
      });
    }

    const fullAssocName = parentAssocName ? `${parentAssocName}.${assocDef.name}` : assocDef.name;

    const node: JoinNode = {
      tableIndex: targetTableIndex,
      tableAlias: targetAlias,
      effectiveSqlName: targetAlias,
      tableName: targetTable,
      modelClass: targetModel,
      columns: targetColumns,
      assocName: fullAssocName,
      immediateAssocName: assocDef.name,
      parentPath: parentAssocName ?? null,
      assocType: assocDef.type,
      joinSql: `${throughJoinSql} LEFT OUTER JOIN "${targetTable}" "${targetAlias}" ON ${targetJoinOn}`,
    };

    this._nodes.push(node);
    return node;
  }
}

function joinRoot(dep: JoinDependency): unknown {
  return (dep as any)._nodes?.[0] ?? null;
}

function joinType(_dep: JoinDependency): string {
  return "LEFT OUTER JOIN";
}

function aliasTracker(dep: JoinDependency): unknown {
  // _aliasCache is defined on JoinDependency (Map<JoinNode|null, Map<string,string>>).
  // Rails' alias_tracker is an AliasTracker instance; ours is the equivalent map.
  return (dep as any)._aliasCache ?? null;
}

function makeJoinConstraints(dep: JoinDependency, _root: unknown, _type: string): Nodes.Node[] {
  // Rails: maps each child of join_root into join constraints via make_constraints.
  // Our implementation stores pre-built JOIN SQL in _nodes; return as Arel literals.
  type JoinNode = { joinSql: string };
  const nodes = (dep as any)._nodes as JoinNode[] | undefined;
  return (nodes ?? []).map((n) => arelSql(n.joinSql));
}

function makeConstraints(
  dep: JoinDependency,
  _parent: unknown,
  child: unknown,
  _type: string,
): Nodes.Node[] {
  // Rails: calls child.join_constraints to build Arel::Nodes::OuterJoin nodes.
  // Our _nodes contain pre-built JOIN SQL per association; filter to the child's node.
  type JoinNode = { assocName?: string; joinSql: string };
  const nodes = (dep as any)._nodes as JoinNode[] | undefined;
  const childName = (child as { assocName?: string })?.assocName;
  const matching = (nodes ?? []).filter((n) => !childName || n.assocName === childName);
  void Nodes.OuterJoin; // Rails uses Arel::Nodes::OuterJoin in child.join_constraints
  return matching.map((n) => arelSql(n.joinSql));
}

function walk(dep: JoinDependency, _left: unknown, _right: unknown, _type: string): Nodes.Node[] {
  // Rails: merges two JoinAssociation subtrees reusing existing table aliases.
  // Our flat _nodes structure doesn't have a tree to walk; return all join SQLs.
  type JoinNode = { joinSql: string };
  const nodes = (dep as any)._nodes as JoinNode[] | undefined;
  return (nodes ?? []).map((n) => arelSql(n.joinSql));
}

function findReflection(_dep: JoinDependency, klass: unknown, name: string): unknown {
  const found = (klass as any)?._reflectOnAssociation?.(name) ?? null;
  if (!found) {
    throw new Error(
      `Can't join '${(klass as any)?.name ?? String(klass)}' to association named '${name}'`,
    );
  }
  return found;
}

function build(_dep: JoinDependency, _associations: unknown, _baseKlass: unknown): unknown[] {
  // Rails: recursively builds JoinAssociation tree from an association name hash.
  // Our JoinDependency uses addEagerLoadFor; return node metadata for reflection.
  type JoinNode = { assocName?: string; assocType?: string };
  const nodes = (_dep as any)._nodes as JoinNode[] | undefined;
  return (nodes ?? []).map((n) => ({ name: n.assocName, type: n.assocType }));
}
