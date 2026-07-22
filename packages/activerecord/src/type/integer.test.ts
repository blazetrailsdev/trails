import { describe, it, expect } from "vitest";
import { IntegerType } from "@blazetrails/activemodel";
import { Base } from "../index.js";
import { Firm } from "../test-helpers/models/company.js";
import { fixtures } from "../test-helpers/fixtures.js";

fixtures({});

describe("IntegerTest", () => {
  it("casting ActiveRecord models", async () => {
    const type = new IntegerType();
    // AR model stringifies to "[object Object]" → parseInt → NaN → null
    const firm = await Firm.create({ name: "Apple" });
    expect(type.cast(firm)).toBeNull();
  });

  it("values which are out of range can be re-assigned", () => {
    class Post extends Base {
      static {
        this.tableName = "posts";
        this.attribute("foo", "integer");
      }
    }
    const model = new Post();
    model.foo = 2147483648;
    model.foo = 1;
    expect(model.foo).toBe(1);
  });
});
