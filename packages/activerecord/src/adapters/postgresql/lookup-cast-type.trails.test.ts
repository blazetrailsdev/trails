import { describe, it, expect, beforeEach } from "vitest";
import { IntegerType, StringType } from "@blazetrails/activemodel";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
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
  });
});
