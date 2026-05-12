import { ArgumentError } from "@blazetrails/activemodel";
import { SchemaStatements } from "../abstract/schema-statements.js";

export class PostgreSQLSchemaStatements extends SchemaStatements {
  override async dropTable(...args: Parameters<SchemaStatements["dropTable"]>): Promise<void> {
    const [tableNames, options] = this._splitTableNamesAndOptions(args);
    if (tableNames.length === 0) {
      throw new ArgumentError("dropTable requires at least one table name");
    }
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    const cascade = options.force === "cascade" ? " CASCADE" : "";
    for (const name of tableNames) {
      this.adapter.schemaCache?.clearDataSourceCacheBang(this.adapter.pool, name);
    }
    const quoted = tableNames.map((n) => this._qt(n)).join(", ");
    await this.adapter.executeMutation(`DROP TABLE${ifExists} ${quoted}${cascade}`);
  }
}
