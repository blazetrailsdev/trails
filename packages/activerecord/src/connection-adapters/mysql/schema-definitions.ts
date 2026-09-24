import {
  TableDefinition as AbstractTableDefinition,
  ColumnDefinition,
  Table as AbstractTable,
} from "../abstract/schema-definitions.js";
import type {
  ColumnOptions,
  ColumnType,
  IdHashOptions,
  PrimaryKeyType,
} from "../abstract/schema-definitions.js";
import type { SchemaStatementsLike } from "../abstract/schema-statements-like.js";
import { type VisitorHostAdapter } from "./schema-creation.js";
import { deprecator } from "../../deprecator.js";
import { deprecate } from "@blazetrails/activesupport";

export interface ColumnMethods {
  blob(...names: string[]): unknown;
  blob(...args: [...names: string[], options: ColumnOptions]): unknown;
  tinyblob(...names: string[]): unknown;
  tinyblob(...args: [...names: string[], options: ColumnOptions]): unknown;
  mediumblob(...names: string[]): unknown;
  mediumblob(...args: [...names: string[], options: ColumnOptions]): unknown;
  longblob(...names: string[]): unknown;
  longblob(...args: [...names: string[], options: ColumnOptions]): unknown;
  tinytext(...names: string[]): unknown;
  tinytext(...args: [...names: string[], options: ColumnOptions]): unknown;
  mediumtext(...names: string[]): unknown;
  mediumtext(...args: [...names: string[], options: ColumnOptions]): unknown;
  longtext(...names: string[]): unknown;
  longtext(...args: [...names: string[], options: ColumnOptions]): unknown;
  unsignedInteger(...names: string[]): unknown;
  unsignedInteger(...args: [...names: string[], options: ColumnOptions]): unknown;
  unsignedBigint(...names: string[]): unknown;
  unsignedBigint(...args: [...names: string[], options: ColumnOptions]): unknown;
  /** @deprecated */
  unsignedFloat(...names: string[]): unknown;
  /** @deprecated */
  unsignedFloat(...args: [...names: string[], options: ColumnOptions]): unknown;
  /** @deprecated */
  unsignedDecimal(...names: string[]): unknown;
  /** @deprecated */
  unsignedDecimal(...args: [...names: string[], options: ColumnOptions]): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below.
export class TableDefinition extends AbstractTableDefinition {
  readonly charset?: string;
  readonly collation?: string;

  constructor(
    conn: VisitorHostAdapter,
    name: string,
    options: {
      id?: boolean | PrimaryKeyType | IdHashOptions;
      charset?: string | null;
      collation?: string | null;
      primaryKey?: string | string[] | false;
      temporary?: boolean;
      ifNotExists?: boolean;
      as?: string;
      options?: string;
      comment?: string;
    } = {},
  ) {
    const { charset, collation, ...rest } = options;
    super(conn, name, rest);
    this.charset = charset ?? undefined;
    this.collation = collation ?? undefined;
  }

  override newColumnDefinition(
    name: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): ColumnDefinition {
    let resolvedType = type as string;
    if (resolvedType === "primary_key") {
      resolvedType = "integer";
      (options as any).limit = (options as any).limit ?? 8;
      (options as any).primaryKey = true;
    } else if (resolvedType === "virtual") {
      resolvedType = options.type as string;
    } else {
      const unsignedMatch = /^unsigned_(.+)$/.exec(resolvedType);
      if (unsignedMatch) {
        resolvedType = unsignedMatch[1];
        (options as any).unsigned = true;
      }
    }
    return super.newColumnDefinition(name, resolvedType as ColumnType, options);
  }

  /** @internal */
  override aliasedTypes(_name: string, fallback: string): string {
    return fallback;
  }

  /** @internal */
  protected override validColumnDefinitionOptions(): string[] {
    return super
      .validColumnDefinitionOptions()
      .concat([
        "autoIncrement",
        "charset",
        "as",
        "size",
        "unsigned",
        "first",
        "after",
        "type",
        "stored",
      ]);
  }

  /** @internal */
  protected override integerLikePrimaryKeyType(
    type: ColumnType,
    options: ColumnOptions,
  ): ColumnType {
    if (options.autoIncrement !== false) {
      options.autoIncrement = true;
    }
    return type;
  }
}

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ColumnMethods` (`mysql/schema_definitions.rb:56`); the class/interface merge is how a mixin surfaces on the type side. */
export interface TableDefinition extends ColumnMethods {}

TableDefinition.defineColumnMethods(
  "blob",
  "tinyblob",
  "mediumblob",
  "longblob",
  "tinytext",
  "mediumtext",
  "longtext",
  "unsigned_integer",
  "unsigned_bigint",
  "unsigned_float",
  "unsigned_decimal",
);

deprecate.call(TableDefinition, "unsignedFloat", "unsignedDecimal", { deprecator: deprecator() });

export class Table extends AbstractTable {
  constructor(tableName: string, schema: SchemaStatementsLike) {
    super(tableName, schema);
  }

  async blob(...args: unknown[]): Promise<void> {
    await this.definedColumn("blob" as ColumnType, args);
  }

  async tinyblob(...args: unknown[]): Promise<void> {
    await this.definedColumn("tinyblob" as ColumnType, args);
  }

  async mediumblob(...args: unknown[]): Promise<void> {
    await this.definedColumn("mediumblob" as ColumnType, args);
  }

  async longblob(...args: unknown[]): Promise<void> {
    await this.definedColumn("longblob" as ColumnType, args);
  }

  async tinytext(...args: unknown[]): Promise<void> {
    await this.definedColumn("tinytext" as ColumnType, args);
  }

  async mediumtext(...args: unknown[]): Promise<void> {
    await this.definedColumn("mediumtext" as ColumnType, args);
  }

  async longtext(...args: unknown[]): Promise<void> {
    await this.definedColumn("longtext" as ColumnType, args);
  }

  async unsignedInteger(...args: unknown[]): Promise<void> {
    await this.definedColumn("unsigned_integer" as ColumnType, args);
  }

  async unsignedBigint(...args: unknown[]): Promise<void> {
    await this.definedColumn("unsigned_bigint" as ColumnType, args);
  }

  /** @deprecated */
  async unsignedFloat(...args: unknown[]): Promise<void> {
    await this.definedColumn("unsigned_float" as ColumnType, args);
  }

  /** @deprecated */
  async unsignedDecimal(...args: unknown[]): Promise<void> {
    await this.definedColumn("unsigned_decimal" as ColumnType, args);
  }
}

deprecate.call(Table, "unsignedFloat", "unsignedDecimal", { deprecator: deprecator() });
