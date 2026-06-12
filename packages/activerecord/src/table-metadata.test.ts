import { describe, it, expect, beforeAll } from "vitest";
import { StringType } from "@blazetrails/activemodel";
import { Table } from "@blazetrails/arel";
import { Base } from "./index.js";
import { TableMetadata } from "./table-metadata.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";

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
  setupHandlerSuite();
  beforeAll(async () => {
    await defineSchema({
      developers: TEST_SCHEMA.developers,
      audit_logs: TEST_SCHEMA.audit_logs,
    });
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
