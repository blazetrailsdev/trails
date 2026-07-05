/**
 * Collection-association in-memory `find` key-type normalization: when a loaded
 * `inverse_of` collection is scanned by `find(id)` (CollectionAssociation
 * `findByScan`), the target PKs are matched against the `find` argument in
 * memory. On the PG bigserial-PK lane node-postgres parses an int8 PK to a JS
 * `BigInt` while the `find(id)` argument is a `number`; `1n` and `1` are
 * distinct JS values and a raw `JSON.stringify` of a `BigInt` throws outright.
 * Without normalization the scan mismatches (or crashes) even though Ruby's
 * width-agnostic `Integer ==` would match. Guards that regression.
 */
import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import "../test-helpers/canonical-model-index.js";
import { Firm } from "../test-helpers/models/company.js";

type RecordInternals = {
  _attributes: { writeCastValue(name: string, value: unknown): void };
  _readAttribute(name: string): unknown;
  _associationInstances: Map<string, { find(...args: unknown[]): Promise<Base | Base[] | null> }>;
};

const internals = (record: Base): RecordInternals => record as unknown as RecordInternals;

describe("CollectionAssociation BigInt PK / number find(id) key match", () => {
  const { companies } = fixtures(["companies"]);

  it("finds a loaded record when its in-memory PK is a BigInt and the id is a number", async () => {
    const firm = (await Firm.find(companies("first_firm").id)) as Base;
    // `clientsOfFirm` declares `inverse_of`, so a loaded CollectionAssociation
    // scans its in-memory target (`findByScan`) instead of re-querying.
    const clients = await (
      firm as unknown as { clientsOfFirm: { load(): Promise<Base[]> } }
    ).clientsOfFirm.load();
    expect(clients.length).toBeGreaterThan(0);

    // Simulate node-postgres parsing an int8 (bigserial) PK to BigInt on the
    // in-memory target; the `find` argument below stays a number.
    const target = clients[0];
    const numberId = Number(internals(target)._readAttribute("id"));
    internals(target)._attributes.writeCastValue("id", BigInt(numberId));

    const assoc = internals(firm)._associationInstances.get("clientsOfFirm")!;
    const found = (await assoc.find(numberId)) as Base;
    expect(Number(internals(found)._readAttribute("id"))).toBe(numberId);
  });
});
