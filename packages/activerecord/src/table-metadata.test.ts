import { describe, it, expect, beforeAll } from "vitest";
import { StringType } from "@blazetrails/activemodel";
import { Table } from "@blazetrails/arel";
import { Base } from "./index.js";
import { TableMetadata } from "./table-metadata.js";
import { setupFixtures } from "./test-helpers/fixtures.js";

class AuditLog extends Base {
  static override _tableName = "audit_logs";
  static {
    this.attribute("message", "string");
    this.attribute("developer_id", "integer");
  }
}

class AuditRequiredDeveloper extends Base {
  static override _tableName = "developers";
  static {
    this.attribute("name", "string");
  }
}

describe("TableMetadataTest", () => {
  setupFixtures();
  beforeAll(async () => {
    await AuditLog.loadSchema();
    await AuditRequiredDeveloper.loadSchema();
  });

  it("#associated_table creates the right type caster for joined table with different association name", () => {
    const baseTableMetadata = new TableMetadata(AuditRequiredDeveloper, new Table("developers"));

    const associatedTableMetadata = baseTableMetadata.associatedTable("audit_logs");

    expect(associatedTableMetadata.arelTable.typeForAttribute("message")).toBeInstanceOf(
      StringType,
    );
  });
});
