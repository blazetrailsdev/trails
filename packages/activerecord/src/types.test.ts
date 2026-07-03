import { describe, it, expect } from "vitest";
import { ValueType } from "@blazetrails/activemodel";
import { Base } from "./index.js";
import { setupFixtures } from "./test-helpers/fixtures.js";

describe("TypesTest", () => {
  setupFixtures();
  it("attributes which are invalid for database can still be reassigned", async () => {
    const TypeWhichCannotGoToTheDatabase = class extends ValueType {
      override serialize(): unknown {
        throw new Error("cannot serialize");
      }
    };
    const klass = class extends Base {
      static {
        this.tableName = "posts";
        this.attribute("foo", new TypeWhichCannotGoToTheDatabase());
      }
    };
    await klass.loadSchema();

    const model = new klass() as any;
    model.foo = "foo";
    model.foo = "bar";

    expect(model.foo).toBe("bar");
  });
});
