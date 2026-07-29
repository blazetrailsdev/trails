import { describe, expect, it } from "vitest";
import { Base } from "../base.js";
import type { Version } from "../connection-adapters/abstract-adapter.js";
import { fixtures } from "../test-fixtures.js";
import { currentAdapter } from "./adapter-helper.js";
import { adapterSupports, SUPPORTS_FEATURES } from "./supports.js";

/**
 * Reconciles `support/supports.ts`'s static table against the live connection.
 *
 * Rails never transcribes these answers — `adapter_helper.rb:66-83` defines its
 * `supports_*?` set by `public_send`ing straight to
 * `ActiveRecord::Base.lease_connection`. trails cannot: `describeIfSupports` /
 * `itIfSupports` resolve at test-collection time, before `Base` has a
 * connection, so the table stays static and this suite is the drift alarm the
 * delegation would otherwise provide. It generalizes the `expression_index`
 * live-server probe: every key is checked, not just the one that already bit us.
 */

const MYSQL_FAMILY = ["Mysql2Adapter", "TrilogyAdapter"] as const;

type LiveConnection = {
  isMariadb?(): boolean;
  databaseVersion: Version | number;
  getDatabaseVersion(): Promise<Version | number>;
} & Record<string, unknown>;

function mysqlAtLeast(connection: LiveConnection, version: string): boolean {
  return (connection.databaseVersion as Version).gte(version);
}

/**
 * The four `adapter_helper.rb` predicates that are the helper module's own
 * branching rather than a connection method, computed off the live connection
 * exactly as Ruby does (adapter_helper.rb:23/33/42/51). Everything else in the
 * table names a real `supports_<key>?` on the adapter and is read directly.
 */
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

function methodName(feature: string): string {
  return `supports${feature.replace(/(^|_)([a-z])/g, (_m, _s, c: string) => c.toUpperCase())}`;
}

describe("supports table vs. the live adapter", () => {
  fixtures({});

  it("answers each feature key exactly as the connection does", async () => {
    const connection = (await Base.leaseConnection()) as unknown as LiveConnection;
    // The MySQL adapter's mariadb flag and database version are both cold on a
    // fresh lease; every version-keyed predicate reads false until this awaits.
    await connection.getDatabaseVersion();

    const drift: string[] = [];

    for (const feature of SUPPORTS_FEATURES) {
      const helperAnswer = adapterHelperSupport(feature, connection);
      let live: boolean;
      if (helperAnswer !== undefined) {
        live = helperAnswer;
      } else {
        const method = connection[methodName(feature)];
        // A predicate Rails defines on one adapter only (`supports_pgcrypto_uuid?`
        // et al. live on PostgreSQLAdapter alone) is simply absent elsewhere —
        // there `adapter_helper.rb`'s delegation would raise NoMethodError, so
        // the only correct table entry is "unsupported". Absent reads as false,
        // which still flags a table that claims support the adapter can't answer.
        live = typeof method === "function" && (method as () => boolean).call(connection) === true;
      }
      const table = adapterSupports(feature);
      if (table !== live) drift.push(`${feature}: table=${table} adapter=${live}`);
    }

    expect(drift).toEqual([]);
  });
});
