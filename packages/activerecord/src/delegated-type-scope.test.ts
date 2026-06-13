import { describe, it, expect } from "vitest";
import { Base } from "./base.js";
import { delegatedType } from "./index.js";

// Rails' `delegated_type(role, types:, **options)` forwards `options[:scope]`
// as the polymorphic belongs_to scope proc. trails' belongsTo takes the scope
// via `options.scope`, so it must reach the generated reflection.
describe("delegatedType :scope option", () => {
  it("forwards the scope proc to the generated belongsTo reflection", () => {
    const scope = (rel: any) => rel.order("created_at");

    class Entry extends Base {
      static {
        this.tableName = "entries";
      }
    }
    delegatedType(Entry as unknown as typeof Base, "entryable", {
      types: ["Message", "Comment"],
      scope,
    });

    const reflection = (
      Entry as unknown as { _reflectOnAssociation(name: string): any }
    )._reflectOnAssociation("entryable");
    expect(reflection.scope).toBe(scope);
  });
});
