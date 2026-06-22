/**
 * Mirrors vendor/rails/activerecord/test/cases/associations/belongs_to_associations_test.rb
 *
 * Guards SingularAssociation#reader's stale-target reload: Rails
 * (singular_association.rb:10-13) reloads a loaded belongs_to/has_one target
 * when the owner's foreign key changes after load (`!loaded? || stale_target?`).
 * Before the fix, the reader returned the stale cached target because it short
 * circuited on `loaded?`. Uses the canonical `Client`/`Firm` STI models and the
 * `companies` fixtures — no `defineSchema`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, enableSti, registerSubclass } from "../index.js";
import { Company, Firm, Client } from "../test-helpers/models/company.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";

type Rec = Record<string, unknown>;

async function targetId(reader: unknown): Promise<unknown> {
  return ((await reader) as Rec | null)?.id;
}

describe("BelongsToAssociationsTest", () => {
  const { companies } = useHandlerFixtures(["companies"]);

  beforeAll(async () => {
    registerModel(Company);
    registerModel(Firm);
    registerModel(Client);
    enableSti(Company);
    registerSubclass(Firm);
    registerSubclass(Client);
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

    client.client_of = anotherFirmId;

    expect(firmProxy.isStaleTarget()).toBe(true);
    expect(firmWithConditionProxy.isStaleTarget()).toBe(true);
    expect(await targetId(client.firm)).toBe(anotherFirmId);
    expect(await targetId(client.firmWithCondition)).toBe(anotherFirmId);
  });
});
