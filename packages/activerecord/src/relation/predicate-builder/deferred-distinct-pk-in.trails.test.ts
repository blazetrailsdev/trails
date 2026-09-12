import { describe, it, expect } from "vitest";
import { Table, Nodes } from "@blazetrails/arel";
import { WhereClause } from "../where-clause.js";
import { DeferredIdsIn, DeferredIdsNotIn } from "./deferred-distinct-pk-in.js";

describe("DeferredIdsNotIn inversion (trails)", () => {
  const t = new Table("posts");

  function marker(): DeferredIdsNotIn {
    const attribute = t.get("id");
    const inlineSubquery = new Nodes.SqlLiteral("SELECT id FROM posts");
    const literalIds = { ids: () => Promise.resolve([1, 2]) };
    const innerRelation = { ids: () => Promise.resolve([3, 4]) };
    return new DeferredIdsNotIn(attribute, inlineSubquery, [literalIds, innerRelation]);
  }

  it("inverting a WhereClause containing the marker preserves the deferred ids", () => {
    const original = marker();
    const inverted = new WhereClause([original]).invert().predicates[0];
    expect(inverted).toBeInstanceOf(DeferredIdsIn);
    const invertedMarker = inverted as DeferredIdsIn;
    expect(invertedMarker.innerRelations).toBe(original.innerRelations);
    expect(invertedMarker.left).toBe(original.left);
    expect(invertedMarker.right).toBe(original.right);
  });

  it("double inversion round-trips back to the excluding marker", () => {
    const original = marker();
    const roundTripped = original.invert().invert();
    expect(roundTripped).toBeInstanceOf(DeferredIdsNotIn);
    expect(roundTripped.innerRelations).toBe(original.innerRelations);
  });
});
