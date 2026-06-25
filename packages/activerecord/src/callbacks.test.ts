/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import { throwAbort } from "@blazetrails/activesupport";

import { defineSchema, type Schema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { ContextualCallbacksDeveloper } from "./test-helpers/models/contextual-callbacks-developer.js";

// Union of every table referenced by the CallbacksTest describe blocks below.
// Overlapping tables share a consistent column shape, so one up-front schema
// covers all blocks (transactional fixtures roll back rows between tests).
const TEST_SCHEMA: Schema = {
  topics: { title: "string" },
  animals: { name: "string", type: "string" },
  cb_posts: { title: "string" },
  trackeds: { name: "string" },
  guardeds: { name: "string" },
  developers: canonicalSchema.developers,
};

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema(TEST_SCHEMA);
});

// ==========================================================================
// CallbacksTest — targets callbacks_test.rb
// ==========================================================================
describe("CallbacksTest", () => {
  it("create", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const log: string[] = [];
    Topic.beforeCreate(function (this: any) {
      log.push("before_create");
    });
    Topic.afterCreate(function (this: any) {
      log.push("after_create");
    });
    await Topic.create({ title: "a" });
    expect(log).toContain("before_create");
    expect(log).toContain("after_create");
  });

  it("initialize", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const log: string[] = [];
    Topic.afterFind(function (this: any) {
      log.push("after_find");
    });
    Topic.afterInitialize(function (this: any) {
      log.push("after_initialize");
    });
    new Topic({ title: "a" });
    expect(log).toEqual(["after_initialize"]);
  });

  it("find", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const created = await Topic.create({ title: "a" });
    const log: string[] = [];
    Topic.afterFind(function (this: any) {
      log.push("after_find");
    });
    Topic.afterInitialize(function (this: any) {
      log.push("after_initialize");
    });
    await Topic.find(created.id);
    expect(log).toEqual(["after_find", "after_initialize"]);
  });
});

