/**
 * `CollectionAssociation#find` not-found path. Rails keeps the decision in
 * `find` (collection_association.rb:104-108): `find_by_scan` only scans and
 * returns, then `find` raises through
 * `scope.raise_record_not_found_exception!(args_flatten, result_size,
 * args_flatten.size)` — so a miss on a loaded `inverse_of` collection surfaces
 * a `RecordNotFound` carrying the model name, the primary key, and the
 * association scope's conditions.
 *
 * The public `CollectionProxy#find` reimplements the scan rather than
 * delegating to the association (a separate divergence), so these cover the
 * association instance directly, the way
 * `collection-association-bigint-number-key-match.test.ts` does.
 */
import { describe, it, expect } from "vitest";
import { Base, RecordNotFound } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import "../support/canonical-model-index.js";
import { Firm } from "../test-helpers/models/company.js";

type RecordInternals = {
  _readAttribute(name: string): unknown;
  _associationInstances: Map<string, { find(...args: unknown[]): Promise<Base | Base[] | null> }>;
  clientsOfFirm: { load(): Promise<Base[]> };
};

const internals = (record: Base): RecordInternals => record as unknown as RecordInternals;

describe("CollectionAssociation#find not-found path", () => {
  const { companies } = fixtures(["companies"]);

  async function loadedClientsOfFirm() {
    const firm = (await Firm.find(companies("first_firm").id)) as Base;
    const clients = await internals(firm).clientsOfFirm.load();
    expect(clients.length).toBeGreaterThan(0);
    return {
      assoc: internals(firm)._associationInstances.get("clientsOfFirm")!,
      presentId: Number(internals(clients[0])._readAttribute("id")),
    };
  }

  it("raises RecordNotFound with the scoped message when a single id misses", async () => {
    const { assoc } = await loadedClientsOfFirm();

    const error = await assoc.find(245324523).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordNotFound);
    const notFound = error as RecordNotFound;
    expect(notFound.model).toBe("Client");
    expect(notFound.primaryKey).toBe("id");
    expect(notFound.message).toContain("Couldn't find Client with 'id'=245324523");
  });

  it("raises RecordNotFound reporting found/expected counts when one of several ids misses", async () => {
    const { assoc, presentId } = await loadedClientsOfFirm();

    const error = await assoc.find([presentId, 245324523]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordNotFound);
    expect((error as RecordNotFound).message).toContain("(found 1 results, but was looking for 2)");
  });

  it("raises RecordNotFound when no id is passed", async () => {
    const { assoc } = await loadedClientsOfFirm();

    const error = await assoc.find().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordNotFound);
    expect((error as RecordNotFound).message).toBe("Couldn't find Client without an ID");
  });
});
