import { describe, it, expect } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { fixtures } from "../test-fixtures.js";
import { Firm, Company, Client } from "../test-helpers/models/company.js";
import { registerModel } from "../index.js";

describe("getModelColumns virtual-attribute eager projection", () => {
  const { companies } = fixtures(["companies"]);
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
      firm = (await Firm.includes(":clients")
        .where({ "clients.new_name": "Summit" })
        .last()) as Firm;
    } finally {
      Notifications.unsubscribe(sub);
    }

    const eagerSqls = sqls.filter((sql) => /LEFT OUTER JOIN/i.test(sql));
    expect(eagerSqls.length).toBeGreaterThan(0);
    for (const sql of eagerSqls) expect(sql).not.toContain("metadata");

    expect(firm.id).toBe(companies("first_firm").id);
    const clients = await (firm as Firm & { clients: { toArray(): Promise<unknown[]> } }).clients;
    expect((clients as { id: number }[]).map((c) => c.id)).toEqual([companies("first_client").id]);
  });
});
