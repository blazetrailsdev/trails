import { describe, it, expect } from "vitest";
import "../support/canonical-model-index.js";
import { fixtures } from "../test-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { JoinDependency } from "./join-dependency.js";
import type { JoinPart } from "./join-dependency/join-part.js";
import { Nodes, Table } from "@blazetrails/arel";

function nodeAt(jd: JoinDependency, path: string): JoinPart {
  return jd.nodes.find((n) => n.assocName === path)!;
}

function joinedTableNames(joins: Nodes.Join[]): string[] {
  return joins.map((join) => {
    const rel = join.left as Table | Nodes.TableAlias;
    return String(rel.tableAlias ?? rel.name);
  });
}

function joinFor(joins: Nodes.Join[], node: JoinPart): Nodes.Join {
  return joins.find((join) => {
    const rel = join.left as Table | Nodes.TableAlias;
    return String(rel.tableAlias ?? rel.name) === node.effectiveSqlName;
  })!;
}

describe("JoinDependency has_many :through real-table-name reuse", () => {
  fixtures({});

  it("uses real table names for through+target when no collision", () => {
    const jd = new JoinDependency(Author, null, "comments", Nodes.OuterJoin);
    const joins = jd.joinConstraints([]);
    const node = nodeAt(jd, "comments");
    expect(node).not.toBeNull();
    expect(joinFor(joins, node)).toBeInstanceOf(Nodes.OuterJoin);
    expect(node.effectiveSqlName).toBe("comments");

    const targetTable = (joinFor(joins, node) as Nodes.OuterJoin).left as Table;
    expect(targetTable.name).toBe("comments");
    expect(targetTable.tableAlias).toBeNull();

    expect(joinedTableNames(joins)).toContain("posts");
    const throughJoin = joins.find(
      (j) => String((j.left as Table).tableAlias ?? (j.left as Table).name) === "posts",
    )!;
    expect(throughJoin).toBeInstanceOf(Nodes.OuterJoin);
    expect((throughJoin.left as Table).tableAlias).toBeNull();
  });

  it("uses the Rails alias_candidate when the target real name collides", () => {
    const jd = new JoinDependency(
      Author,
      null,
      ["comments", "commentsWithForeignKey"],
      Nodes.OuterJoin,
    );
    const node = nodeAt(jd, "commentsWithForeignKey");
    expect(node).not.toBeNull();

    const joins = jd.joinConstraints([]);
    expect(node.effectiveSqlName).toBe("comments_with_foreign_keys_authors");

    const targetTable = (joinFor(joins, node) as Nodes.OuterJoin).left as Nodes.TableAlias;
    expect(targetTable.tableName).toBe("comments");
    expect(String(targetTable.tableAlias ?? targetTable.name)).toBe(
      "comments_with_foreign_keys_authors",
    );

    const throughJoin = joins.find(
      (j) => String((j.left as Table).tableAlias ?? (j.left as Table).name) === "posts",
    )!;
    expect(throughJoin).toBeDefined();
    expect((throughJoin.left as Table).tableAlias).toBeNull();
  });

  it("builds one JoinAssociation for a has_many :through, not a node per chain link", () => {
    const jd = new JoinDependency(Author, null, "comments", Nodes.OuterJoin);
    const joins = jd.joinConstraints([]);
    const node = nodeAt(jd, "comments");
    expect(node).not.toBeNull();

    const root = jd.joinRoot;
    expect(root.baseKlass).toBe(Author);
    expect(root.children.length).toBe(1);
    const targetChild = root.children[0];
    expect(targetChild.immediateAssocName).toBe("comments");
    expect(targetChild.tableName).toBe("comments");

    expect(joinedTableNames(joins)).toEqual(["posts", "comments"]);
  });

  it("emits canonical self-join aliases when a nested-through chain references a table multiple times", () => {
    const jd = new JoinDependency(Author, null, "similarPosts", Nodes.OuterJoin);
    const node = nodeAt(jd, "similarPosts");
    expect(node).not.toBeNull();

    const effectiveNames = joinedTableNames(jd.joinConstraints([]));
    expect(effectiveNames).toContain("posts_authors_join");
    expect(effectiveNames).toContain("taggings_authors_join");
    expect(effectiveNames.filter((n) => n === "taggings").length).toBe(1);
    expect(effectiveNames.filter((n) => n === "posts").length).toBe(1);

    const sql = (Author as any).all().leftJoins(":similarPosts").toSql();
    expect(sql).toMatch(/["`]taggings["`]\s+["`]taggings_authors_join["`]/);
    expect(sql).toMatch(/["`]posts["`]\s+["`]posts_authors_join["`]/);
  });

  it("aliases a referenced through-target table to the reference name when free", () => {
    const jd = new JoinDependency(Author, null, "commentsWithForeignKey", Nodes.OuterJoin);
    const target = jd.nodes.find((n) => n.immediateAssocName === "commentsWithForeignKey")!;
    expect(target.effectiveSqlName).toBe("comments");

    jd.joinConstraints([], (jd as any)._aliasTracker, [
      new Nodes.SqlLiteral("commentsWithForeignKey"),
    ]);
    expect(target.effectiveSqlName).toBe("commentsWithForeignKey");
    const targetTable = target.table as Nodes.TableAlias;
    expect(targetTable.tableName).toBe("comments");
    expect(String(targetTable.tableAlias ?? targetTable.name)).toBe("commentsWithForeignKey");

    expect(joinedTableNames(jd.joinConstraints([]))).toContain("posts");
  });

  it("reuses one chain-tail alias for two distinct through associations sharing it", () => {
    const jd = new JoinDependency(Author, null, ["comments", "taggings"], Nodes.OuterJoin);
    const effectiveNames = joinedTableNames(jd.joinConstraints([]));
    expect(effectiveNames.filter((n) => n === "posts").length).toBe(1);
    expect(effectiveNames.some((n) => n.includes("posts") && n.includes("_join"))).toBe(false);

    expect(effectiveNames).toContain("comments");
    expect(effectiveNames).toContain("taggings");
  });

  it("uses the Rails alias_candidate with _join when the through real name collides", () => {
    const jd = new JoinDependency(Author, null, ["posts", "comments"], Nodes.OuterJoin);
    const joins = jd.joinConstraints([]);
    const directNode = nodeAt(jd, "posts");
    const node = nodeAt(jd, "comments");
    expect(node).not.toBeNull();

    expect(directNode.effectiveSqlName).toBe("posts");
    const directTable = (joinFor(joins, directNode) as Nodes.OuterJoin).left as Table;
    expect(directTable.name).toBe("posts");
    expect(directTable.tableAlias).toBeNull();

    const effectiveNames = joinedTableNames(joins);
    expect(effectiveNames.filter((n) => n === "posts").length).toBe(1);
    expect(effectiveNames.some((n) => n.includes("_join"))).toBe(false);

    const targetTable = (joinFor(joins, node) as Nodes.OuterJoin).left as Table;
    expect(targetTable.name).toBe("comments");
    expect(targetTable.tableAlias).toBeNull();
  });
});
