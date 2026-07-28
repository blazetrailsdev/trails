import { describe, it, expect, afterEach } from "vitest";
import {
  ForeignKeyDefinition,
  CheckConstraintDefinition,
  ReferenceDefinition,
  TableDefinition,
  type ReferenceDefinitionConnection,
} from "./schema-definitions.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { Base } from "../../base.js";

const originalFkPattern = SchemaDumper.fkIgnorePattern;
const originalChkPattern = SchemaDumper.chkIgnorePattern;

afterEach(() => {
  SchemaDumper.fkIgnorePattern = originalFkPattern;
  SchemaDumper.chkIgnorePattern = originalChkPattern;
});

describe("ForeignKeyDefinition#export_name_on_schema_dump?", () => {
  const fk = (name: string): ForeignKeyDefinition =>
    new ForeignKeyDefinition("astronauts", "rockets", "rocket_id", "id", name);

  it("honors a custom SchemaDumper.fkIgnorePattern at call time", () => {
    expect(fk("ignored_fk_astronauts_rockets").isExportNameOnSchemaDump).toBe(true);
    expect(fk("fk_rails_0123456789").isExportNameOnSchemaDump).toBe(false);

    SchemaDumper.fkIgnorePattern = /^ignored_/;
    expect(fk("ignored_fk_astronauts_rockets").isExportNameOnSchemaDump).toBe(false);
    expect(fk("fk_rails_0123456789").isExportNameOnSchemaDump).toBe(true);
  });

  it("stays stable across repeated calls with a g-flagged pattern", () => {
    SchemaDumper.fkIgnorePattern = /^ignored_/g;
    const definition = fk("ignored_fk_astronauts_rockets");
    expect(definition.isExportNameOnSchemaDump).toBe(false);
    expect(definition.isExportNameOnSchemaDump).toBe(false);
  });
});

describe("CheckConstraintDefinition#export_name_on_schema_dump?", () => {
  const chk = (name: string): CheckConstraintDefinition =>
    new CheckConstraintDefinition("trades", "price > 0", name);

  it("honors a custom SchemaDumper.chkIgnorePattern at call time", () => {
    expect(chk("ignored_chk_trades_price").isExportNameOnSchemaDump).toBe(true);
    expect(chk("chk_rails_0123456789").isExportNameOnSchemaDump).toBe(false);

    SchemaDumper.chkIgnorePattern = /^ignored_/;
    expect(chk("ignored_chk_trades_price").isExportNameOnSchemaDump).toBe(false);
    expect(chk("chk_rails_0123456789").isExportNameOnSchemaDump).toBe(true);
  });
});

describe("TableDefinition#remove_column", () => {
  const td = (): TableDefinition => {
    const t = new TableDefinition("astronauts");
    t.string("name");
    t.integer("rocket_id");
    return t;
  };

  it("drops the named column and leaves the rest in order", () => {
    const t = td();
    t.removeColumn("name");
    expect(t.columns.map((c) => c.name)).toEqual(["id", "rocket_id"]);
  });

  it("is a no-op for a column that was never defined", () => {
    const t = td();
    t.removeColumn("nonexistent");
    expect(t.columns.map((c) => c.name)).toEqual(["id", "name", "rocket_id"]);
  });
});

describe("ReferenceDefinition#add", () => {
  type Call = [string, ...unknown[]];

  const recorder = (): { calls: Call[]; connection: ReferenceDefinitionConnection } => {
    const calls: Call[] = [];
    return {
      calls,
      connection: {
        async addColumn(tableName, columnName, type, options) {
          calls.push(["addColumn", tableName, columnName, type, options]);
        },
        async addIndex(tableName, columns, options) {
          calls.push(["addIndex", tableName, columns, options]);
        },
        async addForeignKey(fromTable, toTable, options) {
          calls.push(["addForeignKey", fromTable, toTable, options]);
        },
      },
    };
  };

  it("adds the column, index and foreign key in Rails' order", async () => {
    const { calls, connection } = recorder();
    await new ReferenceDefinition("user", { foreignKey: true }).add("taggings", connection);

    expect(calls.map((c) => c[0])).toEqual(["addColumn", "addIndex", "addForeignKey"]);
    expect(calls[0].slice(1, 4)).toEqual(["taggings", "user_id", "bigint"]);
    expect(calls[1][2]).toEqual(["user_id"]);
    expect(calls[2][2]).toBe("users");
    expect(calls[2][3]).toMatchObject({ column: "user_id" });
  });

  it("adds a polymorphic reference type-column first and names its index", async () => {
    const { calls, connection } = recorder();
    await new ReferenceDefinition("taggable", { polymorphic: true }).add("taggings", connection);

    expect(calls.map((c) => c[2])).toEqual([
      "taggable_type",
      "taggable_id",
      ["taggable_type", "taggable_id"],
    ]);
    expect(calls[2][3]).toMatchObject({ name: "index_taggings_on_taggable" });
  });

  it("merges an index options hash", async () => {
    const { calls, connection } = recorder();
    await new ReferenceDefinition("user", { index: { unique: true, name: "my_index" } }).add(
      "taggings",
      connection,
    );

    expect(calls[1][3]).toMatchObject({ unique: true, name: "my_index" });
  });

  it("passes ifNotExists through to the index and foreign key options", async () => {
    const { calls, connection } = recorder();
    await new ReferenceDefinition("user", { foreignKey: true, ifNotExists: true }).add(
      "taggings",
      connection,
    );

    expect(calls[1][3]).toMatchObject({ ifNotExists: true });
    expect(calls[2][3]).toMatchObject({ ifNotExists: true });
  });

  it("merges a polymorphic options hash into the type column", async () => {
    const { calls, connection } = recorder();
    await new ReferenceDefinition("taggable", {
      polymorphic: { null: false },
      index: false,
    }).add("taggings", connection);

    expect(calls[0][2]).toBe("taggable_type");
    expect(calls[0][4]).toMatchObject({ null: false });
  });

  it("skips the index when index is false", async () => {
    const { calls, connection } = recorder();
    await new ReferenceDefinition("user", { index: false }).add("taggings", connection);

    expect(calls.map((c) => c[0])).toEqual(["addColumn"]);
  });
});

describe("ReferenceDefinition#foreign_table_name", () => {
  const originalPluralize = Base.pluralizeTableNames;

  afterEach(() => {
    Base.pluralizeTableNames = originalPluralize;
  });

  it("targets the singular table when Base.pluralizeTableNames is false", () => {
    Base.pluralizeTableNames = false;
    const ref = new ReferenceDefinition("user", { foreignKey: true, index: false });
    const td = new TableDefinition("posts", { id: false });
    ref.addTo(td);
    expect(td.foreignKeys[0].toTable).toBe("user");
  });

  it("still honors an explicit toTable when pluralizeTableNames is false", () => {
    Base.pluralizeTableNames = false;
    const ref = new ReferenceDefinition("author", {
      foreignKey: { toTable: "accounts" },
      index: false,
    });
    const td = new TableDefinition("posts", { id: false });
    ref.addTo(td);
    expect(td.foreignKeys[0].toTable).toBe("accounts");
  });
});