describe("CallbacksTest", () => {
  // Rails callbacks_test.rb declares `fixtures :developers`; the callback models
  // ride the canonical `developers` table (ContextualCallbacksDeveloper from
  // test-helpers/models records a per-instance callback history).

  it("existing valid?", async () => {
    const p = await ContextualCallbacksDeveloper.create({ name: "Bob" });
    const found = await ContextualCallbacksDeveloper.find(p.id);
    expect(found.isValid()).toBe(true);
  });

  it("validate on contextual create", async () => {
    const david = await ContextualCallbacksDeveloper.create({
      name: "David",
      salary: 1000000,
    });
    expect(david.history).toEqual([
      "before_validation",
      "before_validation_on_create",
      "validate",
      "after_validation",
      "after_validation_on_create",
    ]);
  });

  it("validate on contextual update", async () => {
    const david = await ContextualCallbacksDeveloper.create({
      name: "David",
      salary: 1000000,
    });
    david.history.length = 0;
    await david.save();
    expect(david.history).toEqual([
      "before_validation",
      "before_validation_on_update",
      "validate",
      "after_validation",
      "after_validation_on_update",
    ]);
  });

  it("inheritance of callbacks", async () => {
    class Animal extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    const log: string[] = [];
    Animal.beforeCreate(function (this: any) {
      log.push("before_create");
    });

    class Dog extends Animal {}
    await Dog.create({ name: "Rex" });
    expect(log).toContain("before_create");
  });

  it("before save doesnt allow on option", () => {
    expect(() => {
      class T extends Base {
        static {
          this.attribute("title", "string");
          this.beforeSave(() => {}, { on: "create" } as any);
        }
      }
      void T;
    }).toThrow("Unknown key: :on. Valid keys are: :if, :unless, :prepend");
  });

  it("around save doesnt allow on option", () => {
    expect(() => {
      class T extends Base {
        static {
          this.attribute("title", "string");
          this.aroundSave((_r, proceed) => proceed(), { on: "create" } as any);
        }
      }
      void T;
    }).toThrow("Unknown key: :on. Valid keys are: :if, :unless, :prepend");
  });

  it("after save doesnt allow on option", () => {
    expect(() => {
      class T extends Base {
        static {
          this.attribute("title", "string");
          this.afterSave(() => {}, { on: "create" } as any);
        }
      }
      void T;
    }).toThrow("Unknown key: :on. Valid keys are: :if, :unless, :prepend");
  });

  it("new valid?", async () => {
    class CbPost extends Base {
      static {
        this.attribute("title", "string");
        this.validates("title", { presence: true });
      }
    }
    const p = new CbPost({});
    expect(await p.isValid()).toBe(false);
    const p2 = new CbPost({ title: "hello" });
    expect(await p2.isValid()).toBe(true);
  });

  it("validate on create", async () => {
    class CbPost extends Base {
      static {
        this.attribute("title", "string");
        this.validates("title", { presence: true });
      }
    }
    const invalid = new CbPost({});
    const result = await invalid.save();
    expect(result).toBe(false);
    const valid = await CbPost.create({ title: "test" });
    expect(valid.isPersisted()).toBe(true);
  });

  it("validate on update", async () => {
    class CbPost extends Base {
      static {
        this.attribute("title", "string");
        this.validates("title", { presence: true });
      }
    }
    const p = await CbPost.create({ title: "test" });
    p.title = "";
    const result = await p.save();
    expect(result).toBe(false);
  });

  it("before create throwing abort", async () => {
    class CbPost extends Base {
      static {
        this.attribute("title", "string");
        this.beforeCreate(() => throwAbort());
      }
    }
    const p = new CbPost({ title: "test" });
    const result = await p.save();
    expect(result).toBe(false);
  });

  it("before update throwing abort", async () => {
    class CbPost extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const p = await CbPost.create({ title: "test" });
    CbPost.beforeUpdate(() => throwAbort());
    p.title = "changed";
    const result = await p.save();
    expect(result).toBe(false);
  });

  it("before destroy throwing abort", async () => {
    class CbPost extends Base {
      static {
        this.attribute("title", "string");
        this.beforeDestroy(() => throwAbort());
      }
    }
    const p = await CbPost.create({ title: "test" });
    const result = await p.destroy();
    expect(result).toBe(false);
    // Halting destroy leaves the record persisted (no exception escapes).
    expect(p.isDestroyed()).toBe(false);
    expect(await CbPost.exists(p.id)).toBe(true);
  });

  it("callback throwing abort", async () => {
    class CbPost extends Base {
      static {
        this.attribute("title", "string");
        this.beforeSave(() => throwAbort());
      }
    }
    const p = new CbPost({ title: "test" });
    const result = await p.save();
    expect(result).toBe(false);
    expect(p.isNewRecord()).toBe(true);
  });
});

describe("CallbacksTest", () => {
  it("destroy", async () => {
    const log: string[] = [];

    class Tracked extends Base {
      static {
        this.attribute("name", "string");
        this.afterDestroy(() => {
          log.push("after_destroy");
        });
      }
    }

    const t = await Tracked.create({ name: "test" });
    await t.destroy();
    expect(log).toContain("after_destroy");
  });

  it("before save throwing abort", async () => {
    class Guarded extends Base {
      static {
        this.attribute("name", "string");
        this.beforeSave(() => throwAbort());
      }
    }

    const g = new Guarded({ name: "test" });
    const result = await g.save();
    expect(result).toBe(false);
    expect(g.isNewRecord()).toBe(true);
  });

  it("delete", async () => {
    const log: string[] = [];

    class Tracked extends Base {
      static {
        this.attribute("name", "string");
        this.beforeDestroy(() => {
          log.push("before_destroy");
        });
        this.afterDestroy(() => {
          log.push("after_destroy");
        });
      }
    }

    const t = await Tracked.create({ name: "test" });
    log.length = 0;
    await t.delete();
    expect(log).toEqual([]);
  });
});
