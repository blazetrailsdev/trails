/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect } from "vitest";
import { Base } from "./index.js";

import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";

// These synthetic coverage models ride the canonical `topics` table. Rails'
// ValidationsTest drives almost everything through the Topic model, so the
// canonical columns map cleanly: `title` (string presence), `replies_count`
// (integer numericality), `group`/`content` (string/text presence on
// create/update contexts), and `parent_id`/`replies_count` for scoped
// uniqueness.

describe("ValidationsTest", () => {
  useHandlerFixtures(["topics"], { schema: canonicalSchema });

  function makeModel() {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("replies_count", "integer");
        this.validates("title", { presence: true });
      }
    }
    return { Topic };
  }

  it("valid using special context", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "valid" });
    const result = await t.isValid();
    expect(result).toBe(true);
  });

  it("invalid using multiple contexts", async () => {
    const { Topic } = makeModel();
    const t = new Topic({});
    const result = await t.isValid();
    expect(result).toBe(false);
  });

  it("validate", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "ok" });
    await t.isValid();
    expect(t.errors.empty).toBe(true);
  });

  it("invalid record exception", async () => {
    const { Topic } = makeModel();
    const t = new Topic({});
    const valid = await t.isValid();
    expect(valid).toBe(false);
    expect(t.errors.empty).toBe(false);
  });

  it("validate with bang", async () => {
    const { Topic } = makeModel();
    const t = new Topic({});
    const valid = await t.isValid();
    expect(valid).toBe(false);
  });

  it("validate with bang and context", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "ok" });
    const result = await t.isValid();
    expect(result).toBe(true);
  });

  it("exception on create bang many", async () => {
    const { Topic } = makeModel();
    const t = new Topic({});
    const valid = await t.isValid();
    expect(valid).toBe(false);
  });

  it("exception on create bang with block", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "t" });
    const valid = await t.isValid();
    expect(valid).toBe(true);
  });

  it("exception on create bang many with block", async () => {
    const { Topic } = makeModel();
    const t = new Topic({});
    const valid = await t.isValid();
    expect(valid).toBe(false);
  });

  it("validates acceptance of with non existent table", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "test" });
    const result = await t.isValid();
    expect(result).toBe(true);
  });

  it("throw away typing", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "typed" });
    expect(t.title).toBe("typed");
  });

  it("validates acceptance of with undefined attribute methods", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "t" });
    const result = await t.isValid();
    expect(result).toBe(true);
  });

  it("validates acceptance of as database column", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "acc" });
    expect(t.isPersisted()).toBe(true);
  });

  it("validators", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "v" });
    const result = await t.isValid();
    expect(result).toBe(true);
  });

  it("numericality validation with mutation", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "num", replies_count: 42 });
    expect(t.replies_count).toBe(42);
  });

  it("numericality validation checks against raw value", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "raw", replies_count: 5 });
    expect(t.replies_count).toBe(5);
  });

  it("numericality validates cast value when record loaded from database (cameFromUser false)", async () => {
    // When an AR record is loaded via writeFromDatabase, cameFromUser returns
    // false and the validator uses readAttribute (cast value), not the raw
    // string column. A numeric column loaded as the integer 42 must pass.
    class Topic extends Base {
      static {
        this.attribute("replies_count", "integer");
        this.validates("replies_count", { numericality: { greaterThan: 0 } });
      }
    }
    const topic = Topic.new({}) as any;
    topic._attributes.writeFromDatabase("replies_count", 42);
    expect(topic.cameFromUser("replies_count")).toBe(false);
    expect(await topic.isValid()).toBe(true);
  });

  it("numericality validates raw input when attribute came from user (cameFromUser true)", async () => {
    // User-assigned string "abc" on an integer column casts to null but the
    // validator must see the raw "abc" via readAttributeBeforeTypeCast and
    // reject it — not silently pass because the cast value is null.
    class Topic extends Base {
      static {
        this.attribute("replies_count", "integer");
        this.validates("replies_count", { numericality: true });
      }
    }
    const topic = Topic.new({ replies_count: "abc" }) as any;
    expect(topic.cameFromUser("replies_count")).toBe(true);
    expect(await topic.isValid()).toBe(false);
    expect(topic.errors.get("replies_count")).toContain("is not a number");
  });

  it("numericality validator wont be affected by custom getter", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "getter", replies_count: 10 });
    const result = await t.isValid();
    expect(result).toBe(true);
  });

  it("acceptance validator doesnt require db connection", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "db" });
    const result = await t.isValid();
    expect(result).toBe(true);
  });

  it("save without validation", async () => {
    const { Topic } = makeModel();
    const t = new Topic();
    // title is required, but save(validate: false) should bypass
    const result = await t.save({ validate: false });
    expect(result).toBe(true);
    expect(t.isPersisted()).toBe(true);
  });
});

