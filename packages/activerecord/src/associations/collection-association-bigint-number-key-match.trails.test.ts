import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import "../support/canonical-model-index.js";
import { Firm } from "../test-helpers/models/company.js";

type CollectionProxyLike = {
  load(): Promise<Base[]>;
  find(...args: unknown[]): Promise<Base | Base[]>;
};

type RecordInternals = {
  _attributes: { writeCastValue(name: string, value: unknown): void };
  _readAttribute(name: string): unknown;
  _associationInstances: Map<string, { find(...args: unknown[]): Promise<Base | Base[] | null> }>;
  clientsOfFirm: CollectionProxyLike;
};

const internals = (record: Base): RecordInternals => record as unknown as RecordInternals;

describe("CollectionAssociation BigInt PK / number find(id) key match", () => {
  const { companies } = fixtures(["companies"]);

  async function loadFirmWithBigIntTargetPk(): Promise<{
    firm: Base;
    target: Base;
    numberId: number;
  }> {
    const firm = (await Firm.find(companies("first_firm").id)) as Base;
    const clients = await internals(firm).clientsOfFirm.load();
    expect(clients.length).toBeGreaterThan(0);

    const target = clients[0];
    const numberId = Number(internals(target)._readAttribute("id"));
    internals(target)._attributes.writeCastValue("id", BigInt(numberId));
    return { firm, target, numberId };
  }

  it("finds a loaded record via CollectionAssociation#findByScan when its in-memory PK is a BigInt and the id is a number", async () => {
    const { firm, numberId } = await loadFirmWithBigIntTargetPk();

    const assoc = internals(firm)._associationInstances.get("clientsOfFirm")!;
    const found = (await assoc.find(numberId)) as Base;
    expect(Number(internals(found)._readAttribute("id"))).toBe(numberId);
  });

  it("finds a loaded record via the collection proxy find(id) when its in-memory PK is a BigInt and the id is a number", async () => {
    const { firm, numberId } = await loadFirmWithBigIntTargetPk();

    const found = (await internals(firm).clientsOfFirm.find(numberId)) as Base;
    expect(Number(internals(found)._readAttribute("id"))).toBe(numberId);
  });
});
