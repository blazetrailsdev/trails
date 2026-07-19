import { describe, it, expect } from "vitest";
import { IntegerType } from "@blazetrails/activemodel";
import { Table } from "@blazetrails/arel";
import { Company, Firm } from "../test-helpers/models/company.js";
import { PredicateBuilder } from "./predicate-builder.js";

// trails-specific regression guard (no Rails counterpart): Base.predicateBuilder
// is now TableMetadata-backed, and that metadata is bound to the class. The memo
// must be an OWN property so an STI subclass (same table_name) does not inherit
// the parent's builder via the prototype chain — that would resolve
// associations/aggregates against the parent klass. Rails avoids this
// structurally by resetting @predicate_builder in `inherited` (core.rb:422-425).
describe("Base.predicateBuilder STI memoization", () => {
  it("does not leak the parent's builder to an STI subclass", () => {
    // Warm the parent first: with a prototype-chain memo, this instance would
    // then be returned for the subclass too.
    const companyPb = Company.predicateBuilder;
    const firmPb = Firm.predicateBuilder;
    expect(firmPb).not.toBe(companyPb);
    // Idempotent per class.
    expect(Company.predicateBuilder).toBe(companyPb);
    expect(Firm.predicateBuilder).toBe(firmPb);
  });
});

// trails-specific regression guard (no Rails counterpart): Rails re-roots the
// builder's `table` per association, so `build_bind_attribute` always sees the
// right type caster. trails instead threads the attribute's own relation through
// the shared type cascade — without it, a joined/aliased out-of-range equality
// falls through to the identity fallback and silently binds a raw value the
// column cannot hold, instead of collapsing to `1=0`.
describe("PredicateBuilder positive-equality bind typing", () => {
  it("types a joined/aliased equality bind via the relation type caster", () => {
    const int8 = new IntegerType({ limit: 8 });
    // Only the attribute's relation knows the column type; the builder's own
    // table answers undefined, which is the identity-fallback trap.
    const relation = { typeForAttribute: () => int8 };
    const table = new Table("posts", { typeCaster: { typeForAttribute: () => undefined } });
    const builder = new PredicateBuilder(table);
    const attribute = Object.assign(table.get("author_id"), { relation });

    const bind = builder.buildBindAttribute(attribute.name, 2n ** 63n, relation);
    expect(bind.isUnboundable()).toBe(1);
    // The narrow this.table-only lookup finds nothing → identity → not detected.
    expect(builder.buildBindAttribute(attribute.name, 2n ** 63n).isUnboundable()).toBe(false);
  });
});