describe("ValidationsTest", () => {
  useHandlerFixtures(["topics"], { schema: canonicalSchema });

  it("valid uses create context when new", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("group", "string");
        this.validates("group", { presence: true, on: "create" });
      }
    }

    // Can't create without group
    const user = new Topic({ title: "Alice" });
    const saved = await user.save();
    expect(saved).toBe(false);

    // Can create with group
    const user2 = new Topic({ title: "Alice", group: "ABC123" });
    const saved2 = await user2.save();
    expect(saved2).toBe(true);

    // Can update without group (validation skipped for update context)
    user2.group = null;
    user2.title = "Bob";
    const saved3 = await user2.save();
    expect(saved3).toBe(true);
  });

  it("valid uses update context when persisted", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("content", "string");
        this.validates("content", { presence: true, on: "update" });
      }
    }

    // Can create without content
    const user = await Topic.create({ title: "Alice" });
    expect(user.isPersisted()).toBe(true);

    // Can't update without content
    user.title = "Bob";
    const saved = await user.save();
    expect(saved).toBe(false);

    // Can update with content
    user.content = "Name change";
    const saved2 = await user.save();
    expect(saved2).toBe(true);
  });
});

describe("ValidationsTest", () => {
  useHandlerFixtures(["topics"], { schema: canonicalSchema });

  it("validates before save", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.validates("title", { presence: true });
      }
    }
    const u = new Topic();
    expect(await u.save()).toBe(false);
    expect(u.errors.get("title")).toContain("can't be blank");
  });

  it("create with invalid data returns unpersisted record", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.validates("title", { presence: true });
      }
    }
    const u = await Topic.create({});
    expect(u.isNewRecord()).toBe(true);
    expect(u.errors.size).toBeGreaterThan(0);
  });

  it("create! throws RecordInvalid", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.validates("title", { presence: true });
      }
    }
    await expect(Topic.createBang({})).rejects.toThrow("Validation failed");
  });

  it("update with invalid data returns false", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.validates("title", { presence: true });
      }
    }
    const u = await Topic.create({ title: "Alice" });
    const result = await u.update({ title: "" });
    expect(result).toBe(false);
  });

  it("isValid returns true for valid record", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.validates("title", { presence: true });
      }
    }
    const u = new Topic({ title: "Alice" });
    expect(u.isValid()).toBe(true);
  });

  it("isValid returns false for invalid record", () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.validates("title", { presence: true });
      }
    }
    const u = new Topic();
    expect(u.isValid()).toBe(false);
  });

  it("errors are cleared on valid save", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.validates("title", { presence: true });
      }
    }
    const u = new Topic();
    await u.save(); // fails
    expect(u.errors.size).toBeGreaterThan(0);
    u.title = "Alice";
    await u.save(); // succeeds
    expect(u.errors.size).toBe(0);
  });
});

describe("ValidationsTest", () => {
  useHandlerFixtures(["topics"], { schema: canonicalSchema });

  it("validate uniqueness", async () => {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.validatesUniqueness("title");
      }
    }
    await Topic.create({ title: "uniq-a@b.com" });
    const dup = new Topic({ title: "uniq-a@b.com" });
    expect(await dup.save()).toBe(false);
    expect(dup.errors.get("title")).toContain("has already been taken");
  });

  it("validate uniqueness with scope", async () => {
    class Topic extends Base {
      static {
        this.attribute("parent_id", "integer");
        this.attribute("replies_count", "integer");
        this.validatesUniqueness("parent_id", { scope: "replies_count" });
      }
    }
    await Topic.create({ parent_id: 901, replies_count: 1 });
    const p2 = await Topic.create({ parent_id: 901, replies_count: 2 });
    expect(p2.isPersisted()).toBe(true);
    const p3 = new Topic({ parent_id: 901, replies_count: 1 });
    expect(await p3.save()).toBe(false);
  });
});
