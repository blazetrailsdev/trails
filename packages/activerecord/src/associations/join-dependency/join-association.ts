/**
 * JoinAssociation — a node in the join dependency tree representing
 * a joined association.
 *
 * Tracks the association reflection, table alias, and generates the
 * JOIN constraints for the SQL query.
 *
 * Mirrors: ActiveRecord::Associations::JoinDependency::JoinAssociation
 */

import type { Base } from "../../base.js";
import { quoteIdentifier } from "../../connection-adapters/abstract/quoting.js";
import { JoinPart } from "./join-part.js";

export interface JoinReflection {
  name: string;
  type: "belongsTo" | "hasOne" | "hasMany";
  foreignKey: string;
  primaryKey?: string;
  modelClass: typeof Base;
  options?: Record<string, unknown>;
}

function qualifiedColumn(table: string, column: string): string {
  return `${quoteIdentifier(table)}.${quoteIdentifier(column)}`;
}

export class JoinAssociation extends JoinPart {
  readonly reflection: JoinReflection;
  private _table: string;
  readonly tables: string[] = [];
  private _readonly = false;
  private _strictLoading = false;

  constructor(reflection: JoinReflection, baseKlass: typeof Base, table: string) {
    super(baseKlass);
    this.reflection = reflection;
    this._table = table;
    this.tables.push(table);
  }

  get table(): string {
    return this._table;
  }

  set table(value: string) {
    this._table = value;
    if (!this.tables.includes(value)) {
      this.tables.push(value);
    }
  }

  isMatch(otherKlass: typeof Base): boolean {
    return this.reflection.modelClass === otherKlass;
  }

  joinConstraints(parentTable: string, parentKlass: typeof Base): string {
    const fk = this.reflection.foreignKey;

    if (this.reflection.type === "belongsTo") {
      // For belongsTo, the foreign key is on the parent table and the
      // primary key is on the associated (joined) table
      const associatedPk =
        this.reflection.primaryKey ?? (this.reflection.modelClass.primaryKey as string) ?? "id";
      return `${qualifiedColumn(this._table, associatedPk)} = ${qualifiedColumn(parentTable, fk)}`;
    }
    // For hasOne/hasMany, the foreign key is on the joined table and
    // the primary key is on the parent table
    const parentPk = this.reflection.primaryKey ?? (parentKlass.primaryKey as string) ?? "id";
    return `${qualifiedColumn(this._table, fk)} = ${qualifiedColumn(parentTable, parentPk)}`;
  }

  isReadonly(): boolean {
    return this._readonly;
  }

  isStrictLoading(): boolean {
    return this._strictLoading;
  }
}
