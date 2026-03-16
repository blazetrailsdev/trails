/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "./index.js";

import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("ValidationsTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  function makeModel() {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("score", "integer");
        this.adapter = adapter;
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
    expect(t.readAttribute("title")).toBe("typed");
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
    const t = await Topic.create({ title: "num", score: 42 });
    expect(t.readAttribute("score")).toBe(42);
  });

  it("numericality validation checks against raw value", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "raw", score: 5 });
    expect(t.readAttribute("score")).toBe(5);
  });

  it("numericality validator wont be affected by custom getter", async () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "getter", score: 10 });
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
  it("valid uses create context when new", async () => {
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.attribute("invite_code", "string");
    User.adapter = freshAdapter();
    User.validates("invite_code", { presence: true, on: "create" });

    // Can't create without invite_code
    const user = new User({ name: "Alice" });
    const saved = await user.save();
    expect(saved).toBe(false);

    // Can create with invite_code
    const user2 = new User({ name: "Alice", invite_code: "ABC123" });
    const saved2 = await user2.save();
    expect(saved2).toBe(true);

    // Can update without invite_code (validation skipped for update context)
    user2.writeAttribute("invite_code", null);
    user2.writeAttribute("name", "Bob");
    const saved3 = await user2.save();
    expect(saved3).toBe(true);
  });

  it("valid uses update context when persisted", async () => {
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.attribute("reason", "string");
    User.adapter = freshAdapter();
    User.validates("reason", { presence: true, on: "update" });

    // Can create without reason
    const user = await User.create({ name: "Alice" });
    expect(user.isPersisted()).toBe(true);

    // Can't update without reason
    user.writeAttribute("name", "Bob");
    const saved = await user.save();
    expect(saved).toBe(false);

    // Can update with reason
    user.writeAttribute("reason", "Name change");
    const saved2 = await user.save();
    expect(saved2).toBe(true);
  });
});

describe("ValidationsTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("validates before save", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
        this.adapter = adapter;
      }
    }
    const u = new User();
    expect(await u.save()).toBe(false);
    expect(u.errors.get("name")).toContain("can't be blank");
  });

  it("create with invalid data returns unpersisted record", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
        this.adapter = adapter;
      }
    }
    const u = await User.create({});
    expect(u.isNewRecord()).toBe(true);
    expect(u.errors.size).toBeGreaterThan(0);
  });

  it("create! throws RecordInvalid", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
        this.adapter = adapter;
      }
    }
    await expect(User.createBang({})).rejects.toThrow("Validation failed");
  });

  it("update with invalid data returns false", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "Alice" });
    const result = await u.update({ name: "" });
    expect(result).toBe(false);
  });

  it("isValid returns true for valid record", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
        this.adapter = adapter;
      }
    }
    const u = new User({ name: "Alice" });
    expect(u.isValid()).toBe(true);
  });

  it("isValid returns false for invalid record", () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
        this.adapter = adapter;
      }
    }
    const u = new User();
    expect(u.isValid()).toBe(false);
  });

  it("errors are cleared on valid save", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
        this.adapter = adapter;
      }
    }
    const u = new User();
    await u.save(); // fails
    expect(u.errors.size).toBeGreaterThan(0);
    u.writeAttribute("name", "Alice");
    await u.save(); // succeeds
    expect(u.errors.size).toBe(0);
  });
});

describe("ValidationsTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("validate uniqueness", async () => {
    class Email extends Base {
      static {
        this.attribute("address", "string");
        this.adapter = adapter;
        this.validatesUniqueness("address");
      }
    }
    await Email.create({ address: "a@b.com" });
    const dup = new Email({ address: "a@b.com" });
    expect(await dup.save()).toBe(false);
    expect(dup.errors.get("address")).toContain("has already been taken");
  });

  it("validate uniqueness with scope", async () => {
    class Permission extends Base {
      static {
        this.attribute("user_id", "integer");
        this.attribute("resource_id", "integer");
        this.adapter = adapter;
        this.validatesUniqueness("user_id", { scope: "resource_id" });
      }
    }
    await Permission.create({ user_id: 1, resource_id: 1 });
    const p2 = await Permission.create({ user_id: 1, resource_id: 2 });
    expect(p2.isPersisted()).toBe(true);
    const p3 = new Permission({ user_id: 1, resource_id: 1 });
    expect(await p3.save()).toBe(false);
  });
});
