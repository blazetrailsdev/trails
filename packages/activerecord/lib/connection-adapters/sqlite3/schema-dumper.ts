import "../../constants.sqlite3-schema-dumper.generated.js";
import { toS } from "@blazetrails/ruby-compat/object";
import type { IO } from "@blazetrails/ruby-compat/io";
import type { StringIO } from "@blazetrails/ruby-compat/string-io";
import type { Column } from "./column.js";
import type { SQLite3Adapter } from "../sqlite3-adapter.js";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";

export class SchemaDumper extends AbstractSchemaDumper {
  declare protected connection: SQLite3Adapter;

  /** @internal */
  protected override async virtualTables(
    stream: IO | StringIO,
  ): Promise<Array<[string, [string, string]]> | undefined> {
    const virtualTables: Array<[string, [string, string]]> = (
      await this.connection.virtualTables()
    ).filter(([name]) => !this.isIgnored(name));
    if (virtualTables.length > 0) {
      stream.puts("");
      stream.puts("  // Virtual tables defined in this database.");
      stream.puts(
        "  // Note that virtual tables may not work with other database engines. Be careful if changing database.",
      );
      const sorted = [...virtualTables].sort();
      for (const [tableName, options] of sorted) {
        const [moduleName, argumentsStr] = options;
        stream.puts(
          `  await ctx.createVirtualTable(${JSON.stringify(tableName)}, ${JSON.stringify(moduleName)}, ${JSON.stringify(argumentsStr.split(", "))});`,
        );
      }
      return sorted;
    }
    return undefined;
  }

  /** @internal */
  protected override async isDefaultPrimaryKey(column: Column): Promise<boolean> {
    return this.schemaType(column) === ":integer" && (await this.isPrimaryKeyHasAutoincrement());
  }

  /** @internal */
  protected override async isExplicitPrimaryKeyDefault(column: Column): Promise<boolean> {
    return (
      this.isBigint(column) ||
      (column.type === "integer" && !(await this.isPrimaryKeyHasAutoincrement()))
    );
  }

  /** @internal */
  protected async isPrimaryKeyHasAutoincrement(): Promise<boolean> {
    if (this.tableName == null) return false;

    const tableSql = await this.connection.queryValue(
      `SELECT sql FROM sqlite_master WHERE name = ${this.connection.quote(this.tableName)} AND type = 'table'
UNION ALL
SELECT sql FROM sqlite_temp_master WHERE name = ${this.connection.quote(this.tableName)} AND type = 'table'
`,
      "SCHEMA",
    );

    return /\bAUTOINCREMENT\b/i.test(toS(tableSql));
  }

  /** @internal */
  protected override async prepareColumnOptions(column: Column): Promise<Record<string, unknown>> {
    const spec = await super.prepareColumnOptions(column);
    if (column.isVirtual()) {
      spec["as"] = this.extractExpressionForVirtualColumn(column);
      spec["stored"] = column.isVirtualStored();
      return { type: JSON.stringify(this.schemaType(column).replace(/^:/, "")), ...spec };
    }
    return spec;
  }

  /** @internal */
  protected extractExpressionForVirtualColumn(column: Column): string {
    return JSON.stringify(column.defaultFunction ?? null);
  }

  protected override adapterType(): [name: string, path: string] {
    return ["SQLite3Adapter", "sqlite3-adapter"];
  }
}
