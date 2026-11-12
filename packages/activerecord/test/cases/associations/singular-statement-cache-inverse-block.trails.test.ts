import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { describe, it, expect, vi } from "vitest";

import { Face } from "../../models/face.js";
import { Human } from "../../models/human.js";
import { PartialQuery, Substitute } from "../../../lib/statement-cache.js";
import { fixtures } from "../../support/use-fixtures.js";
import type { Base } from "../../../lib/base.js";

interface AssociationLike {
  target: unknown;
}

const association = (record: Base, name: string): AssociationLike =>
  (record as unknown as { association(name: string): AssociationLike }).association(name);

describe("Association#find_target statement-cache execute block", () => {
  const { faces } = fixtures(["faces", "humans"]);

  it("sets the inverse instance and strict loading on each record it instantiates", async () => {
    constSet(TopLevel, "Face", Face);
    constSet(TopLevel, "Human", Human);
    const face = await Face.find(faces("trusting").id);
    face.strictLoadingBang(false, { mode: "n_plus_one_only" });

    const human = await (
      association(face, "human") as unknown as { loadTarget(): Promise<Base | null> }
    ).loadTarget();

    expect(human).not.toBeNull();
    expect(association(human!, "face").target).toBe(face);
    expect(human!.strictLoadingMode()).toBe("n_plus_one_only");
  });

  it("does not enter with_connection while association_scope_cache holds its own", async () => {
    constSet(TopLevel, "Face", Face);
    constSet(TopLevel, "Human", Human);
    const face = await Face.find(faces("trusting").id);
    const pool = (Human as unknown as typeof Base).connectionPool();
    pool.releaseConnection();
    const original = pool.checkout.bind(pool);
    let pending = 0;
    let overlapped = false;
    const checkout = vi.spyOn(pool, "checkout").mockImplementation(async (...args) => {
      if (pending > 0) overlapped = true;
      pending += 1;
      try {
        return await original(...args);
      } finally {
        pending -= 1;
      }
    });

    try {
      await (
        association(face, "human") as unknown as { loadTarget(): Promise<Base | null> }
      ).loadTarget();

      expect(checkout).toHaveBeenCalled();
      expect(overlapped).toBe(false);
      expect(association(face, "human").target).toBeInstanceOf(Human);
    } finally {
      checkout.mockRestore();
    }
  });

  it("passes async: through to StatementCache#execute", async () => {
    constSet(TopLevel, "Face", Face);
    constSet(TopLevel, "Human", Human);
    const face = await Face.find(faces("trusting").id);
    const klass = Human as unknown as typeof Base;
    const findBySql = vi.spyOn(klass, "findBySql");
    const asyncFindBySql = vi.spyOn(klass, "asyncFindBySql");

    try {
      await (
        association(face, "human") as unknown as { asyncLoadTarget(): Promise<null> }
      ).asyncLoadTarget();

      expect(asyncFindBySql).toHaveBeenCalledTimes(1);
      expect(asyncFindBySql.mock.calls[0][2]).toEqual({ preparable: true, allowRetry: false });
      expect(findBySql).not.toHaveBeenCalled();
      expect(association(face, "human").target).toBeInstanceOf(Human);
    } finally {
      findBySql.mockRestore();
      asyncFindBySql.mockRestore();
    }
  });
});

describe("StatementCache::PartialQuery#sql_for", () => {
  it("shifts each substituted value off the binds it is given", () => {
    const binds = [1, 2];
    const sql = new PartialQuery(["a = ", new Substitute(), " AND b = ", new Substitute()]).sqlFor(
      binds,
      { quote: (value: unknown) => String(value) },
    );

    expect(sql).toBe("a = 1 AND b = 2");
    expect(binds).toEqual([]);
  });
});
