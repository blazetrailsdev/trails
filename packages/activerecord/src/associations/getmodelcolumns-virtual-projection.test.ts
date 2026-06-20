/**
 * Regression: `getModelColumns` must exclude model-declared virtual attributes
 * (no backing DB column) from the eager-load SELECT projection, regardless of
 * schema-cache warmth.
 *
 * `Company` declares `attribute("metadata", "json")` (company.ts) but the
 * canonical `companies` table has no `metadata` column. Eager-loading
 * `Firm.includes("clients")` (both STI on `companies`) over a *partial* schema
 * — only `companies` defined — previously projected `companies.metadata`,
 * failing the query with `no such column: companies.metadata`. Rails' eager
 * SELECT projects only real table columns.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";
import { Firm, Company, Client } from "../test-helpers/models/company.js";
import { registerModel } from "../index.js";

describe("getModelColumns virtual-attribute eager projection", () => {
  setupHandlerSuite();
  const { companies } = useHandlerFixtures(["companies"]);
  beforeAll(async () => {
    await defineSchema({ companies: TEST_SCHEMA.companies }, { dropExisting: true });
  });
  registerModel(Company);
  registerModel(Firm);
  registerModel(Client);

  it("excludes the virtual metadata column from the eager SELECT and succeeds", async () => {
    const sqls: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: unknown) => {
      sqls.push((event as { payload?: { sql?: string } })?.payload?.sql ?? "");
    });
    let firm: Firm;
    try {
      firm = (await Firm.includes("clients").where({ "clients.newName": "Summit" }).last()) as Firm;
    } finally {
      Notifications.unsubscribe(sub);
    }

    const eagerSqls = sqls.filter((sql) => /LEFT OUTER JOIN/i.test(sql));
    expect(eagerSqls.length).toBeGreaterThan(0);
    for (const sql of eagerSqls) expect(sql).not.toContain("metadata");

    expect(firm.id).toBe(companies("first_firm").id);
    const clients = await (
      firm as Firm & { clients: { toArray(): Promise<unknown[]> } }
    ).clients.toArray();
    expect((clients as { id: number }[]).map((c) => c.id)).toEqual([companies("first_client").id]);
  });
});
