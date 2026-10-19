import { describe, it, expect } from "vitest";
import { include } from "@blazetrails/activesupport";

import { Attributes } from "./attributes.js";
import { Model } from "./model.js";

type DynProps = Record<string, unknown>;

describe("ActiveModel::API#initialize seats included modules", () => {
  it("does not call init_internals, which only ActiveRecord::Core does", () => {
    let calls = 0;
    class Person extends Model {
      initInternals(): void {
        calls++;
      }
    }

    new Person();
    expect(calls).toBe(0);
  });

  it("runs Attributes#initialize ahead of assign_attributes", () => {
    const seen: unknown[] = [];
    class Person extends Model {
      static {
        include(this, Attributes);
        (this as unknown as { attribute(name: string, type: string): void }).attribute(
          "name",
          "string",
        );
      }
      assignAttributes(newAttributes: unknown): void {
        seen.push((this as unknown as { _attributes: unknown })._attributes != null);
        super.assignAttributes(newAttributes);
      }
    }

    const person = new Person({ name: "bob" });
    expect(seen).toEqual([true]);
    expect((person as unknown as DynProps).name).toBe("bob");
  });
});
