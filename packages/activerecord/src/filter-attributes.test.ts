import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./index.js";
import { AdminUser } from "./test-helpers/models/admin/user.js";
import { AdminAccount } from "./test-helpers/models/admin/account.js";
import { User } from "./test-helpers/models/user.js";
import { fixtures } from "./test-fixtures.js";
import { pp } from "./pretty-print.js";

const { "admin/users": adminUsers } = fixtures(["admin/accounts", "admin/users"]);

describe("FilterAttributesTest", () => {
  async function ppString(obj: unknown): Promise<string> {
    let out = "";
    await pp(obj, { write: (s: string) => (out += s) });
    return out;
  }

  let previousFilterAttributes: (string | RegExp | ((k: string, v: unknown) => unknown))[];

  beforeEach(() => {
    previousFilterAttributes = Base.filterAttributes;
    Base.filterAttributes = ["name"];
  });

  afterEach(() => {
    Base.filterAttributes = previousFilterAttributes;
    for (const model of [AdminAccount, AdminUser, User] as const) {
      delete (model as { _filterAttributes?: unknown })._filterAttributes;
      (model as { _inspectionFilter?: unknown })._inspectionFilter = null;
    }
  });

  it("filter_attributes", async () => {
    for (const user of await AdminUser.all()) {
      expect(user.inspect()).toContain("name: [FILTERED]");
      expect(user.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);
    }

    for (const account of await AdminAccount.all()) {
      expect(account.inspect()).toContain("name: [FILTERED]");
      expect(account.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);
    }
  });

  it("filter_attributes affects attribute_for_inspect", async () => {
    for (const user of await AdminUser.all()) {
      expect(user.attributeForInspect("name")).toBe("[FILTERED]");
    }
  });

  it("string filter_attributes perform partial match", async () => {
    Base.filterAttributes = ["n"];
    for (const account of await AdminAccount.all()) {
      expect(account.inspect()).toContain("name: [FILTERED]");
      expect(account.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);
    }
  });

  it("regex filter_attributes are accepted", async () => {
    Base.filterAttributes = [/^n$/];
    const account1 = await AdminAccount.findBy({ name: "37signals" });
    expect(account1!.inspect()).toContain('name: "37signals"');
    expect(account1!.inspect().match(/\[FILTERED\]/g)?.length ?? 0).toBe(0);

    Base.filterAttributes = [/^n/];
    const account2 = await AdminAccount.findBy({ name: "37signals" });
    expect(account2!.inspect()).toContain("name: [FILTERED]");
    expect(account2!.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);
  });

  it("proc filter_attributes are accepted", async () => {
    Base.filterAttributes = [
      (key: string, value: unknown) => {
        if (key === "name" && typeof value === "string") return value.split("").reverse().join("");
        return value;
      },
    ];
    const account = await AdminAccount.findBy({ name: "37signals" });
    expect(account!.inspect()).toContain('name: "slangis73"');
  });

  it("proc filter_attributes don't prevent marshal dump", () => {
    Base.filterAttributes = [
      (key: string, value: unknown) => {
        if (key === "name" && typeof value === "string") return value.split("").reverse().join("");
        return value;
      },
    ];
    const account = new AdminAccount({ id: 123, name: "37signals" });
    account.inspect();
    expect(account.readAttribute("name")).toBe("37signals");
  });

  it("filter_attributes could be overwritten by models", async () => {
    for (const account of await AdminAccount.all()) {
      expect(account.inspect()).toContain("name: [FILTERED]");
      expect(account.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);
    }

    try {
      AdminAccount.filterAttributes = [];

      for (const user of await AdminUser.all()) {
        expect(user.inspect()).toContain("name: [FILTERED]");
        expect(user.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);
      }

      for (const account of await AdminAccount.all()) {
        expect(account.inspect()).not.toContain("name: [FILTERED]");
        expect(account.inspect().match(/\[FILTERED\]/g)?.length ?? 0).toBe(0);
      }
    } finally {
      delete (AdminAccount as unknown as { _filterAttributes?: unknown })._filterAttributes;
    }
  });

  it("filter_attributes should not filter nil value", () => {
    const account = new AdminAccount({});
    expect(account.inspect()).toContain("name: nil");
    expect(account.inspect()).not.toContain("name: [FILTERED]");
    expect(account.inspect().match(/\[FILTERED\]/g)?.length ?? 0).toBe(0);
  });

  it("filter_attributes should handle [FILTERED] value properly", () => {
    User.filterAttributes = ["auth"];
    const user = new User({ token: "[FILTERED]", auth_token: "[FILTERED]" });
    expect(user.inspect()).toContain("auth_token: [FILTERED]");
    expect(user.inspect()).toContain('token: "[FILTERED]"');
  });

  it("filter_attributes on pretty_print", async () => {
    const user = adminUsers("david");
    const output = await ppString(user);
    expect(output).toContain("name: [FILTERED]");
    expect(output.match(/\[FILTERED\]/g)?.length).toBe(1);
  });

  it("filter_attributes on pretty_print should not filter nil value", async () => {
    const user = new AdminUser({});
    const output = await ppString(user);
    expect(output).toContain("name: nil");
    expect(output).not.toContain("name: [FILTERED]");
    expect(output.match(/\[FILTERED\]/g)?.length ?? 0).toBe(0);
  });

  it("filter_attributes on pretty_print should handle [FILTERED] value properly", async () => {
    User.filterAttributes = ["auth"];
    const user = new User({ token: "[FILTERED]", auth_token: "[FILTERED]" });
    const output = await ppString(user);
    expect(output).toContain("auth_token: [FILTERED]");
    expect(output).toContain("token: [FILTERED]");
  });
});
