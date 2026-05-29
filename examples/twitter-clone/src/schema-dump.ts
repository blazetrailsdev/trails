import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Base, dumpSchemaColumns } from "@blazetrails/activerecord";

const SCHEMA_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "db",
  "schema-columns.json",
);

/**
 * Write `db/schema-columns.json` from the live DB — the file `trails-tsc`
 * reads to type model attributes. The analog of Rails dumping `schema.rb`
 * after migrating; `db:migrate` calls this automatically.
 */
export async function dumpSchema(): Promise<void> {
  const schema = await dumpSchemaColumns(Base.connection);
  writeFileSync(SCHEMA_PATH, JSON.stringify(schema, null, 2) + "\n");
  console.log(`Dumped schema → ${SCHEMA_PATH} (${Object.keys(schema).join(", ")})`);
}
