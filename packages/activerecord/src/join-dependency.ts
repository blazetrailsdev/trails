/**
 * JoinDependency — builds aliased LEFT OUTER JOIN queries and
 * reconstructs nested model instances from flat result rows.
 *
 * Mirrors: ActiveRecord::Associations::JoinDependency
 *
 * Rails assigns each joined table a sequential index (t0, t1, t2...)
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

export interface JoinNode {
  tableIndex: number;
  tableName: string;
  modelClass: typeof Base;
  columns: string[];
  assocName: string;
  assocType: "hasMany" | "hasOne" | "belongsTo";
  joinSql: string;
  children: JoinNode[];
}

export interface AliasMap {
  alias: string;
  tableIndex: number;
  columnIndex: number;
  column: string;
}

function getModelColumns(modelClass: any): string[] {
  const cols = modelClass.columnNames?.() ?? [];
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
  private _baseTableIndex = 0;
  private _nextTableIndex = 1;
  private _nodes: JoinNode[] = [];
  private _aliases: AliasMap[] = [];

  constructor(baseModel: typeof Base) {
    this._baseModel = baseModel;
    this._buildBaseAliases();
  }

  get nodes(): JoinNode[] {
    return this._nodes;
  }

  addAssociation(assocName: string): JoinNode | null {
    const modelClass = this._baseModel as any;
    const associations: any[] = modelClass._associations ?? [];
    const assocDef = associations.find((a: any) => a.name === assocName);
    if (!assocDef) return null;

    const sourceTable = modelClass.tableName;
    const sourcePk = modelClass.primaryKey ?? "id";
    const tableIndex = this._nextTableIndex++;

    let targetModel: typeof Base | undefined;
    let targetTable: string;
    let joinOn: string;
    const assocType: "hasMany" | "hasOne" | "belongsTo" = assocDef.type;

    if (assocDef.type === "belongsTo") {
      if (assocDef.options.polymorphic) {
        return null;
      }
      const foreignKey = assocDef.options.foreignKey ?? `${_toUnderscore(assocName)}_id`;
      const className = assocDef.options.className ?? _camelize(assocName);
      targetModel = modelRegistry.get(className) as typeof Base | undefined;
      if (!targetModel) return null;
      targetTable = (targetModel as any).tableName;
      const targetPk = assocDef.options.primaryKey ?? (targetModel as any).primaryKey ?? "id";
      joinOn = `"${targetTable}"."${targetPk}" = "${sourceTable}"."${foreignKey}"`;
    } else if (assocDef.type === "hasMany" || assocDef.type === "hasOne") {
      if (assocDef.options.through) {
        return this._addThroughAssociation(assocDef, sourceTable, sourcePk);
      }
      const className =
        assocDef.options.className ??
        _camelize(assocDef.type === "hasMany" ? _singularize(assocName) : assocName);
      targetModel = modelRegistry.get(className) as typeof Base | undefined;
      if (!targetModel) return null;
      targetTable = (targetModel as any).tableName;
      const foreignKey = assocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`;
      const primaryKey = assocDef.options.primaryKey ?? sourcePk;
      joinOn = `"${targetTable}"."${foreignKey}" = "${sourceTable}"."${primaryKey}"`;

      if (assocDef.options.as) {
        const typeCol = `${_toUnderscore(assocDef.options.as)}_type`;
        joinOn += ` AND "${targetTable}"."${typeCol}" = '${modelClass.name}'`;
      }
    } else {
      return null;
    }

    const columns = getModelColumns(targetModel);
    const node: JoinNode = {
      tableIndex,
      tableName: targetTable!,
      modelClass: targetModel!,
      columns,
      assocName,
      assocType,
      joinSql: `LEFT OUTER JOIN "${targetTable!}" ON ${joinOn}`,
      children: [],
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

  buildSelectSql(): string {
    return this._aliases
      .map((a) => {
        const tableName =
          a.tableIndex === this._baseTableIndex
            ? (this._baseModel as any).tableName
            : this._nodes.find((n) => n.tableIndex === a.tableIndex)!.tableName;
        return `"${tableName}"."${a.column}" AS "${a.alias}"`;
      })
      .join(", ");
  }

  buildJoinSql(): string {
    return this._nodes.map((n) => n.joinSql).join(" ");
  }

  instantiateFromRows(rows: Record<string, unknown>[]): {
    parents: any[];
    associations: Map<unknown, Map<string, any[]>>;
  } {
    const basePk = (this._baseModel as any).primaryKey ?? "id";
    const parentMap = new Map<unknown, any>();
    const assocMap = new Map<unknown, Map<string, any[]>>();
    const seenChildren = new Map<unknown, Map<string, Set<unknown>>>();

    const baseColumns = getModelColumns(this._baseModel);

    for (const row of rows) {
      const parentAttrs: Record<string, unknown> = {};
      for (let i = 0; i < baseColumns.length; i++) {
        parentAttrs[baseColumns[i]] = row[`t${this._baseTableIndex}_r${i}`];
      }

      const parentPk = parentAttrs[basePk];
      if (!parentMap.has(parentPk)) {
        parentMap.set(parentPk, (this._baseModel as any)._instantiate(parentAttrs));
        assocMap.set(parentPk, new Map());
        seenChildren.set(parentPk, new Map());
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

        const childPk = childAttrs[(node.modelClass as any).primaryKey ?? "id"];
        const parentAssocs = assocMap.get(parentPk)!;
        if (!parentAssocs.has(node.assocName)) {
          parentAssocs.set(node.assocName, []);
        }

        const seen = seenChildren.get(parentPk)!;
        if (!seen.has(node.assocName)) seen.set(node.assocName, new Set());
        const seenPks = seen.get(node.assocName)!;

        if (!seenPks.has(childPk)) {
          seenPks.add(childPk);
          parentAssocs.get(node.assocName)!.push((node.modelClass as any)._instantiate(childAttrs));
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
    sourceTable: string,
    sourcePk: string,
  ): JoinNode | null {
    const modelClass = this._baseModel as any;
    const associations: any[] = modelClass._associations ?? [];
    const throughAssocDef = associations.find((a: any) => a.name === assocDef.options.through);
    if (!throughAssocDef) return null;

    const throughClassName =
      throughAssocDef.options.className ?? _camelize(_singularize(throughAssocDef.name));
    const throughModel = modelRegistry.get(throughClassName) as typeof Base | undefined;
    if (!throughModel) return null;
    const throughTable = (throughModel as any).tableName;

    const throughFk = throughAssocDef.options.as
      ? (throughAssocDef.options.foreignKey ?? `${_toUnderscore(throughAssocDef.options.as)}_id`)
      : (throughAssocDef.options.foreignKey ?? `${_toUnderscore(modelClass.name)}_id`);

    const throughJoinOn = `"${throughTable}"."${throughFk}" = "${sourceTable}"."${sourcePk}"`;
    let throughJoinSql = `LEFT OUTER JOIN "${throughTable}" ON ${throughJoinOn}`;

    if (throughAssocDef.options.as) {
      const typeCol = `${_toUnderscore(throughAssocDef.options.as)}_type`;
      throughJoinSql = `LEFT OUTER JOIN "${throughTable}" ON ${throughJoinOn} AND "${throughTable}"."${typeCol}" = '${modelClass.name}'`;
    }

    const sourceName = assocDef.options.source ?? _singularize(assocDef.name);
    const throughAssocs: any[] = (throughModel as any)._associations ?? [];
    const sourceAssocDef = throughAssocs.find((a: any) => a.name === sourceName);

    let targetModel: typeof Base | undefined;
    let targetTable: string;
    let targetJoinOn: string;

    if (sourceAssocDef?.type === "belongsTo") {
      const targetFk = sourceAssocDef.options.foreignKey ?? `${_toUnderscore(sourceName)}_id`;
      const className = sourceAssocDef.options.className ?? _camelize(sourceName);
      targetModel = modelRegistry.get(className) as typeof Base | undefined;
      if (!targetModel) return null;
      targetTable = (targetModel as any).tableName;
      const targetPk = sourceAssocDef.options.primaryKey ?? (targetModel as any).primaryKey ?? "id";
      targetJoinOn = `"${targetTable}"."${targetPk}" = "${throughTable}"."${targetFk}"`;
    } else {
      const className = sourceAssocDef?.options?.className ?? _camelize(_singularize(sourceName));
      targetModel = modelRegistry.get(className) as typeof Base | undefined;
      if (!targetModel) return null;
      targetTable = (targetModel as any).tableName;
      const targetFk =
        sourceAssocDef?.options?.foreignKey ?? `${_toUnderscore(throughClassName)}_id`;
      const throughPk = (throughModel as any).primaryKey ?? "id";
      targetJoinOn = `"${targetTable}"."${targetFk}" = "${throughTable}"."${throughPk}"`;
    }

    const targetTableIndex = this._nextTableIndex++;
    const targetColumns = getModelColumns(targetModel);

    for (let i = 0; i < targetColumns.length; i++) {
      this._aliases.push({
        alias: `t${targetTableIndex}_r${i}`,
        tableIndex: targetTableIndex,
        columnIndex: i,
        column: targetColumns[i],
      });
    }

    const node: JoinNode = {
      tableIndex: targetTableIndex,
      tableName: targetTable,
      modelClass: targetModel,
      columns: targetColumns,
      assocName: assocDef.name,
      assocType: assocDef.type,
      joinSql: `${throughJoinSql} LEFT OUTER JOIN "${targetTable}" ON ${targetJoinOn}`,
      children: [],
    };

    this._nodes.push(node);
    return node;
  }
}
