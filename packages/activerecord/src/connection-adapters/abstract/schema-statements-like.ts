import type {
  AddIndexOptions,
  AddReferenceOptions,
  ColumnOptions,
  ColumnType,
} from "./schema-definitions.js";

/** @noRailsEquivalent PERMANENT */
export interface SchemaStatementsLike {
  addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions,
  ): Promise<void>;
  removeColumn(
    tableName: string,
    columnName: string,
    type?: string,
    options?: { ifExists?: boolean },
  ): Promise<void>;
  removeColumns(
    tableName: string,
    ...columnsOrOptions: Array<string | ColumnOptions>
  ): Promise<void>;
  renameColumn(tableName: string, oldName: string, newName: string): Promise<void>;
  addIndex(tableName: string, columns: string | string[], options?: AddIndexOptions): Promise<void>;
  removeIndex(
    tableName: string,
    columnOrOptions?:
      | string
      | string[]
      | { column?: string | string[]; name?: string; ifExists?: boolean },
    options?: { column?: string | string[]; name?: string; ifExists?: boolean },
  ): Promise<void>;
  addReference(tableName: string, refName: string, options?: AddReferenceOptions): Promise<void>;
  removeReference(tableName: string, refName: string, options?: AddReferenceOptions): Promise<void>;
  addTimestamps(tableName: string, options?: ColumnOptions): Promise<void>;
  removeTimestamps(tableName: string, options?: ColumnOptions): Promise<void>;
  columnExists(
    tableName: string,
    columnName: string,
    type?: ColumnType,
    options?: Record<string, unknown>,
  ): Promise<boolean>;
  indexExists(
    tableName: string,
    columnName: string | string[],
    options?: Record<string, unknown>,
  ): Promise<boolean>;
  renameIndex(tableName: string, oldName: string, newName: string): Promise<void>;
  changeColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions,
  ): Promise<void>;
  changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void>;
  changeColumnNull(
    tableName: string,
    columnName: string,
    isNull: boolean,
    defaultValue?: unknown,
  ): Promise<void>;
  addForeignKey(
    tableName: string,
    toTable: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  removeForeignKey(
    tableName: string,
    toTableOrOptions?: string | Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<void>;
  foreignKeyExists(
    tableName: string,
    toTableOrOptions?: string | Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<boolean>;
  addCheckConstraint(
    tableName: string,
    expression: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  removeCheckConstraint(
    tableName: string,
    expressionOrOptions?: string | Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<void>;
  checkConstraintExists(tableName: string, options?: Record<string, unknown>): Promise<boolean>;
  primaryKey?(tableName: string): Promise<string | string[] | null>;
}
