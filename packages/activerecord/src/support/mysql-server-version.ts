import mysql from "mysql2/promise";
import { Version } from "../connection-adapters/abstract-adapter.js";
import { mysqlUrl } from "./config.js";

export const MYSQL_TEST_URL = mysqlUrl();

let mariaDb = false;
let mysqlVersionStr = "";

async function checkMysql(): Promise<{ isMariaDb: boolean; version: string }> {
  let conn: Awaited<ReturnType<typeof mysql.createConnection>> | undefined;
  try {
    conn = await mysql.createConnection({ uri: MYSQL_TEST_URL });
    const [rows] = await conn.query("SELECT VERSION() AS v");
    const ver = (rows as Array<{ v: string }>)[0]?.v ?? "";
    return { isMariaDb: /mariadb/i.test(ver), version: ver };
  } catch {
    return { isMariaDb: false, version: "" };
  } finally {
    await conn?.end().catch(() => {});
  }
}

({ isMariaDb: mariaDb, version: mysqlVersionStr } = await checkMysql());

export const isMariaDb = mariaDb;
export const mysqlVersion = mysqlVersionStr;

function parseMysqlVersion(full: string): Version | null {
  const m = full.match(/^(?:5\.5\.5-)?(\d+\.\d+\.\d+)/);
  return m ? new Version(m[1], full) : null;
}
const _serverVersion = parseMysqlVersion(mysqlVersionStr);

export const serverVersion = _serverVersion;

export const supportsOptimizerHints = !mariaDb && (_serverVersion?.compare("5.7.7") ?? -1) >= 0;

export const supportsDefaultExpression = mariaDb
  ? (_serverVersion?.compare("10.2.1") ?? -1) >= 0
  : (_serverVersion?.compare("8.0.13") ?? -1) >= 0;

export const supportsExpressionIndex = !mariaDb && (_serverVersion?.compare("8.0.13") ?? -1) >= 0;

export const supportsRenameIndex = mariaDb
  ? (_serverVersion?.compare("10.5.2") ?? -1) >= 0
  : (_serverVersion?.compare("5.7.6") ?? -1) >= 0;

export const supportsJson = !mariaDb && (_serverVersion?.compare("5.7.8") ?? -1) >= 0;

export const supportsInsertReturning = mariaDb && (_serverVersion?.compare("10.5.0") ?? -1) >= 0;

export const supportsTextColumnWithDefault =
  mariaDb && (_serverVersion?.compare("10.2.1") ?? -1) >= 0;

export const supportsNonUniqueConstraintName = mariaDb;

export const supportsSqlStandardDropConstraint = mariaDb
  ? (_serverVersion?.compare("10.3.13") ?? -1) >= 0
  : (_serverVersion?.compare("8.0.19") ?? -1) >= 0;

export const supportsCheckConstraints = mariaDb
  ? (_serverVersion?.compare("10.3.10") ?? -1) >= 0 ||
    ((_serverVersion?.compare("10.3") ?? 0) < 0 && (_serverVersion?.compare("10.2.22") ?? -1) >= 0)
  : (_serverVersion?.compare("8.0.16") ?? -1) >= 0;
