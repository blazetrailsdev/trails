import { describe, it, expect, beforeAll } from "vitest";
import { ValueType } from "@blazetrails/activemodel";
import { Base } from "./index.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";

describe("TypesTest", () => {
  setupHandlerSuite();
  beforeAll(async () => {
    await defineSchema({ posts: TEST_SCHEMA.posts });
  });

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
