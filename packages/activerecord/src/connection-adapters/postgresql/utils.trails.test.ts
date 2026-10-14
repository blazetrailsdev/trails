import { TypeError } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import {
  describeIfPg,
  PG_TEST_URL,
  PostgreSQLAdapter,
} from "../../adapters/postgresql/test-helper.js";
import { Name } from "./utils.js";

describe("PostgreSQL::Name#quoted", () => {
  it("raises quote_ident's TypeError for a nil identifier", () => {
    const name = new Name(null, null as unknown as string);
    expect(() => name.quoted()).toThrow(TypeError);
    expect(() => name.quoted()).toThrow("no implicit conversion of nil into String");
  });

  it("quotes an empty schema as Ruby's truthy empty String", () => {
    expect(new Name("", "topics").quoted()).toBe('""."topics"');
  });
});

describeIfPg("PostgreSQL quote_table_name", () => {
  it("raises quote_ident's TypeError for a nil table name", async () => {
    const adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
    try {
      expect(() => adapter.quoteTableName(null)).toThrow(TypeError);
      expect(() => adapter.quoteTableName(null)).toThrow(
        "no implicit conversion of nil into String",
      );
    } finally {
      await adapter.disconnectBang();
    }
  });
});
