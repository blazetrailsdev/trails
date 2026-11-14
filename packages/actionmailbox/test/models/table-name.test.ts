import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Base } from "@blazetrails/activerecord";
import "../support/database/setup.js";
import { InboundEmail } from "../../lib/inbound-email.js";

describe("ActionMailbox::TableNameTest", () => {
  let oldPrefix: string | null;
  let oldSuffix: string | null;
  let prefix: string;
  let suffix: string;
  let models: (typeof Base)[];

  beforeEach(() => {
    oldPrefix = Base.tableNamePrefix;
    oldSuffix = Base.tableNameSuffix;

    Base.tableNamePrefix = prefix = "abc_";
    Base.tableNameSuffix = suffix = "_xyz";

    models = [InboundEmail];
    models.map((m) => m.resetTableName());
  });

  afterEach(() => {
    Base.tableNamePrefix = oldPrefix;
    Base.tableNameSuffix = oldSuffix;

    models.map((m) => m.resetTableName());
  });

  it("prefix and suffix are added to the Action Mailbox tables' name", () => {
    expect(InboundEmail.tableName).toBe(`${prefix}action_mailbox_inbound_emails${suffix}`);
  });
});
