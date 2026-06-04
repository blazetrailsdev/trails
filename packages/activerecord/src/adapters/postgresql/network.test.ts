/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/network_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { Base } from "../../index.js";
import type { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";
import type { TableDefinition as PgTableDefinition } from "../../connection-adapters/postgresql/schema-definitions.js";

// Rails: class PostgresqlNetworkAddress < ActiveRecord::Base; end
class PostgresqlNetworkAddress extends Base {
  static {
    this.tableName = "postgresql_network_addresses";
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  setupHandlerSuite();

  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    connection = Base.connection as PostgreSQLAdapter;
    await connection.createTable("postgresql_network_addresses", { force: true }, (t) => {
      (t as PgTableDefinition).inet("inet_address", { default: "192.168.1.1" });
      (t as PgTableDefinition).cidr("cidr_address", { default: "192.168.1.0/24" });
      (t as PgTableDefinition).macaddr("mac_address", { default: "ff:ff:ff:ff:ff:ff" });
    });
    PostgresqlNetworkAddress.resetColumnInformation();
    await PostgresqlNetworkAddress.loadSchema();
  });

  afterEach(async () => {
    await connection.dropTable("postgresql_network_addresses", { ifExists: true });
    PostgresqlNetworkAddress.resetColumnInformation();
  });

  describe("PostgresqlNetworkTest", () => {
    it("cidr column", async () => {
      const column = PostgresqlNetworkAddress.columnsHash()["cidr_address"] as unknown as PgColumn;
      expect(column.type).toBe("cidr");
      expect(column.sqlType).toBe("cidr");
      expect(column.array).toBeFalsy();

      const type = PostgresqlNetworkAddress.typeForAttribute("cidr_address");
      expect(type.isBinary()).toBe(false);
    });

    it("inet column", async () => {
      const column = PostgresqlNetworkAddress.columnsHash()["inet_address"] as unknown as PgColumn;
      expect(column.type).toBe("inet");
      expect(column.sqlType).toBe("inet");
      expect(column.array).toBeFalsy();

      const type = PostgresqlNetworkAddress.typeForAttribute("inet_address");
      expect(type.isBinary()).toBe(false);
    });

    it("macaddr column", async () => {
      const column = PostgresqlNetworkAddress.columnsHash()["mac_address"] as unknown as PgColumn;
      expect(column.type).toBe("macaddr");
      expect(column.sqlType).toBe("macaddr");
      expect(column.array).toBeFalsy();

      const type = PostgresqlNetworkAddress.typeForAttribute("mac_address");
      expect(type.isBinary()).toBe(false);
    });

    it("network types", async () => {
      await PostgresqlNetworkAddress.create({
        cidr_address: "192.168.0.0/24",
        inet_address: "172.16.1.254/32",
        mac_address: "01:23:45:67:89:0a",
      });

      const address = (await PostgresqlNetworkAddress.first()) as any;
      expect(address.cidr_address).toMatchObject({ address: "192.168.0.0", prefixLength: 24 });
      expect(address.inet_address).toMatchObject({ address: "172.16.1.254", prefixLength: 32 });
      expect(address.mac_address).toBe("01:23:45:67:89:0a");

      address.cidr_address = "10.1.2.3/32";
      address.inet_address = "10.0.0.0/8";
      address.mac_address = "bc:de:f0:12:34:56";

      await address.saveBang();
      await address.reload();
      expect(address.cidr_address).toMatchObject({ address: "10.1.2.3", prefixLength: 32 });
      expect(address.inet_address).toMatchObject({ address: "10.0.0.0", prefixLength: 8 });
      expect(address.mac_address).toBe("bc:de:f0:12:34:56");
    });

    it("invalid network address", async () => {
      const invalidAddress = PostgresqlNetworkAddress.new({
        cidr_address: "invalid addr",
        inet_address: "invalid addr",
      }) as any;
      expect(invalidAddress.cidr_address).toBeNull();
      expect(invalidAddress.inet_address).toBeNull();
      expect(invalidAddress.cidr_addressBeforeTypeCast).toBe("invalid addr");
      expect(invalidAddress.inet_addressBeforeTypeCast).toBe("invalid addr");
      await invalidAddress.save();

      await invalidAddress.reload();
      expect(invalidAddress.cidr_address).toBeNull();
      expect(invalidAddress.inet_address).toBeNull();
      expect(invalidAddress.cidr_addressBeforeTypeCast).toBeNull();
      expect(invalidAddress.inet_addressBeforeTypeCast).toBeNull();
    });

    it("schema dump with shorthand", async () => {
      const output = await SchemaDumper.dumpTableSchema(connection, "postgresql_network_addresses");
      expect(output).toMatch(/t\.inet\(\s*"inet_address",\s*\{[^}]*default:\s*"192\.168\.1\.1"/);
      expect(output).toMatch(
        /t\.cidr\(\s*"cidr_address",\s*\{[^}]*default:\s*"192\.168\.1\.0\/24"/,
      );
      expect(output).toMatch(
        /t\.macaddr\(\s*"mac_address",\s*\{[^}]*default:\s*"ff:ff:ff:ff:ff:ff"/,
      );
    });

    it("cidr change prefix", async () => {
      const model = (await PostgresqlNetworkAddress.create({
        cidr_address: "192.168.1.0/24",
      })) as any;
      model.cidr_address = "192.168.1.0/24";
      expect(model.changed).toBe(false);

      model.cidr_address = "192.168.2.0/24";
      expect(model.changed).toBe(true);

      model.cidr_address = "192.168.1.0/25";
      expect(model.changed).toBe(true);
    });

    it("mac address change case does not mark dirty", async () => {
      const model = (await PostgresqlNetworkAddress.create({
        mac_address: "Ab:Cd:Ef:01:02:03",
      })) as any;
      // Rails: model.mac_address = model.mac_address.swapcase
      model.mac_address = (model.mac_address as string).replace(/[a-zA-Z]/g, (c: string) =>
        c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase(),
      );
      expect(model.changed).toBe(false);
    });
  });
});
