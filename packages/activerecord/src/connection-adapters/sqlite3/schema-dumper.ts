import type { IO, StringIO } from "@blazetrails/ruby-compat";
import type { Column } from "./column.js";
import type { SQLite3Adapter } from "../sqlite3-adapter.js";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";

export class SchemaDumper extends AbstractSchemaDumper {
  declare protected connection: SQLite3Adapter;

  /** @internal */
  protected override async virtualTables(
    stream: IO | StringIO,
  ): Promise<Array<[string, [string, string]]> | undefined> {
    const virtualTables: Array<[string, [string, string]]> = await this.connection.virtualTables();
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
  protected override isDefaultPrimaryKey(column: Column): boolean {
    return this.schemaType(column) === ":integer";
  }

  /** @internal */
  protected override isExplicitPrimaryKeyDefault(column: Column): boolean {
    return this.isBigint(column);
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
}
