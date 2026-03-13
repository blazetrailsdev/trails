import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "./index.js";
import { ModelName } from "./naming.js";
import { CallbackChain } from "./callbacks.js";

describe("ActiveModel", () => {
  // =========================================================================
  // Ported from missing-activemodel-stubs.test.ts
  // =========================================================================

  // ---- Access tests ----
  describe("Access", () => {
    class SliceModel extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.attribute("email", "string");
      }
    }

    it("slice", () => {
      const m = new SliceModel({ name: "Alice", age: 30, email: "a@b.com" });
      const sliced = m.slice("name", "age");
      expect(sliced).toEqual({ name: "Alice", age: 30 });
      expect(sliced.email).toBeUndefined();
    });

    it("slice with array", () => {
      const m = new SliceModel({ name: "Alice", age: 30, email: "a@b.com" });
      const sliced = m.slice(["name", "age"]);
      expect(sliced).toEqual({ name: "Alice", age: 30 });
    });

    it("values_at", () => {
      const m = new SliceModel({ name: "Alice", age: 30, email: "a@b.com" });
      expect(m.valuesAt("name", "age")).toEqual(["Alice", 30]);
    });

    it("values_at with array", () => {
      const m = new SliceModel({ name: "Alice", age: 30, email: "a@b.com" });
      expect(m.valuesAt(["name", "age"])).toEqual(["Alice", 30]);
    });
  });
});
