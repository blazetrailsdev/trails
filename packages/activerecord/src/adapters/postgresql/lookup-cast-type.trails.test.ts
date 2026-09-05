import { describe, it, expect, beforeEach } from "vitest";
import { IntegerType, StringType } from "@blazetrails/activemodel";
import { Enum } from "../../connection-adapters/postgresql/oid/enum.js";
import { describeIfPg, PG_TEST_URL, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";

describeIfPg("PostgreSQLAdapter#lookupCastType", () => {
  fixtures({}, { useTransactionalTests: false });

  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    connection = Base.connection as PostgreSQLAdapter;
    await connection.execute("SELECT 1");
  });

  describe("resolving through ::regtype", () => {
    it("answers the same type for an alias spelling as for the canonical name", () => {
      expect(connection.lookupCastType("character varying(255)")).toBeInstanceOf(StringType);
      expect(connection.lookupCastType("varchar")).toBeInstanceOf(StringType);
      expect(connection.lookupCastType("int4")).toBeInstanceOf(IntegerType);
      expect(connection.lookupCastType("integer")).toBeInstanceOf(IntegerType);
    });

    it("answers the real type for a schema-qualified name", () => {
      expect(connection.lookupCastType("pg_catalog.int4")).toBeInstanceOf(IntegerType);
    });

    it("answers the real type for a user type in a schema off the search path", async () => {
      await connection.execute("DROP SCHEMA IF EXISTS lookup_cast_type_schema CASCADE");
      await connection.execute("CREATE SCHEMA lookup_cast_type_schema");
      await connection.execute("CREATE DOMAIN lookup_cast_type_schema.zipcode AS integer");
      await connection.execute("CREATE TYPE lookup_cast_type_schema.mood AS ENUM ('ok', 'bad')");

      const adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
      try {
        await adapter.execute("SELECT 1");

        expect(adapter.lookupCastType("lookup_cast_type_schema.zipcode")).toBeInstanceOf(
          IntegerType,
        );
        expect(adapter.lookupCastType("zipcode")).toBeInstanceOf(IntegerType);
        expect(adapter.lookupCastType("lookup_cast_type_schema.mood")).toBeInstanceOf(Enum);
        expect(adapter.lookupCastType("mood")).toBeInstanceOf(Enum);
      } finally {
        await adapter.disconnectBang();
        await connection.execute("DROP SCHEMA IF EXISTS lookup_cast_type_schema CASCADE");
      }
    });
  });
});
