import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { Base } from "./index.js";
import { AdminAccount } from "./test-helpers/models/admin/account.js";
import { Club } from "./test-helpers/models/club.js";
import { User } from "./test-helpers/models/user.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { useFixtures } from "./test-helpers/use-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";

// Rails: `fixtures :"admin/users", :"admin/accounts"` + `Admin::User`, `Admin::Account`,
// `User`. The `admin/accounts` set and the `AdminAccount`/`User` models port cleanly.
// `Admin::User` does NOT: its `store("params", { coder: "YAML" })` throws at class load
// (the YAML store coder is unimplemented), so both the model and the `admin/users`
// fixture set are unavailable (fixtures-registry.ts Category C). The Admin::User-backed
// `name`-filter assertions below therefore run on the canonical `AdminAccount` (which the
// original trails port already used for `attribute_for_inspect`), and the "overwritten by
// models" isolation sibling uses the canonical `Club` as an `Admin::User` stand-in.
setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({
    admin_accounts: canonicalSchema.admin_accounts,
    clubs: canonicalSchema.clubs,
    users: canonicalSchema.users,
  });
  await AdminAccount.loadSchema();
  await Club.loadSchema();
  await User.loadSchema();
});

const { "admin/accounts": accounts } = useFixtures(["admin/accounts"], () => Base.connection);

describe("FilterAttributesTest", () => {
  let previousFilterAttributes: (string | RegExp | ((k: string, v: unknown) => unknown))[];

  beforeEach(() => {
    previousFilterAttributes = Base.filterAttributes;
    Base.filterAttributes = ["name"];
  });

  afterEach(() => {
    Base.filterAttributes = previousFilterAttributes;
    // Rails resets per-model overrides via `instance_variable_set(:@filter_attributes, nil)`.
    // Dropping the own slot makes the model delegate to Base again.
    for (const model of [AdminAccount, Club, User] as const) {
      delete (model as { _filterAttributes?: unknown })._filterAttributes;
      (model as { _inspectionFilter?: unknown })._inspectionFilter = null;
    }
  });

  it("filter_attributes", () => {
    // Rails iterates `Admin::User.all` + `Admin::Account.all`; the Admin::User loop is
    // dropped (model blocked, see header) and `admin/accounts` holds the single
    // `signals37` row, so one fixture lookup is equivalent for the Account side.
    const account = accounts("signals37");
    expect(account.inspect()).toContain("name: [FILTERED]");
    expect(account.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);
  });

  it("filter_attributes affects attribute_for_inspect", () => {
    const user = new AdminAccount({ name: "David" });
    expect(user.attributeForInspect("name")).toBe("[FILTERED]");
  });

  it("string filter_attributes perform partial match", () => {
    Base.filterAttributes = ["n"];
    const account = accounts("signals37");
    expect(account.inspect()).toContain("name: [FILTERED]");
    expect(account.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);
  });

  it("regex filter_attributes are accepted", () => {
    const account = accounts("signals37");

    Base.filterAttributes = [/^n$/];
    expect(account.inspect()).toContain('name: "37signals"');
    expect(account.inspect().match(/\[FILTERED\]/g)?.length ?? 0).toBe(0);

    Base.filterAttributes = [/^n/];
    expect(account.inspect()).toContain("name: [FILTERED]");
    expect(account.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);
  });

  it("proc filter_attributes are accepted", () => {
    Base.filterAttributes = [
      (key: string, value: unknown) => {
        if (key === "name" && typeof value === "string") return value.split("").reverse().join("");
        return value;
      },
    ];
    const account = accounts("signals37");
    expect(account.inspect()).toContain('name: "slangis73"');
  });

  it("proc filter_attributes don't prevent marshal dump", () => {
    Base.filterAttributes = [
      (key: string, value: unknown) => {
        if (key === "name" && typeof value === "string") return value.split("").reverse().join("");
        return value;
      },
    ];
    const account = new AdminAccount({ name: "37signals" });
    account.inspect();
    expect(account.readAttribute("name")).toBe("37signals");
  });

  it("filter_attributes could be overwritten by models", () => {
    const account1 = accounts("signals37");
    expect(account1.inspect()).toContain("name: [FILTERED]");
    expect(account1.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);

    AdminAccount.filterAttributes = [];

    // Rails checks `Admin::User` here to prove the override didn't leak; Club stands in
    // for the unimportable Admin::User and likewise inherits Base's `["name"]` filter.
    const user = new Club({ name: "David" });
    expect(user.inspect()).toContain("name: [FILTERED]");
    expect(user.inspect().match(/\[FILTERED\]/g)?.length).toBe(1);

    const account2 = accounts("signals37");
    expect(account2.inspect()).not.toContain("name: [FILTERED]");
    expect(account2.inspect().match(/\[FILTERED\]/g)?.length ?? 0).toBe(0);
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
    const user = new AdminAccount({ name: "David" });
    const output = user.inspect();
    expect(output).toContain("name: [FILTERED]");
    expect(output.match(/\[FILTERED\]/g)?.length).toBe(1);
  });

  it("filter_attributes on pretty_print should not filter nil value", () => {
    const user = new AdminAccount({});
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
