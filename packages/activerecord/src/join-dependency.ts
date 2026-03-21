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

import type { Base } from "./base.js";
import {
  underscore as _toUnderscore,
  camelize as _camelize,
  singularize as _singularize,
} from "@rails-ts/activesupport";
import { modelRegistry } from "./associations.js";
import { getInheritanceColumn, isStiSubclass } from "./sti.js";

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
}

export interface AliasMap {
  alias: string;
  tableIndex: number;
  columnIndex: number;
  column: string;
}

function getModelColumns(modelClass: any): string[] {
  const cols: string[] = modelClass.columnNames?.() ?? [];
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

export class JoinDependency {
  private _baseModel: typeof Base;
  private _baseAlias: string;
  private _baseTableIndex = 0;
  private _nextTableIndex = 1;
  private _nodes: JoinNode[] = [];
  private _aliases: AliasMap[] = [];

  constructor(baseModel: typeof Base) {
    this._baseModel = baseModel;
    this._baseAlias = (baseModel as any).tableName;
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
      const className = assocDef.options.className ?? _camelize(assocName);
      targetModel = modelRegistry.get(className) as typeof Base | undefined;
      if (!targetModel) return null;
      targetTable = (targetModel as any).tableName;
      const targetPk = assocDef.options.primaryKey ?? (targetModel as any).primaryKey ?? "id";
      if (Array.isArray(targetPk)) return null;
      joinOn = `"${tableAlias}"."${targetPk}" = "${sourceAlias}"."${foreignKey}"`;
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
      const foreignKey = assocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`;
      const primaryKey = assocDef.options.primaryKey ?? sourcePk;
      joinOn = `"${tableAlias}"."${foreignKey}" = "${sourceAlias}"."${primaryKey}"`;

      if (assocDef.options.as) {
        const typeCol = `${_toUnderscore(assocDef.options.as)}_type`;
        joinOn += ` AND "${tableAlias}"."${typeCol}" = '${modelClass.name}'`;
      }
    } else {
      return null;
    }

    // Apply association scope as additional ON conditions
    if (assocDef.options.scope && typeof assocDef.options.scope === "function") {
      const scopeRel = assocDef.options.scope((targetModel as any)._allForPreload());
      const scopeSql = scopeRel?.toSql?.();
      if (scopeSql) {
        const whereMatch = scopeSql.match(/\bWHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/i);
        if (whereMatch) {
          const scopeWhere = whereMatch[1].replace(
            new RegExp(`"${targetTable}"`, "g"),
            `"${tableAlias}"`,
          );
          joinOn += ` AND ${scopeWhere}`;
        }
      }
    }

    // Add STI type constraint if target is an STI subclass
    joinOn = this._addStiConstraint(joinOn, targetModel!, tableAlias);

    // Guard against composite PK on target model
    const targetModelPk = (targetModel as any).primaryKey ?? "id";
    if (Array.isArray(targetModelPk)) return null;

    const columns = getModelColumns(targetModel);
    const node: JoinNode = {
      tableIndex,
      tableAlias,
      tableName: targetTable!,
      modelClass: targetModel!,
      columns,
      assocName: options?.parentAssocName ? `${options.parentAssocName}.${assocName}` : assocName,
      immediateAssocName: assocName,
      parentPath: options?.parentAssocName ?? null,
      assocType,
      joinSql: `LEFT OUTER JOIN "${targetTable!}" "${tableAlias}" ON ${joinOn}`,
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
      currentAlias = node.tableAlias;
      parentPath = parentPath ? `${parentPath}.${part}` : part;
    }
    return lastNode;
  }

  buildSelectSql(): string {
    const aliasByIndex = new Map<number, string>();
    aliasByIndex.set(this._baseTableIndex, this._baseAlias);
    for (const node of this._nodes) aliasByIndex.set(node.tableIndex, node.tableAlias);

    return this._aliases
      .map((a) => {
        const tableAlias = aliasByIndex.get(a.tableIndex)!;
        return `"${tableAlias}"."${a.column}" AS "${a.alias}"`;
      })
      .join(", ");
  }

  buildJoinSql(): string {
    return this._nodes.map((n) => n.joinSql).join(" ");
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
        const parent = (this._baseModel as any)._instantiate(parentAttrs);
        parentKey = parent.readAttribute(basePk);
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

        const child = (node.modelClass as any)._instantiate(childAttrs);
        const childPk = child.readAttribute((node.modelClass as any).primaryKey ?? "id");
        const parentAssocs = assocMap.get(parentKey)!;
        if (!parentAssocs.has(node.assocName)) {
          parentAssocs.set(node.assocName, []);
        }

        const seen = seenChildren.get(parentKey)!;
        if (!seen.has(node.assocName)) seen.set(node.assocName, new Set());
        const seenPks = seen.get(node.assocName)!;

        if (!seenPks.has(childPk)) {
          seenPks.add(childPk);
          parentAssocs.get(node.assocName)!.push(child);
        }
      }
    }

    return { parents: [...parentMap.values()], associations: assocMap };
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

    if (sourceAssocDef?.type === "belongsTo") {
      const targetFk = sourceAssocDef.options.foreignKey ?? `${_toUnderscore(sourceName)}_id`;
      const className = sourceAssocDef.options.className ?? _camelize(sourceName);
      targetModel = modelRegistry.get(className) as typeof Base | undefined;
      if (!targetModel) return null;
      targetTable = (targetModel as any).tableName;
      const targetPk = sourceAssocDef.options.primaryKey ?? (targetModel as any).primaryKey ?? "id";
      targetJoinOn = `"${targetAlias}"."${targetPk}" = "${throughAlias}"."${targetFk}"`;
    } else {
      const className = sourceAssocDef?.options?.className ?? _camelize(_singularize(sourceName));
      targetModel = modelRegistry.get(className) as typeof Base | undefined;
      if (!targetModel) return null;
      targetTable = (targetModel as any).tableName;
      const targetFk =
        sourceAssocDef?.options?.foreignKey ?? `${_toUnderscore(throughClassName)}_id`;
      const throughPk = (throughModel as any).primaryKey ?? "id";
      targetJoinOn = `"${targetAlias}"."${targetFk}" = "${throughAlias}"."${throughPk}"`;
    }

    // Apply association scope
    if (assocDef.options.scope && typeof assocDef.options.scope === "function") {
      const scopeRel = assocDef.options.scope((targetModel as any)._allForPreload());
      const scopeSql = scopeRel?.toSql?.();
      if (scopeSql) {
        const whereMatch = scopeSql.match(/\bWHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/i);
        if (whereMatch) {
          const scopeWhere = whereMatch[1].replace(
            new RegExp(`"${targetTable}"`, "g"),
            `"${targetAlias}"`,
          );
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
