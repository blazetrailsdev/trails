import { SchemaDumper as BaseSchemaDumper } from "../../lib/schema-dumper.js";
import { SchemaDumper } from "../../lib/connection-adapters/abstract/schema-dumper.js";
import type { ConnectionPool } from "../../lib/connection-adapters/abstract/connection-pool.js";
import { Base } from "../../lib/base.js";
import { capture } from "@blazetrails/activesupport/testing/stream";

export const FULL_DUMP_TIMEOUT_MS = 30_000;

export async function dumpTableSchema(...tables: string[]): Promise<string> {
  const pool = Base.connectionPool();
  const oldIgnoreTables = BaseSchemaDumper.ignoreTables;
  await pool.withConnection(async (connection) => {
    BaseSchemaDumper.ignoreTables = (await connection.dataSources()).filter(
      (name) => !tables.includes(name),
    );
  });
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
  { pool = Base.connectionPool() }: { pool?: ConnectionPool } = {},
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
