import { describe, it, expect } from "vitest";
import { CpkBook } from "./test-helpers/models/cpk.js";
import { fixtures } from "./test-fixtures.js";
import { Base } from "./base.js";
import { Country } from "./test-helpers/models/country.js";
import { Keyboard } from "./test-helpers/models/keyboard.js";
import { captureSqlAndBinds } from "./test-helpers/test-case.js";

describe("CompositePrimaryKey#id= — Enumerable acceptance (trails-only)", () => {
  fixtures({});

  it("zips a Set across the key columns like an array", () => {
    const book = new CpkBook();
    book.id = new Set([1, 2]) as unknown as number[];
    expect(book.id).toEqual([1, 2]);
  });

  it("raises TypeError for a String scalar (not Enumerable in Ruby)", () => {
    const book = new CpkBook();
    expect(() => {
      book.id = "1" as unknown as number[];
    }).toThrow(new TypeError('Expected value matching ["author_id", "id"], got "1".'));
  });

  it("pads a short value with null like Ruby's zip", () => {
    const book = new CpkBook();
    book.id = [1] as unknown as number[];
    expect(book.id).toEqual([1, null]);
  });
});

describe("primary_key on a key-less table after a reconnect (trails-only)", () => {
  const { canonicalTables } = fixtures({}, { useTransactionalTests: false });

  it("answers nil and inserts with no RETURNING once the connection is re-established", async () => {
    class KeylessEdge extends Base {
      static override tableName = "edges";
    }
    await KeylessEdge.loadSchema();

    await KeylessEdge.establishConnection({ ...Base.connectionDbConfig().configurationHash });
    try {
      await KeylessEdge.withConnection((c) => canonicalTables(c, ["edges"]));
      await KeylessEdge.loadSchema();
      expect(KeylessEdge.primaryKey).toBeNull();

      const log = await captureSqlAndBinds(() => KeylessEdge.create({ source_id: 1, sink_id: 2 }));
      const inserts = log.map(([sql]) => sql).filter((sql) => /^INSERT/i.test(sql));
      expect(inserts).toHaveLength(1);
      expect(inserts[0]).not.toMatch(/RETURNING/i);
    } finally {
      await KeylessEdge.deleteAll();
      await KeylessEdge.removeConnection();
    }
  });
});

describe("PrimaryKeysTrailsTest", () => {
  fixtures([]);

  it("resolves a custom string primary key with no explicit primary_key= via the schema cache", async () => {
    Country.resetColumnInformation();
    await Country.loadSchema();
    expect(Country.primaryKey).toBe("country_id");
  });

  it("write_attribute id remaps to a scalar custom primary key", async () => {
    const keyboard = await Keyboard.createBang();
    keyboard.writeAttribute("id", 42);
    expect(Number(keyboard.readAttribute("key_number"))).toBe(42);
  });

  it("write_attribute id on a composite primary key raises", () => {
    const book = new CpkBook();
    expect(() => book.writeAttribute("id", 7)).toThrow(
      'can\'t write unknown attribute `["author_id", "id"]`',
    );
  });

  it("id returns nil if primary key doesnt exist", async () => {
    class AnonDashboard extends Base {
      static {
        this._tableName = "dashboards";
      }
    }
    await AnonDashboard.loadSchema();
    expect(AnonDashboard.primaryKey).toBe(null);
    expect(new AnonDashboard().id).toBe(null);
  });
});
