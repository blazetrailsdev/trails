import { describe, it, expect } from "vitest";
import { IntegerType } from "@blazetrails/activemodel";
import { Base } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";

describe("IntegerTest", () => {
  it("casting ActiveRecord models", () => {
    const type = new IntegerType();
    const model = new Base();
    expect(type.cast(model)).toBeNull();
  });

  it("values which are out of range can be re-assigned", () => {
    const adapter = createTestAdapter();
    class Post extends Base {
      static {
        this.tableName = "posts";
        this.attribute("foo", "integer");
        this.adapter = adapter;
      }
    }
    const model = new Post();
    model.foo = 2147483648;
    model.foo = 1;
    expect(model.foo).toBe(1);
  });
});
