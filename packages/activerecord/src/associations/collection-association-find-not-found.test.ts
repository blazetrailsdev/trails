/**
 * `CollectionAssociation#find` misses on the loaded `inverse_of` path.
 *
 * Rails keeps the not-found decision in `find`, not in the scan helper
 * (collection_association.rb:104-111): `find_by_scan` only scans, and a miss is
 * routed through `scope.raise_record_not_found_exception!` so the error is a
 * `RecordNotFound` carrying the association scope's WHERE conditions, the model
 * name, the primary key, and the found/expected counts. trails' `findByScan`
 * used to raise a bare `Error` with a simplified message instead.
 *
 * `CollectionProxy#find` has its own scan and already raised faithfully, so
 * this exercises the association object directly (the path the proxy's
 * `delete`/`destroy` id coercion also reaches).
 */
import { describe, it, expect } from "vitest";
import { Base, RecordNotFound } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import "../support/canonical-model-index.js";
import { Firm } from "../test-helpers/models/company.js";

type RecordInternals = {
  _associationInstances: Map<string, { find(...args: unknown[]): Promise<Base | Base[] | null> }>;
  clientsOfFirm: { load(): Promise<Base[]> };
};

const internals = (record: Base): RecordInternals => record as unknown as RecordInternals;

describe("CollectionAssociation#find not-found on the loaded inverse_of path", () => {
  const { companies } = fixtures(["companies", "accounts"]);

  // `clientsOfFirm` declares `inverse_of`, so a loaded collection is scanned in
  // memory (never re-queried) by `find(id)`.
  async function loadedClientsOfFirm(): Promise<{
    assoc: { find(...args: unknown[]): Promise<Base | Base[] | null> };
  }> {
    const firm = (await Firm.find(companies("first_firm").id)) as Base;
    await internals(firm).clientsOfFirm.load();
    return { assoc: internals(firm)._associationInstances.get("clientsOfFirm")! };
  }

  it("raises RecordNotFound with the scoped message for a single missing id", async () => {
    const { assoc } = await loadedClientsOfFirm();

    const error = (await assoc.find(245324523).catch((e: unknown) => e)) as RecordNotFound;
    expect(error).toBeInstanceOf(RecordNotFound);
    expect(error.model).toBe("Client");
    expect(error.primaryKey).toBe("id");
    expect(error.message).toContain("Couldn't find Client with 'id'=245324523");
    expect(error.message).toContain("WHERE");
  });

  it("raises RecordNotFound with the found/expected counts for missing ids", async () => {
    const { assoc } = await loadedClientsOfFirm();

    const error = (await assoc
      .find(8432342, 2390102913)
      .catch((e: unknown) => e)) as RecordNotFound;
    expect(error).toBeInstanceOf(RecordNotFound);
    expect(error.message).toContain("Couldn't find all Clients with 'id': (8432342, 2390102913)");
    expect(error.message).toContain("(found 0 results, but was looking for 2)");
  });

  it("wraps the single-id result when the first argument is an array", async () => {
    const firm = (await Firm.find(companies("first_firm").id)) as Base;
    const clients = await internals(firm).clientsOfFirm.load();
    const assoc = internals(firm)._associationInstances.get("clientsOfFirm")!;
    const id = (clients[0] as unknown as { _readAttribute(n: string): unknown })._readAttribute(
      "id",
    );

    const found = await assoc.find([id]);
    expect(Array.isArray(found)).toBe(true);
    expect((found as Base[])[0]).toBe(clients[0]);
  });

  it("raises RecordNotFound when no ids are passed", async () => {
    const { assoc } = await loadedClientsOfFirm();

    const error = (await assoc.find().catch((e: unknown) => e)) as RecordNotFound;
    expect(error).toBeInstanceOf(RecordNotFound);
    expect(error.message).toBe("Couldn't find Client without an ID");
    expect(error.model).toBe("Client");
    expect(error.primaryKey).toBe("id");
  });
});
