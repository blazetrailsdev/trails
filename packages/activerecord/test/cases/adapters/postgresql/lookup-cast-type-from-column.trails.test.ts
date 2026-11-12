import { describe, it, expect, beforeEach } from "vitest";
import { Uuid } from "../../../../lib/connection-adapters/postgresql/oid/uuid.js";
import {
  describeIfPg,
  PostgreSQLAdapter,
} from "../../../../lib/adapters/postgresql/test-helper.js";
import { fixtures } from "../../../../lib/test-helpers/use-fixtures.js";
import { Base } from "../../../../lib/index.js";

const UUID_OID = 2950;

describeIfPg("PostgreSQLAdapter#lookupCastTypeFromColumn", () => {
  fixtures({}, { useTransactionalTests: false });

  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    connection = (await Base.leaseConnection()) as PostgreSQLAdapter;
  });

  describe("on a dropped connection", () => {
    it("answers the real type from the type map already built", async () => {
      await connection.execute("SELECT 1");
      await connection.disconnectBang();

      expect(
        connection.lookupCastTypeFromColumn({ oid: UUID_OID, fmod: -1, sqlType: "uuid" }),
      ).toBeInstanceOf(Uuid);
    });
  });
});
