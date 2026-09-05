import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";
import { ValueType } from "@blazetrails/activemodel";

class PostgresqlComposite extends Base {
  static {
    this.tableName = "postgresql_composites";
    this.attribute("id", "integer");
  }
}

interface FullAddress {
  city: string;
  street: string;
}

class FullAddressType extends ValueType<FullAddress> {
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
  fixtures({}, { useTransactionalTests: false });
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
    void PostgresqlComposite.resetColumnInformation();
    await connection.reloadTypeMap();
  }

  describe("PostgresqlCompositeTest", () => {
    beforeEach(async () => {
      connection = Base.connection as PostgreSQLAdapter;
      await setupCompositeType();
      void PostgresqlComposite.resetColumnInformation();
      await PostgresqlComposite.loadSchema();
    });

    afterEach(async () => {
      await teardownCompositeType();
    });

    it("column", async () => {
      const col = (PostgresqlComposite as any).columnsHash()["address"];
      expect(col.type).toBeNull();
      expect(col.sqlType).toBe("full_address");
      expect(col.array).toBeFalsy();
      const type = PostgresqlComposite.typeForAttribute("address")!;
      expect(type.isBinary()).toBe(false);
    });

    it("composite mapping", async () => {
      await connection.execute(
        `INSERT INTO postgresql_composites VALUES (1, ROW('Paris', 'Champs-Élysées'))`,
      );
      const composite = (await PostgresqlComposite.first())!;
      expect((composite as any).address).toBe("(Paris,Champs-Élysées)");
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
      connection.typeMap.registerType("full_address", new FullAddressType());
      void PostgresqlComposite.resetColumnInformation();
      await PostgresqlComposite.loadSchema();
    });

    afterEach(async () => {
      await teardownCompositeType();
    });

    it("column", async () => {
      const col = (PostgresqlComposite as any).columnsHash()["address"];
      expect(col.type).toBe("full_address");
      expect(col.sqlType).toBe("full_address");
      expect(col.array).toBeFalsy();
      const type = PostgresqlComposite.typeForAttribute("address")!;
      expect(type.isBinary()).toBe(false);
    });

    it("composite mapping", async () => {
      await connection.execute(
        `INSERT INTO postgresql_composites VALUES (1, ROW('Paris', 'Champs-Élysées'))`,
      );
      const composite = (await PostgresqlComposite.first())!;
      const addr = (composite as any).address as FullAddress;
      expect(addr.city).toBe("Paris");
      expect(addr.street).toBe("Champs-Élysées");
      (composite as any).address = { city: "Paris", street: "Rue Basse" };
      await (composite as any).saveBang();
      const reloaded = (await PostgresqlComposite.first())!;
      const reloadedAddr = (reloaded as any).address as FullAddress;
      expect(reloadedAddr.city).toBe("Paris");
      expect(reloadedAddr.street).toBe("Rue Basse");
    });
  });
});
