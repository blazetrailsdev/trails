import { describe, expect, test } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { virtualize, remapLine } from "./virtualize.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(HERE, "fixtures");

function fixtureDirs(): string[] {
  return fs
    .readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

describe("virtualize — fixture pairs", () => {
  for (const name of fixtureDirs()) {
    const dir = path.join(FIXTURES_DIR, name);
    const inputPath = path.join(dir, "input.ts");
    const expectedPath = path.join(dir, "expected.ts");
    test(name, () => {
      const input = fs.readFileSync(inputPath, "utf8");
      const expected = fs.readFileSync(expectedPath, "utf8");
      const { text } = virtualize(input, inputPath);
      expect(text).toBe(expected);
    });
  }
});

describe("virtualize — deltas", () => {
  test("records one delta per injected block", () => {
    const src =
      "export class Post extends Base {\n" +
      "  static {\n" +
      '    this.attribute("title", "string");\n' +
      '    this.attribute("body", "string");\n' +
      "  }\n" +
      "}\n";
    const { deltas } = virtualize(src, "post.ts");
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.lineCount).toBe(3); // leading \n + 2 declare lines
  });

  test("no deltas when no class matches Base", () => {
    const { deltas, text } = virtualize("export class NotAModel {}\n", "nope.ts");
    expect(deltas).toHaveLength(0);
    expect(text).toBe("export class NotAModel {}\n");
  });

  test("schemaColumnsByTable injects declares for columns without attribute()", () => {
    const src =
      "export class Post extends Base {\n" +
      '  static override tableName = "posts";\n' +
      "  static {\n" +
      '    this.attribute("title", "string");\n' +
      "  }\n" +
      "}\n";
    const { text } = virtualize(src, "post.ts", {
      schemaColumnsByTable: {
        posts: { title: "string", body: "text", published_at: "datetime", views: "integer" },
      },
    });
    // User-declared `title` is NOT re-emitted.
    expect(text).toMatch(/declare title: string;/);
    expect(text.match(/declare title: string;/g)?.length).toBe(1);
    // Schema-only columns ARE emitted.
    expect(text).toMatch(/declare body: string;/);
    expect(text).toMatch(/declare published_at: Date;/);
    expect(text).toMatch(/declare views: number;/);
  });

  test("schemaColumnsByTable skips user-authored declares", () => {
    const src =
      "export class Post extends Base {\n" +
      '  static override tableName = "posts";\n' +
      "  declare body: string;\n" +
      "}\n";
    const { text } = virtualize(src, "post.ts", {
      schemaColumnsByTable: { posts: { body: "text" } },
    });
    // User already declared `body` — the virtualizer must not duplicate.
    expect(text.match(/declare body:/g)?.length).toBe(1);
  });

  test("schemaColumnsByTable skips `id`", () => {
    const src = "export class Post extends Base {}\n";
    const { text } = virtualize(src, "post.ts", {
      schemaColumnsByTable: { posts: { id: "integer", name: "string" } },
    });
    expect(text).not.toMatch(/declare id:/);
    expect(text).toMatch(/declare name: string;/);
  });

  test("schemaColumnsByTable quotes non-identifier and reserved-word column names", () => {
    const src = "export class Post extends Base {}\n";
    const { text } = virtualize(src, "post.ts", {
      schemaColumnsByTable: {
        posts: {
          "strange-col": "string",
          "2bad": "string",
          class: "string", // JS reserved — must be quoted
          static: "string", // TS-class reserved — also must be quoted
          interface: "string", // TS reserved — must be quoted
          private: "string", // TS reserved — must be quoted
          safe: "string",
        },
      },
    });
    expect(text).toMatch(/declare safe: string;/);
    expect(text).toMatch(/declare "strange-col": string;/);
    expect(text).toMatch(/declare "2bad": string;/);
    expect(text).toMatch(/declare "class": string;/);
    expect(text).toMatch(/declare "static": string;/);
    expect(text).toMatch(/declare "interface": string;/);
    expect(text).toMatch(/declare "private": string;/);
    // Bare (unquoted) reserved names would be parse errors.
    expect(text).not.toMatch(/declare class: string;/);
    expect(text).not.toMatch(/declare static: string;/);
  });

  test("schemaColumnsByTable de-dupes against user-authored quoted members", () => {
    const src = "export class Post extends Base {\n" + '  declare "strange-col": string;\n' + "}\n";
    const { text } = virtualize(src, "post.ts", {
      schemaColumnsByTable: {
        posts: { "strange-col": "string", safe: "string" },
      },
    });
    // User-authored quoted member is only written once.
    expect(text.match(/declare "strange-col":/g)?.length).toBe(1);
    // Other schema column still emitted.
    expect(text).toMatch(/declare safe: string;/);
  });

  test("schemaColumnsByTable doesn't collide with hasMany / belongsTo names", () => {
    const src =
      "export class Post extends Base {\n" +
      "  static {\n" +
      '    this.hasMany("comments");\n' +
      '    this.belongsTo("author");\n' +
      "  }\n" +
      "}\n";
    const { text } = virtualize(src, "post.ts", {
      schemaColumnsByTable: {
        posts: { comments: "string", author: "string", body: "string" },
      },
    });
    // Only one declare per name — association wins over schema column.
    expect(text.match(/declare comments:/g)?.length).toBe(1);
    expect(text.match(/declare author:/g)?.length).toBe(1);
    // Non-colliding schema column is still emitted.
    expect(text).toMatch(/declare body: string;/);
  });

  test("runtime-macro declares quote reserved / non-identifier names", () => {
    const src =
      "export class Post extends Base {\n" +
      "  static {\n" +
      '    this.attribute("class", "string");\n' +
      "  }\n" +
      "}\n";
    const { text } = virtualize(src, "post.ts");
    // Bare `declare class: ...` would be a parse error.
    expect(text).toMatch(/declare "class": string;/);
    expect(text).not.toMatch(/declare class: string;/);
  });

  test("schemaColumnsByTable emits columns in stable (sorted) order", () => {
    const src = "export class Post extends Base {}\n";
    const { text } = virtualize(src, "post.ts", {
      schemaColumnsByTable: {
        posts: { zulu: "string", alpha: "string", mike: "string" },
      },
    });
    const alphaIdx = text.indexOf("declare alpha:");
    const mikeIdx = text.indexOf("declare mike:");
    const zuluIdx = text.indexOf("declare zulu:");
    expect(alphaIdx).toBeGreaterThan(-1);
    expect(mikeIdx).toBeGreaterThan(alphaIdx);
    expect(zuluIdx).toBeGreaterThan(mikeIdx);
  });

  test("schemaColumnsByTable infers table name from class name when absent", () => {
    const src = "export class BlogPost extends Base {}\n";
    const { text } = virtualize(src, "blog-post.ts", {
      // pluralize(underscore("BlogPost")) === "blog_posts"
      schemaColumnsByTable: { blog_posts: { slug: "string" } },
    });
    expect(text).toMatch(/declare slug: string;/);
  });

  test("skip marker yields no deltas", () => {
    const src =
      "/** @trails-typegen skip */\n" +
      "export class Post extends Base {\n" +
      '  static { this.attribute("t", "string"); }\n' +
      "}\n";
    const { deltas } = virtualize(src, "skip.ts");
    expect(deltas).toHaveLength(0);
  });
});

