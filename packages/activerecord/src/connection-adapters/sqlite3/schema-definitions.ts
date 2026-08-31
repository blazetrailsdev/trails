import {
  TableDefinition as AbstractTableDefinition,
  ColumnDefinition,
} from "../abstract/schema-definitions.js";
import type { ColumnOptions, ColumnType } from "../abstract/schema-definitions.js";

export class TableDefinition extends AbstractTableDefinition {
  changeColumn(columnName: string, type: ColumnType, options: ColumnOptions = {}): this {
    const name = String(columnName);
    this.columnsHash.set(name, null);
    return this.column(name, type, options);
  }

  override references(...args: unknown[]): this {
    const rest = [...args];
    const last = rest[rest.length - 1];
    const options = (typeof last === "object" && last !== null ? rest.pop() : {}) as Record<
      string,
      unknown
    >;
    return (super.references as (...a: unknown[]) => this)(...rest, {
      type: "integer",
      ...options,
    });
  }

  override belongsTo(...args: unknown[]): this {
    return (this.references as (...a: unknown[]) => this)(...args);
  }

  override newColumnDefinition(
    name: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): ColumnDefinition {
    if (type === ("virtual" as ColumnType)) {
      type = options.type as ColumnType;
    }
    return super.newColumnDefinition(name, type, options);
  }

  /** @internal */
  protected override integerLikePrimaryKeyType(
    _type: ColumnType,
    _options: ColumnOptions,
  ): ColumnType {
    return "primary_key";
  }

  /** @internal */
  protected override validColumnDefinitionOptions(): string[] {
    return [...super.validColumnDefinitionOptions(), "as", "type", "stored"];
  }
}
