// TS-only unit coverage: the abstract definition getters must read the
// configurable SchemaDumper ignore patterns at call time (Rails'
// export_name_on_schema_dump? reads SchemaDumper.fk_ignore_pattern /
// .chk_ignore_pattern), not a hardcoded copy of the default regex.
import { describe, it, expect, afterEach } from "vitest";
import { ForeignKeyDefinition, CheckConstraintDefinition } from "./schema-definitions.js";
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
