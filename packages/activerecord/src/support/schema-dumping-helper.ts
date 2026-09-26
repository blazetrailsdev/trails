import { SchemaDumper as BaseSchemaDumper } from "../schema-dumper.js";
import type { SchemaSource } from "../schema-dumper.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { SchemaDumper } from "../connection-adapters/abstract/schema-dumper.js";
import { Base } from "../base.js";
import { capture } from "@blazetrails/activesupport";

export const FULL_DUMP_TIMEOUT_MS = 30_000;

export async function dumpTableSchema(
  pool: SchemaSource | DatabaseAdapter,
  ...tables: string[]
): Promise<string> {
  const oldIgnoreTables = BaseSchemaDumper.ignoreTables;
  const enumerated = pool as { dataSources?: () => Promise<string[]> };
  const dataSources = enumerated.dataSources
    ? await enumerated.dataSources()
    : await (pool as SchemaSource).tables();
  BaseSchemaDumper.ignoreTables = dataSources.filter((name) => !tables.includes(name));
  try {
    const output = await capture("stdout", async () => {
      await SchemaDumper.dump(pool);
    });
    return output;
  } finally {
    BaseSchemaDumper.ignoreTables = oldIgnoreTables;
  }
}

export async function dumpAllTableSchema(
  ignoreTables: (string | RegExp)[] = [],
  pool: Parameters<typeof SchemaDumper.dump>[0] = Base.connectionPool(),
): Promise<string> {
  const oldIgnoreTables = BaseSchemaDumper.ignoreTables;
  BaseSchemaDumper.ignoreTables = ignoreTables;
  try {
    const output = await capture("stdout", async () => {
      await SchemaDumper.dump(pool);
    });
    return output;
  } finally {
    BaseSchemaDumper.ignoreTables = oldIgnoreTables;
  }
}
