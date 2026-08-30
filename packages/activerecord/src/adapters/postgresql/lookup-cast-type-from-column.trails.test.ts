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
    it("verifies the connection and answers the real type", async () => {
      await connection.execute("SELECT 1");
      connection.disconnectBang();

      await connection.verifyBang();

      expect(
        connection.lookupCastTypeFromColumn({ oid: UUID_OID, fmod: -1, sqlType: "uuid" }),
      ).toBeInstanceOf(Uuid);
    });
  });
});
