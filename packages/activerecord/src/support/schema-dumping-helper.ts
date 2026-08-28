import { SchemaDumper as BaseSchemaDumper } from "../schema-dumper.js";
import type { SchemaSource } from "../schema-dumper.js";
import { SchemaDumper } from "../connection-adapters/abstract/schema-dumper.js";
import { Base } from "../base.js";

export const FULL_DUMP_TIMEOUT_MS = 30_000;

export async function dumpTableSchema(pool: SchemaSource, ...tables: string[]): Promise<string> {
  const oldIgnoreTables = BaseSchemaDumper.ignoreTables;
  const enumerated = pool as { dataSources?: () => Promise<string[]> };
  const dataSources = enumerated.dataSources ? await enumerated.dataSources() : await pool.tables();
  BaseSchemaDumper.ignoreTables = dataSources.filter((name) => !tables.includes(name));
  try {
    return (await SchemaDumper.dump(pool)).join("\n");
  } finally {
    BaseSchemaDumper.ignoreTables = oldIgnoreTables;
  }
}

export async function dumpAllTableSchema(
  ignoreTables: (string | RegExp)[] = [],
  pool: SchemaSource = Base.connection as unknown as SchemaSource,
): Promise<string> {
  const oldIgnoreTables = BaseSchemaDumper.ignoreTables;
  BaseSchemaDumper.ignoreTables = ignoreTables;
  try {
    return (await SchemaDumper.dump(pool)).join("\n");
  } finally {
    BaseSchemaDumper.ignoreTables = oldIgnoreTables;
  }
}
