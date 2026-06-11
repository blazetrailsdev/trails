/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, beforeEach, afterEach, expect } from "vitest";
import { MigrationContext } from "./migration.js";
import { createTestAdapter, adapterType } from "./test-adapter.js";
import { itIfSupports } from "./test-helpers/supports.js";

describe("CommentTest", () => {
  let adapter: ReturnType<typeof createTestAdapter>;
  let ctx: MigrationContext;

  beforeEach(async () => {
    adapter = createTestAdapter();
    ctx = new MigrationContext(adapter);
    await ctx.createTable("commenteds", { comment: "A table with comment", force: true }, (t) => {
      t.string("name", { comment: "Comment should help clarify the column purpose" });
      t.boolean("obvious", { comment: "Question is: should you comment obviously named objects?" });
      t.string("content");
      t.index(["name"], {
        comment: '"Very important" index that powers all the performance.\nAnd it\'s fun!',
      });
    });
    await ctx.createTable("blank_comments", { comment: " ", force: true }, (t) => {
      t.string("space_comment", { comment: " " });
      t.string("empty_comment", { comment: "" });
      t.string("nil_comment", { comment: null as any });
      t.string("absent_comment");
      t.index(["space_comment"], { comment: " " });
      t.index(["empty_comment"], { comment: "" });
      t.index(["nil_comment"], { comment: null as any });
      t.index(["absent_comment"]);
    });
    await ctx.createTable(
      "pk_commenteds",
      { comment: "Table comment", id: false, force: true } as any,
      (t) => {
        t.column("id", "primary_key", { comment: "Primary key comment" });
      },
    );
  });

  afterEach(async () => {
    await ctx.dropTable("commenteds", { ifExists: true });
    await ctx.dropTable("blank_comments", { ifExists: true });
    await ctx.dropTable("pk_commenteds", { ifExists: true });
  });

  itIfSupports("comments", "default primary key comment", async () => {
    const id = (await (adapter as any).columns("commenteds")).find((c: any) => c.name === "id");
    expect(id?.comment).toBeNull();
  });

  itIfSupports("comments", "column created in block", async () => {
    const col = (await (adapter as any).columns("commenteds")).find((c: any) => c.name === "name")!;
    expect(col.type).toBe("string");
    expect(col.comment).toBe("Comment should help clarify the column purpose");
  });

  itIfSupports("comments", "blank columns created in block", async () => {
    const cols = await (adapter as any).columns("blank_comments");
    const byName = Object.fromEntries(cols.map((c: any) => [c.name, c]));
    for (const field of ["space_comment", "empty_comment", "nil_comment", "absent_comment"]) {
      expect(byName[field]?.type).toBe("string");
      expect(byName[field]?.comment).toBeNull();
    }
  });

  itIfSupports("comments", "add column with comment later", async () => {
    await ctx.addColumn("commenteds", "rating", "integer", {
      comment: "I am running out of imagination",
    });
    const cols = await (adapter as any).columns("commenteds");
    const col = cols.find((c: any) => c.name === "rating")!;
    expect(col.type).toBe("integer");
    expect(col.comment).toBe("I am running out of imagination");
  });

  itIfSupports("comments", "add index with comment later", async () => {
    await ctx.addIndex("commenteds", "obvious", {
      name: "idx_obvious",
      comment: "We need to see obvious comments",
    });
    const indexes = await (adapter as any).indexes("commenteds");
    const index = indexes.find((idef: any) => idef.name === "idx_obvious")!;
    expect(index.comment).toBe("We need to see obvious comments");
  });

  itIfSupports("comments", "blank indexes created in block", async () => {
    const indexes = await (adapter as any).indexes("blank_comments");
    for (const index of indexes) {
      expect(index.comment ?? null).toBeNull();
    }
  });

  itIfSupports("comments", "add comment to column", async () => {
    await ctx.changeColumn("commenteds", "content", "string", {
      comment: "Whoa, content describes itself!",
    });
    const cols = await (adapter as any).columns("commenteds");
    const col = cols.find((c: any) => c.name === "content")!;
    expect(col.type).toBe("string");
    expect(col.comment).toBe("Whoa, content describes itself!");
  });

  itIfSupports("comments", "remove comment from column", async () => {
    await ctx.changeColumn("commenteds", "obvious", "string", { comment: null as any });
    const cols = await (adapter as any).columns("commenteds");
    const col = cols.find((c: any) => c.name === "obvious")!;
    expect(col.type).toBe("string");
    expect(col.comment).toBeNull();
  });

  itIfSupports("comments", "rename column preserves comment", async () => {
    await ctx.addColumn("commenteds", "rating", "string", {
      comment: "I am running out of imagination",
    });
    await ctx.renameColumn("commenteds", "rating", "new_rating");
    const cols = await (adapter as any).columns("commenteds");
    const col = cols.find((c: any) => c.name === "new_rating")!;
    expect(col.type).toBe("string");
    expect(col.comment).toBe("I am running out of imagination");
  });

  itIfSupports("comments", "schema dump with comments", async () => {
    const { SchemaDumper } = await import("./schema-dumper.js");
    await ctx.addColumn("commenteds", "rating", "integer", {
      comment: "I am running out of imagination",
    });
    await ctx.changeColumn("commenteds", "content", "string", {
      comment: "Whoa, content describes itself!",
    });
    await ctx.changeColumn("commenteds", "obvious", "string", { comment: null as any });
    const output = await SchemaDumper.dump(adapter);
    expect(output).toMatch(/createTable.*"commenteds".*comment:\s*"A table with comment"/);
    expect(output).toMatch(
      /t\.\w+\("name"[^)]*\{[^}]*comment:\s*"Comment should help clarify the column purpose"/,
    );
    expect(output).toMatch(/t\.\w+\("obvious"\)\s*;/);
    expect(output).toMatch(
      /t\.\w+\("content"[^)]*\{[^}]*comment:\s*"Whoa, content describes itself!"/,
    );
    expect(output).toMatch(
      /t\.\w+\("rating"[^)]*\{[^}]*comment:\s*"I am running out of imagination"/,
    );
  });

  itIfSupports("comments", "schema dump omits blank comments", async () => {
    const { SchemaDumper } = await import("./schema-dumper.js");
    const output = await SchemaDumper.dump(adapter);
    expect(output).toMatch(/createTable.*"blank_comments"/);
    expect(output).not.toMatch(/createTable.*"blank_comments".*comment:/);
    for (const field of ["space_comment", "empty_comment", "nil_comment", "absent_comment"]) {
      expect(output).toMatch(new RegExp(`t\\.\\w+\\("${field}"\\)\\s*;`));
      expect(output).not.toMatch(new RegExp(`t\\.\\w+\\("${field}"[^)]*comment:`));
    }
  });

  itIfSupports("comments", "change table comment", async () => {
    await (ctx as any).changeTableComment("commenteds", "Edited table comment");
    const tableComment = await (adapter as any).tableComment("commenteds");
    expect(tableComment).toBe("Edited table comment");
  });

  itIfSupports("comments", "change table comment to nil", async () => {
    await (ctx as any).changeTableComment("commenteds", null);
    const tableComment = await (adapter as any).tableComment("commenteds");
    expect(tableComment).toBeNull();
  });

  itIfSupports("comments", "change column comment", async () => {
    await (ctx as any).changeColumnComment("commenteds", "id", "Edited column comment");
    const col = (await (adapter as any).columns("commenteds")).find((c: any) => c.name === "id")!;
    expect(col.comment).toBe("Edited column comment");
    if (adapterType === "mysql") {
      expect((col as any).autoIncrement).toBe(true);
    }
  });

  itIfSupports("comments", "change column comment to nil", async () => {
    await (ctx as any).changeColumnComment("commenteds", "name", null);
    const col = (await (adapter as any).columns("commenteds")).find((c: any) => c.name === "name")!;
    expect(col.comment).toBeNull();
  });

  itIfSupports("comments", "comment on primary key", async () => {
    const cols = await (adapter as any).columns("pk_commenteds");
    const col = cols.find((c: any) => c.name === "id")!;
    expect(col.comment).toBe("Primary key comment");
    const tableComment = await (adapter as any).tableComment("pk_commenteds");
    expect(tableComment).toBe("Table comment");
  });

  itIfSupports("comments", "schema dump with primary key comment", async () => {
    const { SchemaDumper } = await import("./schema-dumper.js");
    const output = await SchemaDumper.dump(adapter);
    // Tight: the id hash must carry ONLY the comment (no limit/precision/scale/autoIncrement
    // leak), and the table comment must be separate. Catches the columnSpecForPrimaryKey
    // wrapping regression.
    expect(output).toMatch(
      /createTable.*"pk_commenteds".*id:\s*\{\s*comment:\s*"Primary key comment"\s*\}.*comment:\s*"Table comment"/,
    );
  });
});
