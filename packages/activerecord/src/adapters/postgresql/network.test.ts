/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/network_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS "postgresql_network_addresses"`);
    await adapter.exec(`
      CREATE TABLE "postgresql_network_addresses" (
        "id" SERIAL PRIMARY KEY,
        "inet_address" inet DEFAULT '192.168.1.1',
        "cidr_address" cidr DEFAULT '192.168.1.0/24',
        "mac_address" macaddr DEFAULT 'ff:ff:ff:ff:ff:ff'
      )
    `);
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS "postgresql_network_addresses"`);
    await adapter.close();
  });

  describe("PostgresqlNetworkTest", () => {
    it("inet column", async () => {
      const cols = await adapter.columns("postgresql_network_addresses");
      const col = cols.find((c) => c.name === "inet_address");
      expect(col).toBeDefined();
      expect(col!.type).toBe("inet");
    });

    it("inet type cast", async () => {
      const rows = await adapter.execute("SELECT '192.168.1.1'::inet AS val");
      expect(rows[0].val).toBe("192.168.1.1");
    });

    it("inet write", async () => {
      const id = await adapter.executeMutation(
        `INSERT INTO "postgresql_network_addresses" ("inet_address") VALUES ('172.16.1.254/32')`,
      );
      const rows = await adapter.execute(
        `SELECT "inet_address" FROM "postgresql_network_addresses" WHERE "id" = ?`,
        [id],
      );
      expect(rows[0].inet_address).toBe("172.16.1.254");
    });

    it("inet where", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_network_addresses" ("inet_address") VALUES ('10.0.0.1')`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_network_addresses" ("inet_address") VALUES ('10.0.0.2')`,
      );
      const rows = await adapter.execute(
        `SELECT * FROM "postgresql_network_addresses" WHERE "inet_address" = ?`,
        ["10.0.0.1"],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].inet_address).toBe("10.0.0.1");
    });

    it("cidr column", async () => {
      const cols = await adapter.columns("postgresql_network_addresses");
      const col = cols.find((c) => c.name === "cidr_address");
      expect(col).toBeDefined();
      expect(col!.type).toBe("cidr");
    });

    it("cidr type cast", async () => {
      const rows = await adapter.execute("SELECT '192.168.1.0/24'::cidr AS val");
      expect(rows[0].val).toBe("192.168.1.0/24");
    });

    it("macaddr column", async () => {
      const cols = await adapter.columns("postgresql_network_addresses");
      const col = cols.find((c) => c.name === "mac_address");
      expect(col).toBeDefined();
      expect(col!.type).toBe("macaddr");
    });

    it("macaddr type cast", async () => {
      const rows = await adapter.execute("SELECT 'ff:ff:ff:ff:ff:ff'::macaddr AS val");
      expect(rows[0].val).toBe("ff:ff:ff:ff:ff:ff");
    });

    it("network types", async () => {
      const id = await adapter.executeMutation(
        `INSERT INTO "postgresql_network_addresses" ("cidr_address", "inet_address", "mac_address")
         VALUES ('192.168.0.0/24', '172.16.1.254/32', 'Ab:Cd:Ef:01:02:03')`,
      );
      const rows = await adapter.execute(
        `SELECT * FROM "postgresql_network_addresses" WHERE "id" = ?`,
        [id],
      );
      expect(rows[0].cidr_address).toBe("192.168.0.0/24");
      expect(rows[0].inet_address).toBe("172.16.1.254");
      expect(rows[0].mac_address).toBe("ab:cd:ef:01:02:03");

      await adapter.executeMutation(
        `UPDATE "postgresql_network_addresses"
         SET "cidr_address" = '10.1.2.3/32', "inet_address" = '10.0.0.0/8', "mac_address" = 'bc:de:f0:12:34:56'
         WHERE "id" = ?`,
        [id],
      );
      const updated = await adapter.execute(
        `SELECT * FROM "postgresql_network_addresses" WHERE "id" = ?`,
        [id],
      );
      expect(updated[0].cidr_address).toBe("10.1.2.3/32");
      expect(updated[0].inet_address).toBe("10.0.0.0/8");
      expect(updated[0].mac_address).toBe("bc:de:f0:12:34:56");
    });

    it("invalid network address", async () => {
      await expect(
        adapter.executeMutation(
          `INSERT INTO "postgresql_network_addresses" ("inet_address") VALUES ('invalid addr')`,
        ),
      ).rejects.toThrow();
    });

    it("cidr change prefix", async () => {
      const id = await adapter.executeMutation(
        `INSERT INTO "postgresql_network_addresses" ("cidr_address") VALUES ('192.168.1.0/24')`,
      );
      const rows = await adapter.execute(
        `SELECT "cidr_address" FROM "postgresql_network_addresses" WHERE "id" = ?`,
        [id],
      );
      expect(rows[0].cidr_address).toBe("192.168.1.0/24");

      await adapter.executeMutation(
        `UPDATE "postgresql_network_addresses" SET "cidr_address" = '192.168.1.0/25' WHERE "id" = ?`,
        [id],
      );
      const updated = await adapter.execute(
        `SELECT "cidr_address" FROM "postgresql_network_addresses" WHERE "id" = ?`,
        [id],
      );
      expect(updated[0].cidr_address).toBe("192.168.1.0/25");
    });

    // Needs Base model with dirty tracking support
    it.skip("mac address change case does not mark dirty", async () => {});
  });
});
