import { describe, it, expect } from "vitest";
import { Base } from "./base.js";

describe("delegatedType :scope option", () => {
  it("forwards the scope proc to the generated belongsTo reflection", () => {
    const scope = (rel: any) => rel.order("created_at");

    class Entry extends Base {
      static {
        this.tableName = "entries";
      }
    }
    Entry.delegatedType("entryable", {
      types: ["Message", "Comment"],
      scope,
    });

    const reflection = (
      Entry as unknown as { _reflectOnAssociation(name: string): any }
    )._reflectOnAssociation("entryable");
    expect(reflection.scope).toBe(scope);
  });
});
