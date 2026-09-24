import { describe, it, expect, vi } from "vitest";
import { Nodes } from "@blazetrails/arel";
import { fixtures } from "../test-fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";
import { preprocessOrderArgs } from "./query-methods.js";

describe("preprocessOrderArgs routes through orderColumn", () => {
  fixtures([]);

  const preprocess = (rel: unknown, args: unknown[]): unknown[] => {
    preprocessOrderArgs.call(rel as never, args);
    return args;
  };

  const sqlOf = async (node: unknown): Promise<string> =>
    ((await Topic.leaseConnection()) as unknown as { toSql(n: Nodes.Node): string }).toSql(
      node as Nodes.Node,
    );

  it("falls back to a bare quoted literal for an unknown column in the Symbol arm", async () => {
    const [node] = preprocess(Topic.all(), [":nonexistent"]);
    expect(node).toBeInstanceOf(Nodes.Ascending);
    expect(await sqlOf(node)).not.toMatch(/topics/i);
    expect(await sqlOf(node)).toMatch(/nonexistent.*ASC/i);
  });

  it("falls back to a bare quoted literal for an unknown column in the flat Hash arm", async () => {
    const [node] = preprocess(Topic.all(), [{ nonexistent: "desc" }]);
    expect(node).toBeInstanceOf(Nodes.Descending);
    expect(await sqlOf(node)).not.toMatch(/topics/i);
    expect(await sqlOf(node)).toMatch(/nonexistent.*DESC/i);
  });

  it("keeps a known column qualified against the relation's table", async () => {
    const [node] = preprocess(Topic.all(), [":title"]);
    expect(await sqlOf(node)).toMatch(/"topics"\."title" ASC|`topics`\.`title` ASC/);
  });

  it("resolves the nested Hash arm through Rails' dotted form, recording the reference", async () => {
    const rel = Topic.all() as unknown as { referencesValues?: string[] };
    const [node] = preprocess(rel, [{ topics: { title: "desc" } }]);
    expect(node).toBeInstanceOf(Nodes.Descending);
    expect(await sqlOf(node)).toMatch(/"topics"\."title" DESC|`topics`\.`title` DESC/);
    expect(rel.referencesValues?.map(String)).toContain("topics");
  });

  it("leaves a String arg unchanged", () => {
    expect(preprocess(Topic.all(), ["title ASC"])).toEqual(["title ASC"]);
  });
  it("quotes the fallback through quote_table_name, as Rails' order_column does", () => {
    const adapterClass = Topic.adapterClassSync();
    const quoteTableName = vi.spyOn(adapterClass as never, "quoteTableName");
    const quoteColumnName = vi.spyOn(adapterClass as never, "quoteColumnName");
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
