import { describe, it, expect, vi } from "vitest";

import { Face } from "../test-helpers/models/face.js";
import { Human } from "../test-helpers/models/human.js";
import { registerModel } from "../associations.js";
import { PartialQuery, Substitute } from "../statement-cache.js";
import { fixtures } from "../test-fixtures.js";
import type { Base } from "../base.js";

interface AssociationLike {
  target: unknown;
}

const association = (record: Base, name: string): AssociationLike =>
  (record as unknown as { association(name: string): AssociationLike }).association(name);

describe("Association#find_target statement-cache execute block", () => {
  const { faces } = fixtures(["faces", "humans"]);

  it("sets the inverse instance and strict loading on each record it instantiates", async () => {
    registerModel(Face);
    registerModel(Human);
    const face = await Face.find(faces("trusting").id);
    face.strictLoadingBang(false, { mode: "n_plus_one_only" });

    const human = await (
      association(face, "human") as unknown as { loadTarget(): Promise<Base | null> }
    ).loadTarget();

    expect(human).not.toBeNull();
    expect(association(human!, "face").target).toBe(face);
    expect(human!.strictLoadingMode()).toBe("n_plus_one_only");
  });

  it("passes async: through to StatementCache#execute", async () => {
    registerModel(Face);
    registerModel(Human);
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
