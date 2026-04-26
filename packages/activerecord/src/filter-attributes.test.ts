import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";

function makeUser() {
  const adapter = createTestAdapter();
  class User extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("token", "string");
      this.attribute("auth_token", "string");
      this.adapter = adapter;
    }
  }
  return User;
}

function makeAccount() {
  const adapter = createTestAdapter();
  class Account extends Base {
    static {
      this.attribute("name", "string");
      this.adapter = adapter;
    }
  }
  return Account;
}

describe("FilterAttributesTest", () => {
  let previousFilterAttributes: (string | RegExp | ((k: string, v: unknown) => unknown))[];

  beforeEach(() => {
    previousFilterAttributes = Base.filterAttributes;
    Base.filterAttributes = ["name"];
  });

  afterEach(() => {
    Base.filterAttributes = previousFilterAttributes;
  });

  it("filter_attributes", () => {
    const Account = makeAccount();
    const user1 = new Account({ name: "David" });
    const user2 = new Account({ name: "Alice" });
    expect(user1.inspect()).toContain("name: [FILTERED]");
    expect(user1.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);
    expect(user2.inspect()).toContain("name: [FILTERED]");
    expect(user2.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);
  });

  it("filter_attributes affects attribute_for_inspect", () => {
    const Account = makeAccount();
    const user = new Account({ name: "David" });
    expect(user.attributeForInspect("name")).toBe("[FILTERED]");
  });

  it("string filter_attributes perform partial match", () => {
    Base.filterAttributes = ["n"];
    const Account = makeAccount();
    const account = new Account({ name: "37signals" });
    expect(account.inspect()).toContain("name: [FILTERED]");
    expect(account.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);
  });

  it("regex filter_attributes are accepted", () => {
    const Account = makeAccount();

    Base.filterAttributes = [/^n$/];
    const account1 = new Account({ name: "37signals" });
    expect(account1.inspect()).toContain('name: "37signals"');
    expect(account1.inspect().match(/\[FILTERED\]/g)?.length ?? 0).toBe(0);

    Base.filterAttributes = [/^n/];
    const account2 = new Account({ name: "37signals" });
    expect(account2.inspect()).toContain("name: [FILTERED]");
    expect(account2.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);
  });

  it("proc filter_attributes are accepted", () => {
    const Account = makeAccount();
    Base.filterAttributes = [
      (key: string, value: unknown) => {
        if (key === "name" && typeof value === "string") return value.split("").reverse().join("");
        return value;
      },
    ];
    const account = new Account({ name: "37signals" });
    expect(account.inspect()).toContain('name: "slangis73"');
  });

  it("proc filter_attributes don't prevent marshal dump", () => {
    Base.filterAttributes = [
      (key: string, value: unknown) => {
        if (key === "name" && typeof value === "string") return value.split("").reverse().join("");
        return value;
      },
    ];
    const Account = makeAccount();
    const account = new Account({ name: "37signals" });
    account.inspect();
    // Verify record is still usable after inspect with proc filter
    expect(account.readAttribute("name")).toBe("37signals");
  });

  it("filter_attributes could be overwritten by models", () => {
    const AdminAccount = makeAccount();
    const AdminUser = makeUser();

    const account1 = new AdminAccount({ name: "37signals" });
    expect(account1.inspect()).toContain("name: [FILTERED]");
    expect(account1.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);

    AdminAccount.filterAttributes = [];

    const user = new AdminUser({ name: "David" });
    expect(user.inspect()).toContain("name: [FILTERED]");
    expect(user.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);

    const account2 = new AdminAccount({ name: "37signals" });
    expect(account2.inspect()).not.toContain("name: [FILTERED]");
    expect(account2.inspect().match(/\[FILTERED\]/g)?.length ?? 0).toBe(0);
  });

  it("filter_attributes should not filter nil value", () => {
    const Account = makeAccount();
    const account = new Account({});
    expect(account.inspect()).toContain("name: nil");
    expect(account.inspect()).not.toContain("name: [FILTERED]");
    expect(account.inspect().match(/\[FILTERED\]/g)?.length ?? 0).toBe(0);
  });

  it("filter_attributes should handle [FILTERED] value properly", () => {
    const User = makeUser();
    User.filterAttributes = ["auth"];
    const user = new User({ token: "[FILTERED]", auth_token: "[FILTERED]" });
    expect(user.inspect()).toContain("auth_token: [FILTERED]");
    expect(user.inspect()).toContain('token: "[FILTERED]"');
  });

  it("filter_attributes on pretty_print", () => {
    const Account = makeAccount();
    const user = new Account({ name: "David" });
    const output = user.inspect();
    expect(output).toContain("name: [FILTERED]");
    expect(output.match(/\[FILTERED\]/g)?.length).toBe(1);
  });

  it("filter_attributes on pretty_print should not filter nil value", () => {
    const Account = makeAccount();
    const user = new Account({});
    const output = user.inspect();
    expect(output).toContain("name: nil");
    expect(output).not.toContain("name: [FILTERED]");
    expect(output.match(/\[FILTERED\]/g)?.length ?? 0).toBe(0);
  });

  it("filter_attributes on pretty_print should handle [FILTERED] value properly", () => {
    const User = makeUser();
    User.filterAttributes = ["auth"];
    const user = new User({ token: "[FILTERED]", auth_token: "[FILTERED]" });
    const output = user.inspect();
    expect(output).toContain("auth_token: [FILTERED]");
    expect(output).toContain('token: "[FILTERED]"');
  });
});
