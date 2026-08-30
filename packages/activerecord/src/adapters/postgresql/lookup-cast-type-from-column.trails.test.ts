import { describe, it, expect, beforeEach } from "vitest";
import { Uuid } from "../../connection-adapters/postgresql/oid/uuid.js";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";

const UUID_OID = 2950;

describeIfPg("PostgreSQLAdapter#lookupCastTypeFromColumn", () => {
  fixtures({}, { useTransactionalTests: false });

  let connection: PostgreSQLAdapter;

  beforeEach(() => {
    connection = Base.connection as PostgreSQLAdapter;
  });

  describe("on a dropped connection", () => {
    it("answers the real type from the type map already built", async () => {
      await connection.execute("SELECT 1");
      connection.disconnectBang();

      expect(
        connection.lookupCastTypeFromColumn({ oid: UUID_OID, fmod: -1, sqlType: "uuid" }),
      ).toBeInstanceOf(Uuid);
    });
  });

  describe("on an adapter that never built a type map", () => {
    it("raises ConnectionNotEstablished", () => {
      const fresh = new PostgreSQLAdapter({ host: "localhost", port: 1 });

      expect(() =>
        fresh.lookupCastTypeFromColumn({ oid: UUID_OID, fmod: -1, sqlType: "uuid" }),
      ).toThrow(/type map is not loaded/);
    });
  });
});
