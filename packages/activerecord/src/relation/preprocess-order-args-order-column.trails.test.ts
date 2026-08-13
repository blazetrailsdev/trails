import { describe, it, expect, vi } from "vitest";
import { Nodes } from "@blazetrails/arel";
import { fixtures } from "../test-fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";
import { preprocessOrderArgs } from "./query-methods.js";

/**
 * Rails' `preprocess_order_args` (query_methods.rb:2093-2110) routes every
 * Symbol and Hash order arg through `order_column(field.to_s)` — so the
 * columns_hash / from_clause gate, the `arel_column` fallback (a bare quoted
 * literal for an unknown column), and dotted `table.column` resolution all
 * apply to order args. trails previously built the attribute inline off
 * `this.table`, which qualified every arg to the relation's table regardless.
 */
describe("preprocessOrderArgs routes through orderColumn", () => {
  fixtures([]);

  const preprocess = (rel: unknown, args: unknown[]): unknown[] => {
    preprocessOrderArgs.call(rel as never, args);
    return args;
  };

  const sqlOf = (node: unknown): string =>
    (Topic as unknown as { connection: { toSql(n: Nodes.Node): string } }).connection.toSql(
      node as Nodes.Node,
    );

  it("falls back to a bare quoted literal for an unknown column in the Symbol arm", () => {
    const [node] = preprocess(Topic.all(), [":nonexistent"]);
    expect(node).toBeInstanceOf(Nodes.Ascending);
    expect(sqlOf(node)).not.toMatch(/topics/i);
    expect(sqlOf(node)).toMatch(/nonexistent.*ASC/i);
  });

  it("falls back to a bare quoted literal for an unknown column in the flat Hash arm", () => {
    const [node] = preprocess(Topic.all(), [{ nonexistent: "desc" }]);
    expect(node).toBeInstanceOf(Nodes.Descending);
    expect(sqlOf(node)).not.toMatch(/topics/i);
    expect(sqlOf(node)).toMatch(/nonexistent.*DESC/i);
  });

  it("keeps a known column qualified against the relation's table", () => {
    const [node] = preprocess(Topic.all(), [":title"]);
    expect(sqlOf(node)).toMatch(/"topics"\."title" ASC|`topics`\.`title` ASC/);
  });

  it("resolves the nested Hash arm through Rails' dotted form, recording the reference", () => {
    const rel = Topic.all() as unknown as { _referencesValues?: string[] };
    const [node] = preprocess(rel, [{ topics: { title: "desc" } }]);
    expect(node).toBeInstanceOf(Nodes.Descending);
    expect(sqlOf(node)).toMatch(/"topics"\."title" DESC|`topics`\.`title` DESC/);
    expect(rel._referencesValues).toContain("topics");
  });

  it("leaves a String arg unchanged", () => {
    expect(preprocess(Topic.all(), ["title ASC"])).toEqual(["title ASC"]);
  });
  it("quotes the fallback through quote_table_name, as Rails' order_column does", () => {
    // `order_column`'s else arm is
    // `Arel.sql(model.adapter_class.quote_table_name(attr_name), retryable: true)`
    // (query_methods.rb:2153-2161). Both quoters emit the same bytes on every
    // adapter trails ships, so only the dispatch is observable.
    const connection = (Topic as unknown as { connection: Record<string, unknown> }).connection;
    const quoteTableName = vi.spyOn(connection as never, "quoteTableName");
    const quoteColumnName = vi.spyOn(connection as never, "quoteColumnName");
    try {
      preprocess(Topic.all(), [":nonexistent"]);
      expect(quoteTableName).toHaveBeenCalledWith("nonexistent");
      expect(quoteColumnName).not.toHaveBeenCalledWith("nonexistent");
    } finally {
      quoteTableName.mockRestore();
      quoteColumnName.mockRestore();
    }
  });
});
