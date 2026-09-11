import type { Base } from "../base.js";
import { allTimestampAttributesInModel } from "../timestamp.js";

export class ModelMetadata {
  private _modelClass: typeof Base | null;
  private _primaryKeyName?: string | string[] | null;
  private _primaryKeyType?: string | null;
  private _columnType?: Map<string | string[], string | null>;
  private _columnNames?: Set<string>;
  private _inheritanceColumnName?: string | null;

  constructor(modelClass: typeof Base | null) {
    this._modelClass = modelClass;
  }

  get primaryKeyName(): string | string[] | null {
    return (this._primaryKeyName ??= this._modelClass && this._modelClass.primaryKey);
  }

  get primaryKeyType(): string | null {
    return (this._primaryKeyType ??=
      this._modelClass && this.columnType(this._modelClass.primaryKey));
  }

  columnType(columnName: string | string[]): string | null {
    this._columnType ??= new Map();
    if (this._columnType.has(columnName)) return this._columnType.get(columnName)!;

    const type = this._modelClass && this._modelClass.typeForAttribute(String(columnName))?.type();
    const columnType = type == null ? null : `:${type}`;
    this._columnType.set(columnName, columnType);
    return columnType;
  }

  hasColumn(columnName: string | string[] | null): boolean {
    return this.columnNames.has(columnName as string);
  }

  get columnNames(): Set<string> {
    return (this._columnNames ??= this._modelClass
      ? new Set(this._modelClass.columns().map((c: { name: string }) => c.name))
      : new Set());
  }

  get timestampColumnNames(): string[] {
    return allTimestampAttributesInModel.call(this._modelClass as never);
  }

  get inheritanceColumnName(): string | null {
    return (this._inheritanceColumnName ??= this._modelClass && this._modelClass.inheritanceColumn);
  }
}
