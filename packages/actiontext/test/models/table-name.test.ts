import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../test-helper.js";
import { Base } from "@blazetrails/activerecord";
import { EncryptedRichText } from "../../lib/encrypted-rich-text.js";
import { RichText } from "../../lib/rich-text.js";

describe("ActionText::TableNameTest", () => {
  let oldPrefix: string | null;
  let oldSuffix: string | null;
  let prefix: string;
  let suffix: string;
  let models: Array<typeof Base>;

  beforeEach(() => {
    oldPrefix = Base.tableNamePrefix;
    oldSuffix = Base.tableNameSuffix;

    Base.tableNamePrefix = prefix = "abc_";
    Base.tableNameSuffix = suffix = "_xyz";

    models = [RichText, EncryptedRichText];
    models.map((model) => model.resetTableName());
  });

  afterEach(() => {
    Base.tableNamePrefix = oldPrefix;
    Base.tableNameSuffix = oldSuffix;

    models.map((model) => model.resetTableName());
  });

  it("prefix and suffix are added to the Action Text tables' name", () => {
    expect(RichText.tableName).toEqual(`${prefix}action_text_rich_texts${suffix}`);
    expect(EncryptedRichText.tableName).toEqual(`${prefix}action_text_rich_texts${suffix}`);
  });
});
