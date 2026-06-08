/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/composite_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { Base } from "../../index.js";
import { ValueType } from "@blazetrails/activemodel";

// Rails: class PostgresqlComposite < ActiveRecord::Base
//   self.table_name = "postgresql_composites"
class PostgresqlComposite extends Base {
  static {
    this.tableName = "postgresql_composites";
  }
}

// Rails: FullAddress = Struct.new(:city, :street)
interface FullAddress {
  city: string;
  street: string;
}

// Rails: class FullAddressType < ActiveRecord::Type::Value
class FullAddressType extends ValueType<FullAddress> {
  override readonly name = "full_address";

  override type(): string {
    return "full_address";
  }

  override deserialize(value: unknown): FullAddress | null {
    if (value == null) return null;
    const m = (value as string).match(/\("?([^",]*)"?,"?([^",]*)"?\)/);
    return m ? { city: m[1], street: m[2] } : null;
  }

  override cast(value: unknown): FullAddress | null {
    return value as FullAddress | null;
  }

  override serialize(value: unknown): unknown {
    if (value == null) return null;
    const addr = value as FullAddress;
    return `(${addr.city},${addr.street})`;
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  setupHandlerSuite();
  let connection: PostgreSQLAdapter;

  async function setupCompositeType(): Promise<void> {
    await connection.execute(`CREATE TYPE full_address AS (city VARCHAR(90), street VARCHAR(90))`);
    await connection.execute(
      `CREATE TABLE postgresql_composites (id SERIAL PRIMARY KEY, address full_address)`,
    );
  }

  async function teardownCompositeType(): Promise<void> {
    await connection.execute("DROP TABLE IF EXISTS postgresql_composites CASCADE");
    await connection.execute("DROP TYPE IF EXISTS full_address");
    PostgresqlComposite.resetColumnInformation();
    await connection.reloadTypeMap();
  }

  describe("PostgresqlCompositeTest", () => {
    beforeEach(async () => {
      connection = Base.connection as PostgreSQLAdapter;
      await setupCompositeType();
      PostgresqlComposite.resetColumnInformation();
      await PostgresqlComposite.loadSchema();
    });

    afterEach(async () => {
      await teardownCompositeType();
    });

    it("column", async () => {
      // Rails: assert_nil column.type — unknown composite OID maps to ValueType
      // TS diverges: ValueType#type() returns "value" (TS has no nil type symbol)
      const col = (PostgresqlComposite as any).columnsHash()["address"];
      expect(col.type).toBe("value");
      expect(col.sqlType).toBe("full_address");
      expect((col as any).array).toBeFalsy();
      const type = PostgresqlComposite.typeForAttribute("address");
      expect(type.isBinary()).toBe(false);
    });

    it("composite mapping", async () => {
      // Rails: INSERT ... ROW('Paris', 'Champs-Élysées'); assert "(Paris,Champs-Élysées)"
      await connection.execute(
        `INSERT INTO postgresql_composites VALUES (1, ROW('Paris', 'Champs-Élysées'))`,
      );
      const composite = (await PostgresqlComposite.first())!;
      expect((composite as any).address).toBe("(Paris,Champs-Élysées)");
      // Rails: composite.address = "(Paris,Rue Basse)"; save!; assert '(Paris,"Rue Basse")'
      (composite as any).address = "(Paris,Rue Basse)";
      await (composite as any).saveBang();
      const reloaded = (await PostgresqlComposite.first())!;
      expect((reloaded as any).address).toMatch(/Rue Basse/);
    });
  });

  describe("PostgresqlCompositeWithCustomOidTest", () => {
    beforeEach(async () => {
      connection = Base.connection as PostgreSQLAdapter;
      await setupCompositeType();
      // Rails: @connection.send(:type_map).register_type "full_address", FullAddressType.new
      // Pre-registering by name lets loadAdditionalTypes alias the numeric OID to the type.
      connection.typeMap.registerType("full_address", new FullAddressType());
      PostgresqlComposite.resetColumnInformation();
      await PostgresqlComposite.loadSchema();
    });

    afterEach(async () => {
      await teardownCompositeType();
    });

    it("column", async () => {
      // Rails: assert_equal :full_address, column.type
      const col = (PostgresqlComposite as any).columnsHash()["address"];
      expect(col.type).toBe("full_address");
      expect(col.sqlType).toBe("full_address");
      expect((col as any).array).toBeFalsy();
      const type = PostgresqlComposite.typeForAttribute("address");
      expect(type.isBinary()).toBe(false);
    });

    it("composite mapping", async () => {
      // Rails: assert city/street via FullAddress struct after deserialize
      await connection.execute(
        `INSERT INTO postgresql_composites VALUES (1, ROW('Paris', 'Champs-Élysées'))`,
      );
      const composite = (await PostgresqlComposite.first())!;
      const addr = (composite as any).address as FullAddress;
      expect(addr.city).toBe("Paris");
      expect(addr.street).toBe("Champs-Élysées");
      // Rails: composite.address = FullAddress.new("Paris", "Rue Basse"); save!
      (composite as any).address = { city: "Paris", street: "Rue Basse" };
      await (composite as any).saveBang();
      const reloaded = (await PostgresqlComposite.first())!;
      const reloadedAddr = (reloaded as any).address as FullAddress;
      expect(reloadedAddr.city).toBe("Paris");
      expect(reloadedAddr.street).toBe("Rue Basse");
    });
  });
});
