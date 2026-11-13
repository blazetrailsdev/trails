import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createArTrailsProgram, getPreEmitDiagnostics } from "../../lib/tsc-wrapper/ar-program.js";
import { loadFixtureFiles } from "../../lib/tsc-wrapper/cli.js";

const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

async function diagnosticsFor(testBody: string): Promise<string[]> {
  const root = fs.mkdtempSync(path.join(FIXTURES_DIR, ".fixture-sets-"));
  try {
    const write = (file: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), text);
    };
    write(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          types: [],
        },
        include: ["app/**/*.ts", "test/**/*.ts"],
      }),
    );
    write("app/models/model.ts", fs.readFileSync(path.join(FIXTURES_DIR, "model.ts"), "utf8"));
    write(
      "app/models/post.ts",
      'import { Base } from "./model.js";\nexport class Post extends Base {}\n',
    );
    write(
      "app/models/comment.ts",
      'import { Base } from "./model.js";\nexport class Comment extends Base {}\n',
    );
    write(
      "test/fixtures/posts.yml",
      "DEFAULTS: &DEFAULTS\n  title: t\n\none:\n  <<: *DEFAULTS\n\ntwo:\n  title: <%= 1 %>\n",
    );
    write(
      "test/fixtures/admin/posts.yml",
      "_fixture:\n  model_class: Comment\n\nfirst:\n  body: b\n",
    );
    write("test/fixtures/admin/comments.yml", "first:\n  body: b\n");
    write("test/fixtures/tags.yml", "<% 3.times do |i| %>\ntag_<%= i %>:\n  name: n\n<% end %>\n");
    write(
      "test/test-helper.ts",
      [
        'import { TestCase } from "@blazetrails/activesupport/test-case";',
        'TestCase.fixtures(":all");',
        "TestCase.setFixtureClass({ tags: Post });",
        'import { Post } from "../app/models/post.js";',
        "",
      ].join("\n"),
    );
    write(
      "test/models/post.test.ts",
      [
        'import { TestCase } from "@blazetrails/activesupport/test-case";',
        'import type { Post } from "../../app/models/post.js";',
        'import type { Comment } from "../../app/models/comment.js";',
        'import "../test-helper.js";',
        "export class PostTest extends TestCase {",
        "  async check(): Promise<void> {",
        testBody,
        "  }",
        "}",
        "",
      ].join("\n"),
    );
    const configPath = path.join(root, "tsconfig.json");
    const { program } = createArTrailsProgram(configPath, {
      fixtureFiles: await loadFixtureFiles(root),
    });
    return getPreEmitDiagnostics(program)
      .filter((d) => d.fileName?.endsWith("post.test.ts"))
      .map((d) => d.text);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("trails-tsc fixture set accessors", () => {
  it("types every set under test/fixtures/ by its model", async () => {
    expect(
      await diagnosticsFor(
        [
          'const post: Post = await this.posts("one");',
          'const comment: Comment = await this.admin_posts("first");',
          'const tagged: Post = await this.tags("tag_0");',
          'void [post, comment, tagged, this.posts("one", "two")];',
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("reports a label the set's file does not define", async () => {
    const errors = await diagnosticsFor(
      'await this.posts("DEFAULTS");\nawait this.admin_posts("nope");',
    );
    expect(errors).toEqual(["No overload matches this call.", "No overload matches this call."]);
  });

  it("does not resolve a namespaced set to a top-level model of the same short name", async () => {
    expect(
      await diagnosticsFor('const comment: Comment = await this.admin_comments("first");'),
    ).toEqual(["Type 'unknown' is not assignable to type 'Comment'."]);
  });
});
