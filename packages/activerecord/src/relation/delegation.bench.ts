import { bench, describe } from "vitest";
import { Relation } from "../relation.js";
import { relationClassFor } from "./delegation.js";
import { Post } from "../test-helpers/models/post.js";

const PerModelRelation = relationClassFor(Post);

describe("relation construction hot path", () => {
  bench("new (shared Relation)", () => {
    void new (Relation as unknown as new (m: unknown) => unknown)(Post);
  });

  bench("new (per-model subclass carrier)", () => {
    void new (PerModelRelation as unknown as new (m: unknown) => unknown)(Post);
  });
});