describe("remapLine", () => {
  test("lines above injection are unchanged", () => {
    const deltas = [{ insertedAtLine: 5, lineCount: 3 }];
    expect(remapLine(2, deltas)).toBe(2);
    expect(remapLine(5, deltas)).toBe(5);
  });

  test("lines below injection subtract the inserted line count", () => {
    const deltas = [{ insertedAtLine: 5, lineCount: 3 }];
    // A diagnostic at virtualized line 10 should map back to line 7.
    expect(remapLine(10, deltas)).toBe(7);
  });

  test("lines inside the injected range return null", () => {
    const deltas = [{ insertedAtLine: 5, lineCount: 3 }];
    expect(remapLine(6, deltas)).toBeNull();
    expect(remapLine(7, deltas)).toBeNull();
    expect(remapLine(8, deltas)).toBeNull();
  });

  test("multiple deltas compose correctly", () => {
    const deltas = [
      { insertedAtLine: 5, lineCount: 2 },
      { insertedAtLine: 15, lineCount: 3 },
    ];
    // Below first injection only.
    expect(remapLine(10, deltas)).toBe(8);
    // Below both injections.
    expect(remapLine(25, deltas)).toBe(20);
    // Above everything.
    expect(remapLine(3, deltas)).toBe(3);
  });

  test("empty delta list is identity", () => {
    expect(remapLine(42, [])).toBe(42);
  });
});

