import { bench, describe } from "vitest";
import { Relation } from "../../../lib/relation.js";
import { relationClassFor } from "../../../lib/relation/delegation.js";
import { Post } from "../../models/post.js";

const PerModelRelation = relationClassFor.call(Relation, Post);

describe("relation construction hot path", () => {
  bench("new (shared Relation)", () => {
    void new (Relation as unknown as new (m: unknown) => unknown)(Post);
  });

  bench("new (per-model subclass carrier)", () => {
    void new (PerModelRelation as unknown as new (m: unknown) => unknown)(Post);
  });
});
