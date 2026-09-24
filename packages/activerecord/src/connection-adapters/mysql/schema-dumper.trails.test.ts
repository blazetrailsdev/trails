import { describe, it, expect } from "vitest";
import { ValueType } from "@blazetrails/activemodel";
import { SchemaDumper } from "./schema-dumper.js";
import type { SchemaSource } from "../../schema-dumper.js";
import { Result } from "../../result.js";
import { Column } from "./column.js";
import { TypeMetadata } from "./type-metadata.js";
import { Version } from "../abstract-adapter.js";

const stubSource: SchemaSource = {
  tables: async () => [],
  columns: async () => [],
  indexes: async () => [],
  lookupCastTypeFromColumn: () => new ValueType(),
};
class TestSchemaDumper extends SchemaDumper {
  setConnection(connection: TestSchemaDumper["connection"]): void {
    this.connection = connection;
  }
}
const make = () => TestSchemaDumper.create(stubSource);
const stubConnection = (
  o: {
    collation?: string;
    expression?: string;
    onQuery?: (sql: string) => void;
  } = {},
): NonNullable<TestSchemaDumper["connection"]> => ({
  tableOptions: async () => ({}),
  internalExecQuery: async (sql: string) => {
    o.onQuery?.(sql);
    return Result.fromRowHashes([{ Collation: o.collation ?? null }]);
  },
  queryValue: async (sql: string) => {
    o.onQuery?.(sql);
    return o.expression ?? null;
  },
  quote: (v: unknown) => `'${String(v)}'`,
  quoteColumnName: (v: unknown) => `\`${String(v)}\``,
  isMariadb: async () => false,
  databaseVersion: new Version("8.0.0"),
  createTableInfo: async () => null,
});
const col = (
  o: {
    name?: string;
    type?: string;
    sqlType?: string;
    limit?: number | null;
    precision?: number | null;
    collation?: string | null;
    bigint?: boolean;
    virtual?: boolean;
    unsigned?: boolean;
    autoIncrement?: boolean;
    extra?: string;
  } = {},
) => {
  const extra =
    [o.extra, o.virtual && "VIRTUAL GENERATED", o.autoIncrement && "auto_increment"]
      .filter(Boolean)
      .join(" ") || null;
  const meta = {
    sqlType:
      (o.sqlType ?? (o.bigint ? "bigint" : "varchar(255)")) + (o.unsigned ? " unsigned" : ""),
    type: o.type ?? (o.bigint ? "bigint" : "string"),
    limit: o.limit ?? null,
    precision: o.precision ?? null,
  };
  return new Column(o.name ?? "col", null, new TypeMetadata(meta, { extra }), true, {
    collation: o.collation ?? null,
  });
};

