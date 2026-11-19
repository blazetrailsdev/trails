import { Base } from "@blazetrails/activerecord";
import "@blazetrails/activerecord/connection-adapters/postgresql-adapter.js";
import { readFile } from "node:fs/promises";

await Base.establishConnection({ adapter: "postgresql", url: process.argv[2] });
const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
await Base.connectionPool().withConnection((conn) => conn.execute(sql));
await Base.connectionHandler.clearAllConnectionsBang();