describe("virtualize — prependImports", () => {
  test("prepends import type lines at the top of the file", () => {
    const src =
      "export class Post extends Base {\n" +
      '  static { this.attribute("title", "string"); }\n' +
      "}\n";
    const { text } = virtualize(src, "post.ts", {
      prependImports: ['import type { Author } from "./author.js";'],
    });
    expect(text.startsWith('import type { Author } from "./author.js";')).toBe(true);
  });

  test("inserts after leading directives (shebang, triple-slash, @ts-nocheck)", () => {
    const src =
      "#!/usr/bin/env node\n" +
      "// @ts-nocheck\n" +
      "/// <reference types='node' />\n" +
      "\n" +
      "export class Post extends Base {\n" +
      '  static { this.attribute("title", "string"); }\n' +
      "}\n";
    const { text } = virtualize(src, "post.ts", {
      prependImports: ['import type { Author } from "./author.js";'],
    });
    const lines = text.split("\n");
    // Directives should come first, then import, then the class.
    expect(lines[0]).toBe("#!/usr/bin/env node");
    expect(lines[1]).toBe("// @ts-nocheck");
    expect(lines[2]).toBe("/// <reference types='node' />");
    expect(lines[3]).toBe("");
    expect(lines[4]).toBe('import type { Author } from "./author.js";');
  });

  test("remapLine accounts for prepended lines", () => {
    const src =
      "export class Post extends Base {\n" +
      '  static { this.attribute("title", "string"); }\n' +
      "}\n";
    const { deltas } = virtualize(src, "post.ts", {
      prependImports: ['import type { A } from "./a.js";', 'import type { B } from "./b.js";'],
    });
    // 2 prepended lines → virtual line 2 is original line 0
    expect(remapLine(0, deltas)).toBeNull(); // inside prepended block
    expect(remapLine(1, deltas)).toBeNull(); // inside prepended block
    // The original file's first line (line 0) is now at virtual line 2.
    expect(remapLine(2, deltas)).toBe(0);
  });

  test("remapLine preserves leading-directive lines when imports are inserted after them", () => {
    const src =
      "#!/usr/bin/env node\n" + //         L0 (original & virtual)
      "// @ts-nocheck\n" + //              L1
      "\n" + //                            L2
      "export class Post extends Base {\n" + // L3
      '  static { this.attribute("title", "string"); }\n' + // L4
      "}\n"; //                            L5
    const { deltas } = virtualize(src, "post.ts", {
      prependImports: ['import type { Author } from "./author.js";'],
    });
    // Directive lines remain at their original line indices.
    expect(remapLine(0, deltas)).toBe(0);
    expect(remapLine(1, deltas)).toBe(1);
    expect(remapLine(2, deltas)).toBe(2);
    // The injected import sits at virtual line 3 — inside the block.
    expect(remapLine(3, deltas)).toBeNull();
    // Virtual line 4 is now the `export class Post...` line.
    expect(remapLine(4, deltas)).toBe(3);
  });
});

describe("virtualize — multiple classes", () => {
  test("remapLine is correct for lines after the second injected block", () => {
    // Two Base-descendant classes in one file. Each gets its own
    // declare block injected after `{`. `remapLine` for user-written
    // lines inside the SECOND class must account for BOTH blocks
    // having shifted the file down.
    const src =
      "export class Post extends Base {\n" + //           L0
      '  static { this.attribute("title", "string"); }\n' + // L1
      "}\n" + //                                           L2
      "\n" + //                                            L3
      "export class Comment extends Base {\n" + //         L4
      '  static { this.attribute("body", "string"); }\n' + //  L5
      "}\n"; //                                            L6
    const { text, deltas } = virtualize(src, "file.ts");
    expect(deltas).toHaveLength(2);

    const vLines = text.split("\n");
    const commentBraceVLine = vLines.findIndex((l) => l.startsWith("export class Comment"));
    expect(commentBraceVLine).toBeGreaterThan(4);
    expect(remapLine(commentBraceVLine, deltas)).toBe(4);

    // A line inside the Comment body (original line 5) should also
    // remap correctly after both injections.
    const commentBodyVLine = vLines.findIndex((l) => l.includes('this.attribute("body"'));
    expect(remapLine(commentBodyVLine, deltas)).toBe(5);

    // Injected lines (inside either block) return null.
    expect(remapLine(deltas[0]!.insertedAtLine + 1, deltas)).toBeNull();
    expect(remapLine(deltas[1]!.insertedAtLine + 1, deltas)).toBeNull();
  });
});

describe("virtualize — idempotence", () => {
  test("re-virtualizing the output skips members already declared", () => {
    const src =
      "export class Post extends Base {\n" +
      '  static { this.attribute("title", "string"); }\n' +
      "}\n";
    const once = virtualize(src, "post.ts").text;
    const twice = virtualize(once, "post.ts").text;
    expect(twice).toBe(once);
  });
});
