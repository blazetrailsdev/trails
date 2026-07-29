import { describe, expect, it } from "vitest";
import { Base } from "../base.js";
import type { Version } from "../connection-adapters/abstract-adapter.js";
import { fixtures } from "../test-fixtures.js";
import { currentAdapter } from "./adapter-helper.js";
import { adapterSupports, SUPPORTS_FEATURES } from "./supports.js";

const MYSQL_FAMILY = ["Mysql2Adapter", "TrilogyAdapter"] as const;

type LiveConnection = {
  isMariadb?(): boolean;
  databaseVersion: Version | number;
  getDatabaseVersion(): Promise<Version | number>;
} & Record<string, unknown>;

function mysqlAtLeast(connection: LiveConnection, version: string): boolean {
  return (connection.databaseVersion as Version).gte(version);
}

function adapterHelperSupport(feature: string, connection: LiveConnection): boolean | undefined {
  const mysql = currentAdapter(...MYSQL_FAMILY);
  const mariadb = mysql && connection.isMariadb?.() === true;
  switch (feature) {
    case "default_expression":
      if (currentAdapter("PostgreSQLAdapter")) return true;
      if (!mysql) return false;
      return mariadb ? mysqlAtLeast(connection, "10.2.1") : mysqlAtLeast(connection, "8.0.13");
    case "non_unique_constraint_name":
      return mysql ? mariadb : false;
    case "text_column_with_default":
      if (!mysql) return true;
      return mariadb && mysqlAtLeast(connection, "10.2.1");
    case "sql_standard_drop_constraint":
      if (currentAdapter("SQLite3Adapter")) return false;
      if (!mysql) return true;
      return mariadb ? mysqlAtLeast(connection, "10.3.13") : mysqlAtLeast(connection, "8.0.19");
    default:
      return undefined;
  }
}

const KNOWN_DIVERGENCES: Readonly<Record<string, string>> = {
  insert_returning:
    "story mariadb-insert-returning-rows-dropped — the adapter answers Rails' " +
    '`mariadb? && database_version >= "10.5.0"` correctly, but the MariaDB write ' +
    "path yields no RETURNING rows, so the table holds the gate closed until the " +
    "write path lands",
};

function methodName(feature: string): string {
  return `supports${feature.replace(/(^|_)([a-z])/g, (_m, _s, c: string) => c.toUpperCase())}`;
}

describe("supports table vs. the live adapter", () => {
  fixtures({});

  it("answers each feature key exactly as the connection does", async () => {
    const connection = (await Base.leaseConnection()) as unknown as LiveConnection;
    await connection.getDatabaseVersion();

    const drift: string[] = [];

    for (const feature of SUPPORTS_FEATURES) {
      const helperAnswer = adapterHelperSupport(feature, connection);
      let live: boolean;
      if (helperAnswer !== undefined) {
        live = helperAnswer;
      } else {
        const method = connection[methodName(feature)];
        live = typeof method === "function" && (method as () => boolean).call(connection) === true;
      }
      const table = adapterSupports(feature);
      if (table === live) continue;
      const known = KNOWN_DIVERGENCES[feature];
      if (known) {
        expect(table, `${feature} is held closed: ${known}`).toBe(false);
        continue;
      }
      drift.push(`${feature}: table=${table} adapter=${live}`);
    }

    expect(drift).toEqual([]);
  });
});
