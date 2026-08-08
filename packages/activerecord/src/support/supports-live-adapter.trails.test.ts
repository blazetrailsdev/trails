import { describe, expect, it } from "vitest";
import { Base } from "../base.js";
import type { Version } from "../connection-adapters/abstract-adapter.js";
import { fixtures } from "../test-fixtures.js";
import { currentAdapter } from "./adapter-helper.js";
import { adapterSupports, SUPPORTS_FEATURES } from "./supports.js";

const MYSQL_FAMILY = ["Mysql2Adapter", "TrilogyAdapter"] as const;

type LiveConnection = {
  isMariadb?(): Promise<boolean>;
  databaseVersion: Version | number | Promise<Version | number>;
  getDatabaseVersion(): Promise<Version | number>;
} & Record<string, unknown>;

async function mysqlAtLeast(connection: LiveConnection, version: string): Promise<boolean> {
  return ((await connection.databaseVersion) as Version).compare(version) >= 0;
}

async function adapterHelperSupport(
  feature: string,
  connection: LiveConnection,
): Promise<boolean | undefined> {
  const mysql = currentAdapter(...MYSQL_FAMILY);
  const mariadb = mysql && (await connection.isMariadb?.()) === true;
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

function methodName(feature: string): string {
  return `supports${feature.replace(/(^|_)([a-z])/g, (_m, _s, c: string) => c.toUpperCase())}`;
}

describe("supports table vs. the live adapter", () => {
  fixtures({});

  it("answers each feature key exactly as the connection does", async () => {
    const connection = (await Base.leaseConnection()) as unknown as LiveConnection;
    const drift: string[] = [];

    for (const feature of SUPPORTS_FEATURES) {
      const helperAnswer = await adapterHelperSupport(feature, connection);
      let live: boolean;
      if (helperAnswer !== undefined) {
        live = helperAnswer;
      } else {
        const method = connection[methodName(feature)];
        live =
          typeof method === "function" &&
          (await (method as () => boolean | Promise<boolean>).call(connection)) === true;
      }
      const table = adapterSupports(feature);
      if (table !== live) drift.push(`${feature}: table=${table} adapter=${live}`);
    }

    expect(drift).toEqual([]);
  });
});
