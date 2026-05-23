import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "../index.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({
    users: { name: "string", terms: "string", change_reason: "string" },
  });
});

describe("Validation Contexts (Rails-guided)", () => {
  // Rails: test "validation on: :create"
  it("valid uses create context when new", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("terms", "string");
        this.validates("terms", { presence: true, on: "create" });
      }
    }

    // Fails on create
    const u1 = new User({ name: "Alice" });
    expect(await u1.save()).toBe(false);

    // Succeeds with terms
    const u2 = await User.create({ name: "Alice", terms: "accepted" });
    expect(u2.isPersisted()).toBe(true);

    // Can update without terms
    u2.terms = null;
    expect(await u2.save()).toBe(true);
  });

  // Rails: test "validation on: :update"
  it("valid uses update context when persisted", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("change_reason", "string");
        this.validates("change_reason", { presence: true, on: "update" });
      }
    }

    // Create succeeds without change_reason
    const user = await User.create({ name: "Alice" });
    expect(user.isPersisted()).toBe(true);

    // Update fails without change_reason
    user.name = "Bob";
    expect(await user.save()).toBe(false);

    // Update succeeds with change_reason
    user.change_reason = "Typo fix";
    expect(await user.save()).toBe(true);
  });
});
