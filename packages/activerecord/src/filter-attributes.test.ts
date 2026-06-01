import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { Base } from "./index.js";
import { AdminUser } from "./test-helpers/models/admin/user.js";
import { AdminAccount } from "./test-helpers/models/admin/account.js";
import { User } from "./test-helpers/models/user.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { useFixtures } from "./test-helpers/use-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";

// Rails: `fixtures :"admin/users", :"admin/accounts"` + `Admin::User`, `Admin::Account`,
// `User`. With the YAML store coder implemented, `Admin::User` (which declares
// `store("params", { coder: "YAML" })`) now loads and the `admin/users` fixture set is
// registry-resident, so the Admin::User-backed assertions run on the real model.
setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({
    admin_accounts: canonicalSchema.admin_accounts,
    admin_users: canonicalSchema.admin_users,
    users: canonicalSchema.users,
  });
  await AdminAccount.loadSchema();
  await AdminUser.loadSchema();
  await User.loadSchema();
});

// admin/accounts listed first: admin/users rows ref() admin_accounts ids.
const { "admin/users": adminUsers } = useFixtures(
  ["admin/accounts", "admin/users"],
  () => Base.connection,
);

describe("FilterAttributesTest", () => {
  let previousFilterAttributes: (string | RegExp | ((k: string, v: unknown) => unknown))[];

  beforeEach(() => {
    previousFilterAttributes = Base.filterAttributes;
    Base.filterAttributes = ["name"];
    // Rails also sets ActiveRecord.use_yaml_unsafe_load = true here; trails' YAML
    // coder has no unsafe-load mode (it only ever produces plain JS values).
  });

  afterEach(() => {
    Base.filterAttributes = previousFilterAttributes;
    // Rails resets per-model overrides via `instance_variable_set(:@filter_attributes, nil)`.
    // Dropping the own slot makes the model delegate to Base again.
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

      // Above change should not impact other models
      for (const user of await AdminUser.all()) {
        expect(user.inspect()).toContain("name: [FILTERED]");
        expect(user.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);
      }

      for (const account of await AdminAccount.all()) {
        expect(account.inspect()).not.toContain("name: [FILTERED]");
        expect(account.inspect().match(/\[FILTERED\]/g)?.length ?? 0).toBe(0);
      }
    } finally {
      // Mirrors Rails' instance_variable_set(:@filter_attributes, nil) — drop the
      // per-class override so AdminAccount inherits from Base again.
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

  it("filter_attributes on pretty_print", () => {
    const user = adminUsers("david");
    const output = user.inspect();
    expect(output).toContain("name: [FILTERED]");
    expect(output.match(/\[FILTERED\]/g)?.length).toBe(1);
  });

  it("filter_attributes on pretty_print should not filter nil value", () => {
    const user = new AdminUser({});
    const output = user.inspect();
    expect(output).toContain("name: nil");
    expect(output).not.toContain("name: [FILTERED]");
    expect(output.match(/\[FILTERED\]/g)?.length ?? 0).toBe(0);
  });

  it("filter_attributes on pretty_print should handle [FILTERED] value properly", () => {
    User.filterAttributes = ["auth"];
    const user = new User({ token: "[FILTERED]", auth_token: "[FILTERED]" });
    const output = user.inspect();
    expect(output).toContain("auth_token: [FILTERED]");
    expect(output).toContain('token: "[FILTERED]"');
  });
});
