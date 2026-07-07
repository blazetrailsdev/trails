/**
 * Relation-construction hot-path benchmark for the per-model prototype-carrier
 * delegation mechanism (story
 * `delegation-generated-methods-per-model-prototype-carrier`).
 *
 * Acceptance criterion: routing relation construction through a per-model
 * `Relation` subclass (`relationClassFor`) must not regress build throughput.
 * The carrier is the subclass *prototype* — created once per model — so no
 * per-instance `Object.setPrototypeOf` runs on the hot path (the V8 megamorphic
 * deopt the parent story flagged as the risk of the naive port).
 *
 * The two cases below isolate exactly that: constructing the shared base
 * `Relation` vs. constructing the per-model subclass. If the subclass path were
 * megamorphic it would show up as a large gap here.
 *
 * Not part of the CI test run (vitest's test `include` globs match `*.test.ts`,
 * not `*.bench.ts`). Run manually with `pnpm vitest bench delegation.bench`.
 */
import { bench, describe } from "vitest";
import { Relation } from "../relation.js";
import { relationClassFor } from "./delegation.js";
import { Post } from "../test-helpers/models/post.js";

// Warm the per-model subclass so both cases benchmark steady-state `new`.
const PerModelRelation = relationClassFor(Post);

describe("relation construction hot path", () => {
  bench("new (shared Relation)", () => {
    void new (Relation as unknown as new (m: unknown) => unknown)(Post);
  });

  bench("new (per-model subclass carrier)", () => {
    void new (PerModelRelation as unknown as new (m: unknown) => unknown)(Post);
  });
});
