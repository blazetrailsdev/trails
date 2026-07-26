import { describe, it, expect, afterEach } from "vitest";
import {
  ForeignKeyDefinition,
  CheckConstraintDefinition,
  TableDefinition,
} from "./schema-definitions.js";
import { SchemaDumper } from "../../schema-dumper.js";

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
