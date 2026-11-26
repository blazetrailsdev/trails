import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildViews } from "../lib/build-views.js";

function mkScratch(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "trails-tsc-scope-"));
}

function write(root: string, rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

function shim(cwd: string, rel: string): string {
  return fs.readFileSync(path.join(cwd, ".trails/views", `${rel}.ts`), "utf8");
}

describe("buildViews view scope", { timeout: 30_000 }, () => {
  it("types a namespaced controller and helper by the name its file exports", async () => {
    const cwd = mkScratch();
    write(cwd, "app/controllers/admin/posts-controller.ts", "export class PostsController {}");
    write(cwd, "app/helpers/admin/posts-helper.ts", "export const PostsHelper = {};");
    write(cwd, "app/views/admin/posts/index.html.tse", "<p></p>");
    await buildViews({ cwd });
    const out = shim(cwd, "admin/posts/index.html.tse");
    expect(out).toContain('["PostsHelper"]');
    expect(out).toContain('["PostsController"]');
    expect(out).not.toContain("AdminPosts");
  });

  it("types a view with the modules its controller passes to helper", async () => {
    const cwd = mkScratch();
    write(
      cwd,
      "lib/ext/tag-helper.ts",
      "export const TagHelper = { houseToolbar(): string { return ''; } };",
    );
    write(
      cwd,
      "app/controllers/application-controller.ts",
      [
        'import { TagHelper } from "../../lib/ext/tag-helper.ts";',
        "export class ApplicationController { static { this.helper(TagHelper); } static helper(_m: unknown): void {} }",
      ].join("\n"),
    );
    write(cwd, "app/views/posts/index.html.tse", "<%= houseToolbar() %>");
    await buildViews({ cwd });
    expect(shim(cwd, "posts/index.html.tse")).toMatch(
      /lib\/ext\/tag-helper\.js"\)\)\["TagHelper"\]/,
    );
  });

  it("types a view's params and request from its controller", async () => {
    const cwd = mkScratch();
    write(cwd, "app/controllers/posts-controller.ts", "export class PostsController {}");
    write(cwd, "app/views/posts/index.html.tse", "<p></p>");
    await buildViews({ cwd });
    expect(shim(cwd, "posts/index.html.tse")).toContain(
      'Extract<import("@blazetrails/actionview").ControllerDelegate | "request"',
    );
  });

  it("types a partial's locals from a turbo stream that renders it", async () => {
    const cwd = mkScratch();
    write(cwd, "app/models/post.ts", "export class Post { declare title: string; }");
    write(cwd, "app/controllers/posts-controller.ts", "export class PostsController {}");
    write(
      cwd,
      "app/views/posts/create.turbo_stream.tse",
      '<%= turboStream.append("posts", null, { partial: "posts/row", locals: { post: this.post } }) %>',
    );
    write(cwd, "app/views/posts/_row.html.tse", "<%= post.title %>");
    await buildViews({ cwd });
    expect(shim(cwd, "posts/_row.html.tse")).not.toContain("Record<string, unknown> & { post?");
    expect(shim(cwd, "posts/_row.html.tse")).toMatch(/"post"/);
  });

  it("looks a bare constant up through the autoloader's ConstantTable", async () => {
    const cwd = mkScratch();
    write(cwd, "app/views/posts/index.html.tse", "<%= Current.user %>");
    await buildViews({ cwd });
    expect(shim(cwd, "posts/index.html.tse")).toContain("K extends keyof ConstantTable");
  });
});
