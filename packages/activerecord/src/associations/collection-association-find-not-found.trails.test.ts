import { describe, it, expect } from "vitest";
import { Base, RecordNotFound } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import "../support/canonical-model-index.js";
import { Firm } from "../test-helpers/models/company.js";

type RecordInternals = {
  _readAttribute(name: string): unknown;
  clientsOfFirm: {
    load(): Promise<Base[]>;
    find(...args: unknown[]): Promise<Base | Base[]>;
  };
};

const internals = (record: Base): RecordInternals => record as unknown as RecordInternals;

describe("CollectionAssociation#find not-found path", () => {
  const { companies } = fixtures(["companies"]);

  async function loadedClientsOfFirm() {
    const firm = (await Firm.find(companies("first_firm").id)) as Base;
    const proxy = internals(firm).clientsOfFirm;
    const clients = await proxy.load();
    expect(clients.length).toBeGreaterThan(0);
    return {
      proxy,
      presentId: Number(internals(clients[0])._readAttribute("id")),
      presentIds: clients.map((c) => Number(internals(c)._readAttribute("id"))),
    };
  }

  it("raises RecordNotFound with the scoped message when a single id misses", async () => {
    const { proxy } = await loadedClientsOfFirm();

    const error = await proxy.find(245324523).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordNotFound);
    const notFound = error as RecordNotFound;
    expect(notFound.model).toBe("Client");
    expect(notFound.primaryKey).toBe("id");
    expect(notFound.message).toContain("Couldn't find Client with 'id'=245324523");
  });

  it("raises RecordNotFound reporting found/expected counts when one of several ids misses", async () => {
    const { proxy, presentId } = await loadedClientsOfFirm();

    const error = await proxy.find([presentId, 245324523]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordNotFound);
    expect((error as RecordNotFound).message).toContain("(found 1 results, but was looking for 2)");
  });

  it("matches a numeric PK against a string id, the way Rails' to_s comparison does", async () => {
    const { proxy, presentId } = await loadedClientsOfFirm();

    const found = (await proxy.find(String(presentId))) as Base;
    expect(Number(internals(found)._readAttribute("id"))).toBe(presentId);
  });

  it("flattens a nested array argument recursively, the way Ruby's Array#flatten does", async () => {
    const { proxy, presentIds } = await loadedClientsOfFirm();
    expect(presentIds.length).toBeGreaterThan(1);

    const found = (await proxy.find([presentIds])) as Base[];
    expect(found.map((r) => Number(internals(r)._readAttribute("id"))).sort()).toEqual(
      [...presentIds].sort(),
    );
  });

  it("raises RecordNotFound when no id is passed", async () => {
    const { proxy } = await loadedClientsOfFirm();

    const error = await proxy.find().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordNotFound);
    expect((error as RecordNotFound).message).toBe("Couldn't find Client without an ID");
  });
});
