/**
 * Collection-association in-memory `find` key-type normalization. When a loaded
 * `inverse_of` collection is scanned by `find(id)`, the target PKs are matched
 * against the `find` argument in memory. On the PG bigserial-PK lane
 * node-postgres parses an int8 PK to a JS `BigInt` while the `find(id)` argument
 * is a `number`; `1n` and `1` are distinct JS values even though Ruby's
 * width-agnostic `Integer ==` matches them.
 *
 * Two scan implementations exist: `CollectionProxy#find` (the public path) keys
 * both sides through `String(...)`, so it was already width-agnostic — the
 * second test pins that. The association-level `CollectionAssociation#findByScan`
 * keyed target PKs through a raw `JSON.stringify`, which *throws* on a BigInt
 * (`Do not know how to serialize a BigInt`) and mismatches a BigInt PK against a
 * number id — the first test guards that fix.
 */
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

  // Force the first loaded `clientsOfFirm` target PK to BigInt (as if int8
  // bigserial via node-postgres) and return its equal-valued number id.
  async function loadFirmWithBigIntTargetPk(): Promise<{
    firm: Base;
    target: Base;
    numberId: number;
  }> {
    const firm = (await Firm.find(companies("first_firm").id)) as Base;
    // `clientsOfFirm` declares `inverse_of`, so a loaded collection is scanned
    // in memory (never re-queried) by `find(id)`.
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
