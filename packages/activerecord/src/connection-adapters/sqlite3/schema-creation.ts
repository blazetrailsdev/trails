import { rtest } from "@blazetrails/ruby-compat";
import { SchemaCreation as AbstractSchemaCreation } from "../abstract/schema-creation.js";
import type { ForeignKeyDefinition } from "../abstract/schema-definitions.js";
import type { ColumnOptions } from "../abstract/schema-definitions.js";

export class SchemaCreation extends AbstractSchemaCreation {
  /** @internal */
  protected override visitForeignKeyDefinition(o: ForeignKeyDefinition): string {
    let sql = super.visitForeignKeyDefinition(o);
    if (o.deferrable) {
      sql += ` DEFERRABLE INITIALLY ${o.deferrable.toUpperCase()}`;
    }
    return sql;
  }

  /** @internal */
  protected override supportsIndexUsing(): boolean {
    return false;
  }

  /** @internal */
  protected override addColumnOptionsBang(
    sql: string,
    options: ColumnOptions & Record<string, unknown>,
  ): Promise<string> {
    if (rtest(options["collation"])) {
      sql += ` COLLATE "${options["collation"]}"`;
    }

    const as = options["as"];
    if (rtest(as)) {
      sql += ` GENERATED ALWAYS AS (${as})`;

      if (rtest(options["stored"])) {
        sql += " STORED";
      } else {
        sql += " VIRTUAL";
      }
    }
    return super.addColumnOptionsBang(sql, options);
  }
}
