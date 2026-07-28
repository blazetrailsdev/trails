import { describe, it, expect } from "vitest";
import { ValueType } from "@blazetrails/activemodel";
import { Base } from "./index.js";
import { fixtures } from "./test-fixtures.js";

describe("TypesTest", () => {
  fixtures({});
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