describe("MySQL::SchemaDumper", () => {
  describe("schemaType", () => {
    it("timestamp → 'timestamp'", () =>
      expect((make() as any).schemaType(col({ sqlType: "timestamp" }))).toBe(":timestamp"));
    it("enum → full sql_type", () =>
      expect((make() as any).schemaType(col({ sqlType: "enum('a','b')" }))).toBe("enum('a','b')"));
    it("set → full sql_type", () =>
      expect((make() as any).schemaType(col({ sqlType: "set('x')" }))).toBe("set('x')"));
    it("standard → delegates to super", () =>
      expect((make() as any).schemaType(col({ type: "string" }))).toBe(":string"));
  });

  describe("schemaLimit", () => {
    it("suppresses limit for text/blob family", () => {
      for (const t of ["tinytext", "text", "longblob", "mediumblob"]) {
        expect((make() as any).schemaLimit(col({ sqlType: t }))).toBeUndefined();
      }
    });
    it("returns limit for varchar", () =>
      expect((make() as any).schemaLimit(col({ sqlType: "varchar(100)", limit: 100 }))).toBe(
        "100",
      ));
    it("suppresses default limit 24 for float", () =>
      expect(
        (make() as any).schemaLimit(col({ type: "float", sqlType: "float", limit: 24 })),
      ).toBeUndefined());
    it("emits non-default limit for float (double precision)", () =>
      expect(
        (make() as any).schemaLimit(col({ type: "float", sqlType: "double", limit: 53 })),
      ).toBe("53"));
  });

  describe("schemaPrecision", () => {
    it("time precision 0 → undefined", () =>
      expect(
        (make() as any).schemaPrecision(col({ type: "time", sqlType: "time", precision: 0 })),
      ).toBeUndefined());
    it("timestamp (datetime type) precision 0 → undefined", () =>
      expect(
        (make() as any).schemaPrecision(
          col({ type: "datetime", sqlType: "timestamp", precision: 0 }),
        ),
      ).toBeUndefined());
    it("datetime precision 0 → 'null'", () =>
      expect(
        (make() as any).schemaPrecision(
          col({ type: "datetime", sqlType: "datetime", precision: 0 }),
        ),
      ).toBe("null"));
    it("datetime precision 3 → '3'", () =>
      expect(
        (make() as any).schemaPrecision(
          col({ type: "datetime", sqlType: "datetime(3)", precision: 3 }),
        ),
      ).toBe("3"));
  });

  describe("schemaCollation", () => {
    it("returns undefined when no collation", async () =>
      expect(await (make() as any).schemaCollation(col({ collation: null }))).toBeUndefined());
    it("omits when matching table default", async () => {
      const d = make();
      d.setConnection(stubConnection({ collation: "utf8mb4_unicode_ci" }));
      d.tableName = "users";
      expect(
        await (d as any).schemaCollation(col({ collation: "utf8mb4_unicode_ci" })),
      ).toBeUndefined();
    });
    it("emits when differing from table default", async () => {
      const d = make();
      d.setConnection(stubConnection({ collation: "utf8mb4_general_ci" }));
      d.tableName = "users";
      expect(await (d as any).schemaCollation(col({ collation: "utf8mb4_unicode_ci" }))).toBe(
        '"utf8mb4_unicode_ci"',
      );
    });
    it("queries SHOW TABLE STATUS once per table", async () => {
      const d = make();
      const queries: string[] = [];
      d.setConnection(
        stubConnection({ collation: "utf8mb4_general_ci", onQuery: (q) => queries.push(q) }),
      );
      d.tableName = "users";
      await (d as any).schemaCollation(col({ collation: "utf8mb4_unicode_ci" }));
      await (d as any).schemaCollation(col({ collation: "utf8mb4_unicode_ci" }));
      expect(queries).toEqual(["SHOW TABLE STATUS LIKE 'users'"]);
    });
  });

  describe("isDefaultPrimaryKey", () => {
    it("true: bigint + autoIncrement + non-unsigned", () =>
      expect((make() as any).isDefaultPrimaryKey(col({ bigint: true, autoIncrement: true }))).toBe(
        true,
      ));
    it("false: unsigned", () =>
      expect(
        (make() as any).isDefaultPrimaryKey(
          col({ bigint: true, autoIncrement: true, unsigned: true }),
        ),
      ).toBe(false));
    it("false: no autoIncrement", () =>
      expect((make() as any).isDefaultPrimaryKey(col({ bigint: true }))).toBe(false));
  });

  describe("isExplicitPrimaryKeyDefault", () => {
    it("true when integer + autoIncrement explicitly false", () =>
      expect(
        (make() as any).isExplicitPrimaryKeyDefault(col({ type: "integer", autoIncrement: false })),
      ).toBe(true));
    it("false when autoIncrement true", () =>
      expect(
        (make() as any).isExplicitPrimaryKeyDefault(col({ type: "integer", autoIncrement: true })),
      ).toBe(false));
    it("true when autoIncrement undefined (not auto_increment)", () =>
      expect((make() as any).isExplicitPrimaryKeyDefault(col({ type: "integer" }))).toBe(true));
  });

  describe("prepareColumnOptions", () => {
    it("adds unsigned", async () =>
      expect(
        (await (make() as any).prepareColumnOptions(col({ unsigned: true })))["unsigned"],
      ).toBe("true"));
    it("adds autoIncrement", async () =>
      expect(
        (await (make() as any).prepareColumnOptions(col({ autoIncrement: true })))["autoIncrement"],
      ).toBe("true"));
    it("prepends size key for tinytext", async () => {
      const opts = await (make() as any).prepareColumnOptions(col({ sqlType: "tinytext" }));
      expect(Object.keys(opts)[0]).toBe("size");
      expect(opts["size"]).toBe('"tiny"');
    });
    it("virtual column: emits type prefix, as, and stored", async () => {
      const d = make();
      d.tableName = "t";
      d.setConnection(stubConnection({ expression: "CONCAT(a, b)" }));
      const opts = await (d as any).prepareColumnOptions(
        col({
          name: "full_name",
          type: "string",
          sqlType: "varchar(255)",
          virtual: true,
          extra: "STORED",
        }),
      );
      const keys = Object.keys(opts);
      expect(keys[0]).toBe("type");
      expect(opts["type"]).toBe('"string"');
      expect(opts["as"]).toBe('"CONCAT(a, b)"');
      expect(opts["stored"]).toBe("true");
    });
  });

  describe("columnSpecForPrimaryKey", () => {
    it("removes autoIncrement for integer pk", async () => {
      expect(
        (
          await (make() as any).columnSpecForPrimaryKey(
            col({ type: "integer", autoIncrement: true }),
          )
        )["autoIncrement"],
      ).toBeUndefined();
    });
  });

  describe("extractExpressionForVirtualColumn", () => {
    it("queries information_schema for the column's generation expression", async () => {
      const d = make();
      const queries: string[] = [];
      d.setConnection(
        stubConnection({ expression: "upper(`name`)", onQuery: (q) => queries.push(q) }),
      );
      d.tableName = "t";
      expect(
        await (d as any).extractExpressionForVirtualColumn(
          col({ name: "upper_name", virtual: true }),
        ),
      ).toBe('"upper(`name`)"');
      expect(queries).toEqual([
        "SELECT generation_expression FROM information_schema.columns" +
          " WHERE table_schema = database()   AND table_name = 't'   AND column_name = 'upper_name'",
      ]);
    });

    it('strips escaped single quotes (mirrors Rails gsub("\\\\\'", "\'"))', async () => {
      const d = make();
      d.setConnection(
        stubConnection({ expression: "json_extract(`profile`,_utf8mb4\\'$.email\\')" }),
      );
      d.tableName = "t";
      expect(
        await (d as any).extractExpressionForVirtualColumn(col({ name: "c", virtual: true })),
      ).toBe(JSON.stringify("json_extract(`profile`,_utf8mb4'$.email')"));
    });
  });

  describe("tableOptions", () => {
    it("returns the adapter's options and writes no collation cache", async () => {
      const d = make();
      d.setConnection({
        ...stubConnection(),
        tableOptions: async () => ({ charset: "utf8mb4", collation: "utf8mb4_bin" }),
      });
      expect(await (d as any).tableOptions("users")).toEqual({
        charset: "utf8mb4",
        collation: "utf8mb4_bin",
      });
      expect((d as any)._tableCollationCache).toBeUndefined();
    });

    it("returns empty object when connection is absent", async () => {
      const d = make();
      d.setConnection(undefined);
      expect(await (d as any).tableOptions("users")).toEqual({});
    });
  });
});
