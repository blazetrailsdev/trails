import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("Validation Contexts (Rails-guided)", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  // Rails: test "validation on: :create"
  it("valid uses create context when new", async () => {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("terms", "string");
        this.adapter = adapter;
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
    u2.writeAttribute("terms", null);
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
        this.adapter = adapter;
        this.validates("change_reason", { presence: true, on: "update" });
      }
    }

    // Create succeeds without change_reason
    const user = await User.create({ name: "Alice" });
    expect(user.isPersisted()).toBe(true);

    // Update fails without change_reason
    user.writeAttribute("name", "Bob");
    expect(await user.save()).toBe(false);

    // Update succeeds with change_reason
    user.writeAttribute("change_reason", "Typo fix");
    expect(await user.save()).toBe(true);
  });
});
