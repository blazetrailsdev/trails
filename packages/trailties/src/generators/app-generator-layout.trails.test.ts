import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Base, Template, TseHandler } from "@blazetrails/actionview";
import { AppGenerator } from "./app-generator.js";

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

async function generatedLayout(): Promise<string> {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-layout-"));
  await new AppGenerator({
    cwd: tmpDir,
    output: () => {},
    appPath: "blog",
    database: "sqlite",
    skipDocker: true,
  }).run();
  return fs.readFileSync(
    path.join(tmpDir, "blog", "app", "views", "layouts", "application.html.tse"),
    "utf-8",
  );
}

function render(view: Base, source: string, identifier: string): string {
  return new Template(source, identifier, new TseHandler(), { locals: [], format: ":html" })
    .render(view, {}, null, undefined, (...name) => view._layoutFor(...(name as [string])))
    .toString();
}

describe("the generated application layout", () => {
  it("titles the page with content_for(:title), falling back to the app name", async () => {
    const layout = await generatedLayout();

    const view = new (Base.withEmptyTemplateCache())(null, {}, null);
    render(view, `<% contentFor("title", "Posts") %><h1>Posts</h1>`, "posts/index.html.tse");
    expect(render(view, layout, "layouts/application.html.tse")).toContain("<title>Posts</title>");

    const bare = new (Base.withEmptyTemplateCache())(null, {}, null);
    expect(render(bare, layout, "layouts/application.html.tse")).toContain("<title>Blog</title>");
  }, 30_000);
});
