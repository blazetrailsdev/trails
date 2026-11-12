import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeAll } from "vitest";
import { Company, Firm, Client } from "../../models/company.js";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";

type Rec = Record<string, unknown>;

async function targetId(reader: unknown): Promise<unknown> {
  return ((await reader) as Rec | null)?.id;
}

describe("BelongsToAssociationsTest", () => {
  const { companies } = fixtures(["companies"]);

  beforeAll(async () => {
    constSet(TopLevel, "Company", Company);
    constSet(TopLevel, "Firm", Firm);
    constSet(TopLevel, "Client", Client);
    Company.inheritanceColumn = "type";
    constSet(TopLevel, "Firm", Firm);
    constSet(TopLevel, "Client", Client);
    await Company.loadSchema();
  });

  it("reassigning the parent id updates the object", async () => {
    const client = companies("second_client") as unknown as Client & Rec;
    const firstFirmId = (companies("first_firm") as unknown as Rec).id;
    const anotherFirmId = (companies("another_firm") as unknown as Rec).id;

    await client.firm;
    await client.firmWithCondition;
    const firmProxy = client.association("firm");
    const firmWithConditionProxy = client.association("firmWithCondition");

    expect(firmProxy.isStaleTarget()).toBe(false);
    expect(firmWithConditionProxy.isStaleTarget()).toBe(false);
    expect(await targetId(client.firm)).toBe(firstFirmId);
    expect(await targetId(client.firmWithCondition)).toBe(firstFirmId);

    client.client_of = anotherFirmId as bigint;

    expect(firmProxy.isStaleTarget()).toBe(true);
    expect(firmWithConditionProxy.isStaleTarget()).toBe(true);
    expect(await targetId(client.firm)).toBe(anotherFirmId);
    expect(await targetId(client.firmWithCondition)).toBe(anotherFirmId);
  });

  it("loadTarget keeps a nil target loaded under a nil stale state, as load_target does (association.rb:190); the reader reloads it (singular_association.rb:10)", async () => {
    const client = new Client() as unknown as Client & Rec;
    const firstFirmId = (companies("first_firm") as unknown as Rec).id;
    const firmProxy = client.association("firm");

    expect(await firmProxy.loadTarget()).toBeNull();

    client.client_of = firstFirmId as bigint;

    expect(firmProxy.isStaleTarget()).toBe(true);
    expect(await firmProxy.loadTarget()).toBeNull();
    expect(await targetId(client.firm)).toBe(firstFirmId);
  });

  it("loadTarget re-queries a stale target instead of returning the cache", async () => {
    const client = companies("second_client") as unknown as Client & Rec;
    const firstFirmId = (companies("first_firm") as unknown as Rec).id;
    const anotherFirmId = (companies("another_firm") as unknown as Rec).id;
    const firmProxy = client.association("firm");

    expect(await targetId(firmProxy.loadTarget())).toBe(firstFirmId);

    client.client_of = anotherFirmId as bigint;

    expect(firmProxy.isStaleTarget()).toBe(true);
    expect(await targetId(firmProxy.loadTarget())).toBe(anotherFirmId);
  });
});
