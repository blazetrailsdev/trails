import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript-5";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { decodeLineMappings } from "@blazetrails/tse-compiler";
import { buildViews } from "./build-views.js";
import { runCli } from "./cli.js";
import { diagnose } from "./plugins/tse-diagnose.js";

function mkScratch(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "trails-tsc-build-"));
}

function viewDiagnostics(cwd: string): string[] {
  const dir = path.join(cwd, ".trails/views");
  const roots = fs
    .readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".tse.ts"))
    .map((f) => path.join(dir, f));
  const program = ts.createProgram(roots, {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ESNext,
  });
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file?.fileName.startsWith(dir))
    .map((d) => {
      const rel = path.relative(dir, d.file!.fileName);
      return `${rel}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`;
    });
}

function write(root: string, rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

describe("buildViews", () => {
  it("mirrors .tse files to .trails/views/ as typecheck shims", async () => {
    const cwd = mkScratch();
    write(cwd, "app/views/users/show.html.tse", "<h1><%= name %></h1>");
    write(cwd, "app/views/users/edit.html.tse", "<%# locals: (name:) %>edit");
    write(cwd, "app/views/posts/index.html.tse", "list");

    const { count, files } = await buildViews({ cwd });

    expect(count).toBe(3);
    expect(files).toEqual(["posts/index.html.tse", "users/edit.html.tse", "users/show.html.tse"]);

    const shim = fs.readFileSync(path.join(cwd, ".trails/views/users/show.html.tse.ts"), "utf8");
    expect(shim).toContain("export default function render(");
    expect(shim).toContain("_ob.append(name)");
  });

  it("emits no runtime module — templates render from .tse source at request time", async () => {
    const cwd = mkScratch();
    write(cwd, "app/views/users/show.html.tse", "ok");

    await buildViews({ cwd });

    expect(fs.existsSync(path.join(cwd, ".trails/views/users/show.html.tse.js"))).toBe(false);
    expect(fs.existsSync(path.join(cwd, ".trails/views/users/show.html.tse.js.map"))).toBe(false);
    expect(fs.existsSync(path.join(cwd, ".trails/views-manifest.ts"))).toBe(false);
  });

  it("is a no-op when the views dir is absent", async () => {
    const cwd = mkScratch();
    const { count } = await buildViews({ cwd });
    expect(count).toBe(0);
  });

  it("clears stale outputs from a prior build", async () => {
    const cwd = mkScratch();
    write(cwd, "app/views/users/show.html.tse", "first");
    write(cwd, "app/views/users/gone.html.tse", "doomed");
    await buildViews({ cwd });
    expect(fs.existsSync(path.join(cwd, ".trails/views/users/gone.html.tse.ts"))).toBe(true);

    fs.rmSync(path.join(cwd, "app/views/users/gone.html.tse"));
    const { count } = await buildViews({ cwd });
    expect(count).toBe(1);
    expect(fs.existsSync(path.join(cwd, ".trails/views/users/gone.html.tse.ts"))).toBe(false);
  }, 30_000);

  it("deletes a views-manifest.ts left behind by an older build", async () => {
    const cwd = mkScratch();
    write(cwd, "app/views/users/show.html.tse", "first");
    await buildViews({ cwd });
    const manifest = path.join(cwd, ".trails/views-manifest.ts");
    fs.writeFileSync(manifest, "export const views = {} as const;\n");

    await buildViews({ cwd });

    expect(fs.existsSync(manifest)).toBe(false);
  }, 30_000);

  it("refuses to build when outDir is a symlink escaping cwd", async () => {
    const cwd = mkScratch();
    const elsewhere = mkScratch();
    fs.symlinkSync(elsewhere, path.join(cwd, ".trails"));
    write(cwd, "app/views/home.html.tse", "x");
    await expect(buildViews({ cwd })).rejects.toThrow(/symlink escape/);
    expect(fs.existsSync(elsewhere)).toBe(true);
  });

  it("honors custom viewsDir / outDir", async () => {
    const cwd = mkScratch();
    write(cwd, "src/templates/home.html.tse", "hi");
    await buildViews({ cwd, viewsDir: "src/templates", outDir: "build/.gen" });
    expect(fs.existsSync(path.join(cwd, "build/.gen/views/home.html.tse.ts"))).toBe(true);
  });

  it("emits template-registry-augmentation.d.ts keyed by Rails partial name", async () => {
    const cwd = mkScratch();
    write(
      cwd,
      "app/views/users/_user.html.tse",
      "<%# locals: (name:, role: 'guest') %><%= name %>",
    );
    write(cwd, "app/views/posts/index.html.tse", "<%# locals: (page:) %>list");
    write(cwd, "app/views/shared/_nav.html.tse", "nav");

    await buildViews({ cwd });

    const aug = fs.readFileSync(
      path.join(cwd, ".trails/template-registry-augmentation.d.ts"),
      "utf8",
    );
    expect(aug).toContain("export {};");
    expect(aug).toContain('declare module "@blazetrails/actionview"');
    expect(aug).toContain("interface TemplateRegistry");
    expect(aug).toContain('"users/user"');
    expect(aug).not.toContain('"users/_user.html"');
    expect(aug).toContain("name: unknown");
    expect(aug).toContain("role?: unknown");
    expect(aug).not.toContain("posts/index");
    expect(aug).not.toContain("shared/nav");
    expect(aug).toContain("AUTO-GENERATED");
  });

  it("intersects locals types when a partial exists as multiple formats", async () => {
    const cwd = mkScratch();
    write(
      cwd,
      "app/views/users/_user.html.tse",
      "<%# locals: (name:, role: 'guest') %><%= name %>",
    );
    write(cwd, "app/views/users/_user.json.tse", "<%# locals: (name:, email:) %><%= name %>");

    await buildViews({ cwd });

    const aug = fs.readFileSync(
      path.join(cwd, ".trails/template-registry-augmentation.d.ts"),
      "utf8",
    );
    expect(aug).toContain('"users/user"');
    expect(aug).toMatch(/\(NoExtraKeys<\{[^}]+\}>\)\s*&\s*\(NoExtraKeys<\{[^}]+\}>\)/);
  });

  it("multi-format intersection augmentation satisfies tsc semantic check", async () => {
    const cwd = mkScratch();
    write(
      cwd,
      "app/views/users/_user.html.tse",
      "<%# locals: (name:, role: 'guest') %><%= name %>",
    );
    write(cwd, "app/views/users/_user.json.tse", "<%# locals: (name:, email:) %><%= name %>");

    await buildViews({ cwd });

    const aug = fs.readFileSync(
      path.join(cwd, ".trails/template-registry-augmentation.d.ts"),
      "utf8",
    );
    const localsType = aug.match(/"users\/user":\s*(.+);/)?.[1];
    expect(localsType).toBeDefined();
    const registryStub = [
      "export type NoExtraKeys<T> = T & { [K in Exclude<string, keyof T>]?: never };",
      "export type TemplateLocals<T> = T;",
      `export interface TemplateRegistry { "users/user": ${localsType}; }`,
    ].join("\n");

    const check = (code: string) =>
      diagnose(
        `import type { TemplateRegistry } from "@blazetrails/actionview";\n` +
          `type R = TemplateRegistry["users/user"];\n` +
          code,
        { customStub: registryStub },
      );

    expect(check("const a: R extends { name: unknown } ? 1 : 2 = 1; void a;")).toEqual([]);
    expect(check("const a: R extends { email: unknown } ? 1 : 2 = 1; void a;")).toEqual([]);
    expect(check("const a: R extends { role: unknown } ? 1 : 2 = 2; void a;")).toEqual([]);
    expect(
      check("const a: R extends { name: unknown } ? 1 : 2 = 2; void a;").length,
    ).toBeGreaterThan(0);
  }, 30_000);

  it("emits an empty augmentation when no partials have a locals directive", async () => {
    const cwd = mkScratch();
    write(cwd, "app/views/home.html.tse", "plain template");
    write(cwd, "app/views/shared/_nav.html.tse", "nav without locals");

    await buildViews({ cwd });

    const aug = fs.readFileSync(
      path.join(cwd, ".trails/template-registry-augmentation.d.ts"),
      "utf8",
    );
    expect(aug).toContain("export {};");
    expect(aug).toContain('declare module "@blazetrails/actionview"');
    expect(aug).toContain("interface TemplateRegistry {");
    expect(aug).toContain("AUTO-GENERATED");
  });

  it("emits all 4 artifacts with correct source map references", async () => {
    const cwd = mkScratch();
    const src = "<h1><%= name %></h1>";
    write(cwd, "app/views/users/show.html.tse", src);
    await buildViews({ cwd });
    const base = path.join(cwd, ".trails/views/users/show.html.tse");
    const mapDir = path.dirname(base);
    const srcPath = path.join(cwd, "app/views/users/show.html.tse");
    for (const ext of [".ts", ".ts.map", ".d.ts", ".d.ts.map"]) {
      expect(fs.existsSync(base + ext), `missing ${ext}`).toBe(true);
    }
    const tsMap = JSON.parse(fs.readFileSync(base + ".ts.map", "utf8"));
    expect(path.resolve(mapDir, tsMap.sources[0])).toBe(srcPath);
    expect(tsMap.sourcesContent).toEqual([src]);
    const dtsMap = JSON.parse(fs.readFileSync(base + ".d.ts.map", "utf8"));
    expect(dtsMap.sources).toEqual(["show.html.tse.ts"]);
    const shim = fs.readFileSync(base + ".ts", "utf8");
    expect(shim).toContain("//# sourceMappingURL=show.html.tse.ts.map");
  });

  it("tse virtual shim includes TemplateRegistry import and render overloads", async () => {
    const cwd = mkScratch();
    write(cwd, "app/views/users/_user.html.tse", "<%= name %>");

    await buildViews({ cwd });

    const shim = fs.readFileSync(path.join(cwd, ".trails/views/users/_user.html.tse.ts"), "utf8");
    expect(shim).toContain(
      'import type { TemplateRegistry, TemplateLocals } from "@blazetrails/actionview"',
    );
    expect(shim).toContain("render<P extends string>");
    expect(shim).toContain("P extends keyof TemplateRegistry");
    expect(shim).toContain("{ partial: P } &");
    expect(shim).toContain("{} extends TemplateLocals<TemplateRegistry[P]>");
    expect(shim).toContain("{ locals: TemplateLocals<TemplateRegistry[P]> }");
  });

  it("makes an unresolved name an error once every render site of the template is resolved", async () => {
    const cwd = mkScratch();
    write(
      cwd,
      "node_modules/@blazetrails/actionview/package.json",
      '{ "name": "@blazetrails/actionview", "types": "index.d.ts" }',
    );
    write(
      cwd,
      "node_modules/@blazetrails/actionview/index.d.ts",
      [
        "export interface TemplateRegistry {}",
        "export type TemplateLocals<T> = T;",
        "export declare class Base { render(...args: unknown[]): string; }",
      ].join("\n"),
    );
    write(cwd, "app/models/post.ts", 'export class Post { title = ""; }');
    write(
      cwd,
      "app/controllers/posts-controller.ts",
      [
        'import type { Post } from "../models/post.js";',
        "export class PostsController { declare posts: Post[]; declare post: Post; }",
      ].join("\n"),
    );
    write(
      cwd,
      "app/views/posts/index.html.tse",
      "<% for (const post of this.posts) { %><%= render(post) %><% } %><%= psot.title %>",
    );
    write(cwd, "app/views/posts/show.html.tse", "<%= render(this.post) %>");
    write(cwd, "app/views/posts/new.html.tse", '<%= render("form", { post: this.post }) %>');
    write(cwd, "app/views/posts/_post.html.tse", "<%= post.title %><%= psot.title %>");
    write(cwd, "app/views/posts/_form.html.tse", "<%= post.title %><%= psot.title %>");
    await buildViews({ cwd });
    const diagnostics = viewDiagnostics(cwd);
    expect(diagnostics).toEqual(
      ["posts/_form", "posts/_post", "posts/index"].map(
        (rel) => `${rel}.html.tse.ts: Property 'title' does not exist on type 'never'.`,
      ),
    );
  }, 30_000);

  it("keeps the any fallback for a partial some unresolved render site may reach", async () => {
    const cwd = mkScratch();
    write(cwd, "app/models/post.ts", "export class Post {}");
    write(cwd, "app/views/posts/_post.html.tse", "<%= psot %>");
    write(cwd, "app/views/posts/_form.html.tse", "<%= psot %>");
    write(cwd, "app/views/posts/_row.html.tse", "<%= psot %>");
    write(cwd, "app/views/posts/new.html.tse", '<%= render("form") %><%= render("row") %>');
    const shim = (rel: string): string =>
      fs.readFileSync(path.join(cwd, ".trails/views/posts", `${rel}.html.tse.ts`), "utf8");
    await buildViews({ cwd });
    expect(shim("_form")).toContain("      : never;");
    expect(shim("_row")).toContain("      : never;");
    expect(shim("new")).toContain("      : never;");
    write(
      cwd,
      "app/views/posts/edit.html.tse",
      '<% const name: string = "row"; %><%= render({ partial: "row", collection: [1], as: name }) %>',
    );
    await buildViews({ cwd });
    expect(shim("_form")).toContain("      : never;");
    expect(shim("_row")).toContain("      : any;");
    write(
      cwd,
      "app/views/posts/show.html.tse",
      '<% const someVariable: string = "form"; %><%= render(someVariable) %>',
    );
    await buildViews({ cwd });
    for (const partial of ["_post", "_form", "_row"])
      expect(shim(partial)).toContain("      : any;");
    expect(shim("show")).toContain("      : never;");
  }, 30_000);

  it("reads a hash render's second argument as a block only when it is a function", async () => {
    const cwd = mkScratch();
    write(cwd, "app/views/posts/_row.html.tse", "<%= psot %>");
    write(cwd, "app/views/posts/_boxed.html.tse", "<%= psot %>");
    write(
      cwd,
      "app/views/posts/show.html.tse",
      '<%= render({ partial: "row" }, { post: 1 }) %><%= render({ layout: "boxed", locals: { post: 1 } }, () => "") %>',
    );
    await buildViews({ cwd });
    const shim = (rel: string): string =>
      fs.readFileSync(path.join(cwd, ".trails/views/posts", `${rel}.html.tse.ts`), "utf8");
    expect(shim("_row")).toContain("type ObjectLocals = {};");
    expect(shim("_row")).toContain("      : never;");
    expect(shim("_boxed")).toContain("type ObjectLocals = { post: number };");
  }, 30_000);

  it("keeps the any fallback for a template a controller render passes locals to", async () => {
    const cwd = mkScratch();
    write(
      cwd,
      "app/controllers/posts-controller.ts",
      [
        "export class PostsController {",
        "  render(..._args: unknown[]): void {}",
        '  show(options: object): void { this.render("show", options); }',
        '  edit(): void { this.render("edit", { status: "unprocessable_entity" }); }',
        '  rows(as: string): void { this.render({ partial: "row", collection: [1], as }); }',
        "}",
      ].join("\n"),
    );
    for (const rel of ["show", "edit", "_row", "_form"]) {
      write(cwd, `app/views/posts/${rel}.html.tse`, "<%= foo %>");
    }
    await buildViews({ cwd });
    const shim = (rel: string): string =>
      fs.readFileSync(path.join(cwd, ".trails/views/posts", `${rel}.html.tse.ts`), "utf8");
    expect(shim("show")).toContain("      : any;");
    expect(shim("edit")).toContain("      : never;");
    expect(shim("_row")).toContain("      : any;");
    expect(shim("_form")).toContain("      : never;");
  }, 30_000);
});

describe("runCli", () => {
  it("dispatches `build` to buildViews with --cwd", async () => {
    const cwd = mkScratch();
    write(cwd, "app/views/home.html.tse", "x");
    const rc = await runCli(["build", "--cwd", cwd]);
    expect(rc).toBe(0);
    expect(fs.existsSync(path.join(cwd, ".trails/views/home.html.tse.ts"))).toBe(true);
  });

  it("rejects unknown commands with a non-zero exit", async () => {
    expect(await runCli(["bogus"])).toBe(1);
  });

  it("rejects a value-flag without a value", async () => {
    expect(await runCli(["build", "--cwd"])).toBe(1);
  });

  it("catches buildViews errors and returns 1 instead of throwing", async () => {
    const cwd = mkScratch();
    expect(await runCli(["build", "--cwd", cwd, "--out", "/tmp/elsewhere"])).toBe(1);
  });

  it("prints usage for --help and exits 0", async () => {
    expect(await runCli(["--help"])).toBe(0);
  });

  afterEach(() => vi.restoreAllMocks());

  it("`dev` runs an initial build and starts the watcher", async () => {
    vi.spyOn(process, "exit").mockImplementation(((_c?: number) => undefined) as never);
    const cwd = mkScratch();
    write(cwd, "app/views/home.html.tse", "hi");
    const rc = await runCli(["dev", "--cwd", cwd]);
    expect(rc).toBe(0);
    expect(fs.existsSync(path.join(cwd, ".trails/views/home.html.tse.ts"))).toBe(true);
    process.emit("SIGINT");
  });

  it("scopes a view to app/helpers, the controller's declared ivars and the partial's model", async () => {
    const cwd = mkScratch();
    write(cwd, "app/helpers/posts-helper.ts", "export const PostsHelper = {};");
    write(cwd, "app/helpers/admin/users-helper.ts", "export const AdminUsersHelper = {};");
    write(
      cwd,
      "app/controllers/posts-controller.ts",
      [
        'import { Tracking } from "./concerns/tracking.js";',
        "function include(..._modules: unknown[]): void {}",
        "export class PostsController {",
        '  static { this.helperMethod("currentPost"); include(this, Tracking); }',
        '  private currentPost(): string { return ""; }',
        "  tracked(): number { return 1; }",
        "  other(): boolean { return true; }",
        "  static helperMethod(..._names: string[]): void {}",
        "}",
      ].join("\n"),
    );
    write(
      cwd,
      "app/controllers/admin/blog-posts-controller.ts",
      "export class AdminBlogPostsController { declare posts: string[]; }",
    );
    write(cwd, "app/models/admin/blog-post.ts", "export class AdminBlogPost {}");
    write(cwd, "app/views/admin/blog_posts/_blog_post.html.tse", "<%= blog_post %>");
    write(
      cwd,
      "app/controllers/concerns/tracking.ts",
      'export const Tracking = { included(base: { helperMethod(n: string): void }) { base.helperMethod("tracked"); } };',
    );
    write(
      cwd,
      "app/controllers/concerns/unused/other.ts",
      'export const Other = { included(base: { helperMethod(n: string): void }) { base.helperMethod("other"); } };',
    );
    write(cwd, "app/models/post.ts", "export class Post {}");
    write(cwd, "app/views/posts/_post.html.tse", "<%= post %>");
    write(cwd, "app/views/layouts/application.html.tse", "<%= yield %>");
    write(cwd, "app/views/comments/_post.html.tse", "<%= post %>");
    await buildViews({ cwd });
    const shim = fs.readFileSync(path.join(cwd, ".trails/views/posts/_post.html.tse.ts"), "utf8");
    expect(shim).toContain(
      '(typeof import("../../../app/helpers/posts-helper.js"))["PostsHelper"]',
    );
    expect(shim).toContain(
      '(typeof import("../../../app/helpers/admin/users-helper.js"))["AdminUsersHelper"]',
    );
    expect(shim).toContain('{ "currentPost": () => string; "tracked": () => number }');
    expect(shim).toContain(
      'type ObjectLocals = { post: import("../../../app/models/post.js").Post };',
    );
    const layout = fs.readFileSync(
      path.join(cwd, ".trails/views/layouts/application.html.tse.ts"),
      "utf8",
    );
    expect(layout).not.toContain("Controller");
    expect(layout).toContain("type ObjectLocals = {};");
    write(
      cwd,
      "app/controllers/application-controller.ts",
      [
        "export class ApplicationController {",
        '  static { this.helperMethod(["signedIn", "currentUser"]); }',
        "  static helperMethod(..._names: unknown[]): void {}",
        "  private signedIn(): boolean { return true; }",
        '  private currentUser(): string { return ""; }',
        "}",
      ].join("\n"),
    );
    await buildViews({ cwd });
    const applicationLayout = fs.readFileSync(
      path.join(cwd, ".trails/views/layouts/application.html.tse.ts"),
      "utf8",
    );
    expect(applicationLayout).toContain(
      '{ "signedIn": () => boolean; "currentUser": () => string }',
    );
    const notCollection = fs.readFileSync(
      path.join(cwd, ".trails/views/comments/_post.html.tse.ts"),
      "utf8",
    );
    expect(notCollection).toContain("type ObjectLocals = {};");
  }, 30_000);

  it("exposes helperMethod names only from class-level macro positions", async () => {
    const cwd = mkScratch();
    write(
      cwd,
      "app/controllers/posts-controller.ts",
      [
        'import { Tracking } from "./concerns/tracking.js";',
        "function include(..._modules: unknown[]): void {}",
        'import { ApplicationController } from "./application-controller.js";',
        "const other = { helperMethod(..._names: string[]): void {} };",
        "export class PostsController extends ApplicationController {",
        '  static exposed = PostsController.helperMethod("field");',
        '  static { this.helperMethod("own"); include(this, Tracking); other.helperMethod("foreign"); }',
        '  run(): void { PostsController.helperMethod("hidden"); }',
        '  private hidden(): string { return ""; }',
        '  private foreign(): string { return ""; }',
        "  private late(): number { return 1; }",
        "  private field(): boolean { return true; }",
        "  private tracked(): symbol { return Symbol(); }",
        "  private own(): bigint { return 1n; }",
        "  private nested(): null { return null; }",
        "  private inherited(): undefined { return undefined; }",
        "  static helperMethod(..._names: string[]): void {}",
        "}",
        'PostsController.helperMethod("late");',
      ].join("\n"),
    );
    write(
      cwd,
      "app/controllers/concerns/tracking.ts",
      [
        'import { Nested } from "./nested.js";',
        "function include(..._modules: unknown[]): void {}",
        "export const Tracking = {",
        "  included(base: { helperMethod(n: string): void }) {",
        '    base.helperMethod("tracked");',
        "    include(base, Nested);",
        "  },",
        "};",
      ].join("\n"),
    );
    write(
      cwd,
      "app/controllers/concerns/nested.ts",
      [
        "const included = Symbol();",
        "export const Nested = {",
        '  [included]: (base: { helperMethod(n: string): void }) => base.helperMethod("nested"),',
        "};",
      ].join("\n"),
    );
    write(
      cwd,
      "app/controllers/application-controller.ts",
      [
        "export class ApplicationController {",
        "  static helperMethod(..._names: string[]): void {}",
        "}",
        'ApplicationController.helperMethod("inherited");',
      ].join("\n"),
    );
    write(cwd, "app/views/posts/index.html.tse", "hi");
    await buildViews({ cwd });
    const shim = fs.readFileSync(path.join(cwd, ".trails/views/posts/index.html.tse.ts"), "utf8");
    expect(shim).toContain('"late": () => number');
    expect(shim).toContain('"field": () => boolean');
    expect(shim).toContain('"tracked": () => symbol');
    expect(shim).toContain('"own": () => bigint');
    expect(shim).toContain('"nested": () => null');
    expect(shim).toContain('"inherited": () => undefined');
    expect(shim).not.toContain('"hidden"');
    expect(shim).not.toContain('"foreign"');
  }, 30_000);

  it("writes a source map pointing each shim line at its .tse line", async () => {
    const cwd = mkScratch();
    write(cwd, "app/views/posts/show.html.tse", "<div>\n  <p>\n    <%= readingTime(1) %>\n</div>");
    await buildViews({ cwd });
    const base = path.join(cwd, ".trails/views/posts/show.html.tse.ts");
    const lines = fs.readFileSync(base, "utf8").split("\n");
    const map = JSON.parse(fs.readFileSync(base + ".map", "utf8"));
    const genLine = lines.findIndex((l) => l.includes("readingTime(1)"));
    expect(decodeLineMappings(map.mappings)).toContainEqual(
      expect.objectContaining({ genLine, srcLine: 2, srcCol: 8 }),
    );
  });

  it("types a partial's passed locals from every render call that passes them", async () => {
    const cwd = mkScratch();
    write(cwd, "app/views/posts/new.html.tse", '<%= render("form", { post: 1, title: "x" }) %>');
    write(
      cwd,
      "app/views/posts/edit.html.tse",
      '<%= render({ partial: "posts/form", locals: { post: "y" } }) %>',
    );
    write(
      cwd,
      "app/views/posts/index.html.tse",
      '<% const formLocals = { post: true }; %><%= render({ partial: "form", locals: formLocals }) %>',
    );
    write(cwd, "app/views/posts/other.html.tse", '<%= render("form") %>');
    write(cwd, "app/views/posts/_form.html.tse", "<%= post %><%= title %>");
    write(cwd, "app/views/posts/_strict.html.tse", "<%# locals: (post:) %><%= post %>");
    write(cwd, "app/views/posts/show.html.tse", '<%= render("strict", { post: 1 }) %>');
    await buildViews({ cwd });
    const form = fs.readFileSync(path.join(cwd, ".trails/views/posts/_form.html.tse.ts"), "utf8");
    expect(form).toContain(
      "type ObjectLocals = { post: string | boolean | number | undefined; title: string | undefined };",
    );
    const strict = fs.readFileSync(
      path.join(cwd, ".trails/views/posts/_strict.html.tse.ts"),
      "utf8",
    );
    expect(strict).toContain("type ObjectLocals = {};");
  }, 30_000);

  it("resolves a controller render with no template name to the action's template", async () => {
    const cwd = mkScratch();
    write(
      cwd,
      "app/controllers/posts-controller.ts",
      [
        "export class PostsController {",
        "  render(..._args: unknown[]): void {}",
        "  showAll(): void { [1].forEach(() => this.render({ locals: { foo: 1 } })); }",
        "  private renderEdit(): void { this.render({ locals: { foo: 1 } }); }",
        "}",
      ].join("\n"),
    );
    write(
      cwd,
      "node_modules/@blazetrails/actionview/package.json",
      '{ "name": "@blazetrails/actionview", "types": "index.d.ts" }',
    );
    write(
      cwd,
      "node_modules/@blazetrails/actionview/index.d.ts",
      [
        "export interface TemplateRegistry {}",
        "export type TemplateLocals<T> = T;",
        "export declare class Base { csrfMetaTags(): string; }",
      ].join("\n"),
    );
    write(
      cwd,
      "app/views/posts/show-all.html.tse",
      "<%= foo %><%= csrfMetaTags() %><%= noSuchHelper() %>",
    );
    write(cwd, "app/views/layouts/application.html.tse", "<%= noSuchHelper() %>");
    await buildViews({ cwd });
    const shim = (rel: string): string =>
      fs.readFileSync(path.join(cwd, ".trails/views", `${rel}.html.tse.ts`), "utf8");
    expect(shim("posts/show-all")).toContain("type ObjectLocals = { foo: number };");
    expect(shim("posts/show-all")).toContain("      : any;");
    write(
      cwd,
      "app/controllers/posts-controller.ts",
      [
        "export class PostsController {",
        "  render(..._args: unknown[]): void {}",
        "  showAll(): void { [1].forEach(() => this.render({ locals: { foo: 1 } })); }",
        "}",
      ].join("\n"),
    );
    await buildViews({ cwd });
    expect(shim("posts/show-all")).toContain("      : never;");
    expect(viewDiagnostics(cwd).map((d) => d.split(":")[0])).toEqual([
      "layouts/application.html.tse.ts",
      "posts/show-all.html.tse.ts",
    ]);
  }, 30_000);

  it("types a template's locals from view and controller renders that pass a hash", async () => {
    const cwd = mkScratch();
    write(
      cwd,
      "app/controllers/posts-controller.ts",
      [
        "export class PostsController {",
        "  render(..._args: unknown[]): void {}",
        '  show(): void { this.render("show", { locals: { foo: 1 } }); }',
        '  edit(): void { this.render({ action: "show", locals: { foo: "x", bar: true } }); }',
        "}",
      ].join("\n"),
    );
    write(cwd, "app/views/posts/show.html.tse", "<%= foo %><%= bar %><%= baz %>");
    write(
      cwd,
      "app/views/posts/index.html.tse",
      '<%= render({ template: "posts/show", locals: { foo: 2 } }) %>',
    );
    await buildViews({ cwd });
    const show = fs.readFileSync(path.join(cwd, ".trails/views/posts/show.html.tse.ts"), "utf8");
    expect(show).toContain(
      "type ObjectLocals = { foo: number | string; bar: boolean | undefined };",
    );
    expect(show).toContain("      : never;");
  }, 30_000);

  it("types the kebab-case template a camelCase action renders, named implicitly or by action:", async () => {
    const cwd = mkScratch();
    write(
      cwd,
      "app/controllers/posts-controller.ts",
      [
        "export class PostsController {",
        "  render(..._args: unknown[]): void {}",
        "  recentPosts(): void { this.render({ locals: { foo: 1 } }); }",
        '  edit(): void { this.render({ action: "recentPosts", locals: { bar: true } }); }',
        "}",
      ].join("\n"),
    );
    write(cwd, "app/views/posts/recent-posts.html.tse", "<%= foo %><%= bar %>");
    await buildViews({ cwd });
    const view = fs.readFileSync(
      path.join(cwd, ".trails/views/posts/recent-posts.html.tse.ts"),
      "utf8",
    );
    expect(view).toContain("foo: number | undefined");
    expect(view).toContain("bar: boolean | undefined");
  }, 30_000);

  it("declares the object, counter and iteration locals of collection:, object: and as: renders", async () => {
    const cwd = mkScratch();
    write(
      cwd,
      "app/views/posts/index.html.tse",
      [
        '<%= render({ partial: "row", collection: ["a"], locals: { wide: true } }) %>',
        '<%= render({ partial: "cell", object: 1, as: "value" }) %>',
      ].join(""),
    );
    write(cwd, "app/views/posts/_row.html.tse", "<%= row %><%= row_counter %><%= psot %>");
    write(cwd, "app/views/posts/_cell.html.tse", "<%= value %>");
    await buildViews({ cwd });
    const shim = (rel: string): string =>
      fs.readFileSync(path.join(cwd, ".trails/views/posts", `${rel}.html.tse.ts`), "utf8");
    expect(shim("_row")).toContain(
      'type ObjectLocals = { row: string; row_counter: number; row_iteration: import("@blazetrails/actionview").PartialIteration; wide: boolean };',
    );
    expect(shim("_row")).toContain("      : never;");
    expect(shim("_cell")).toContain("type ObjectLocals = { value: number };");
  }, 30_000);

  it("types the locals an object render and a helper module pass", async () => {
    const cwd = mkScratch();
    write(
      cwd,
      "node_modules/@blazetrails/actionview/package.json",
      '{ "name": "@blazetrails/actionview", "types": "index.d.ts" }',
    );
    write(
      cwd,
      "node_modules/@blazetrails/actionview/index.d.ts",
      "export declare class Base { render(...args: unknown[]): string; }",
    );
    write(cwd, "app/models/post.ts", 'export class Post { title = ""; }');
    write(
      cwd,
      "app/controllers/posts-controller.ts",
      [
        'import type { Post } from "../models/post.js";',
        "export class PostsController { declare post: Post; }",
      ].join("\n"),
    );
    write(
      cwd,
      "app/helpers/posts-helper.ts",
      [
        "export const PostsHelper = {",
        "  badge(this: { render(...args: unknown[]): string }): string {",
        '    return this.render("badge", { label: "new" });',
        "  },",
        "};",
      ].join("\n"),
    );
    write(
      cwd,
      "app/views/posts/show.html.tse",
      "<%= render(this.post, { compact: true }) %><%= render(this.post) %>",
    );
    write(cwd, "app/views/posts/_post.html.tse", "<%= post.title %><%= compact %>");
    write(cwd, "app/views/posts/_badge.html.tse", "<%= label %>");
    write(cwd, "app/views/comments/_badge.html.tse", "<%= label %>");
    await buildViews({ cwd });
    const shim = (rel: string): string =>
      fs.readFileSync(path.join(cwd, ".trails/views/posts", `${rel}.html.tse.ts`), "utf8");
    expect(shim("_post")).toContain("compact: boolean | undefined }");
    expect(shim("_post")).toContain("      : never;");
    expect(shim("_badge")).toContain("type ObjectLocals = { label: string };");
    const comments = fs.readFileSync(
      path.join(cwd, ".trails/views/comments/_badge.html.tse.ts"),
      "utf8",
    );
    expect(comments).toContain("type ObjectLocals = { label: string };");
  }, 30_000);

  it("types a local a partial forwards to another partial", async () => {
    const cwd = mkScratch();
    write(cwd, "app/views/posts/show.html.tse", '<%= render("card", { post: 1 }) %>');
    write(cwd, "app/views/posts/_card.html.tse", '<%= render("line", { post }) %>');
    write(cwd, "app/views/posts/_line.html.tse", "<%= post %>");
    await buildViews({ cwd });
    const line = fs.readFileSync(path.join(cwd, ".trails/views/posts/_line.html.tse.ts"), "utf8");
    expect(line).toContain("type ObjectLocals = { post: number };");
  }, 30_000);

  it("types a shared layout from every controller that falls back to it", async () => {
    const cwd = mkScratch();
    write(
      cwd,
      "app/controllers/application-controller.ts",
      "export class ApplicationController {}",
    );
    for (const [file, name, field] of [
      ["comments", "CommentsController", "declare items: string[];"],
      ["posts", "PostsController", "private declare items: number[];"],
      ["admin/posts", "AdminPostsController", "declare items: boolean[];"],
      ["story-pages", "StoryPagesController", "declare items: Date[];"],
    ]) {
      write(
        cwd,
        `app/controllers/${file}-controller.ts`,
        [
          `import { ApplicationController } from "${file.includes("/") ? "../" : "./"}application-controller.js";`,
          `export class ${name} extends ApplicationController { ${field} }`,
        ].join("\n"),
      );
    }
    write(cwd, "app/views/layouts/application.html.tse", "<%= this.items %>");
    write(cwd, "app/views/layouts/posts.html.tse", "<%= this.items %>");
    write(cwd, "app/views/layouts/admin/posts.html.tse", "<%= this.items %>");
    write(cwd, "app/views/layouts/story-pages.html.tse", "<%= this.items %>");
    await buildViews({ cwd });
    const read = (rel: string): string =>
      fs.readFileSync(path.join(cwd, ".trails/views", `${rel}.ts`), "utf8");
    expect(read("layouts/application.html.tse")).toContain('{ "items": string[] | undefined }');
    expect(read("layouts/posts.html.tse")).toContain('{ "items": number[] }');
    expect(read("layouts/admin/posts.html.tse")).toContain('{ "items": boolean[] }');
    expect(read("layouts/story-pages.html.tse")).toContain('{ "items": Date[] }');
    expect(fs.existsSync(path.join(cwd, "app/controllers/posts-controller.d.ts"))).toBe(false);
  }, 30_000);

  it("types a layout from explicit layout() and render layout: choices before the implied name", async () => {
    const cwd = mkScratch();
    write(
      cwd,
      "app/controllers/application-controller.ts",
      [
        "export class ApplicationController {",
        "  static layout(_layout: unknown, _conditions?: object): void {}",
        "  render(..._args: unknown[]): void {}",
        "}",
      ].join("\n"),
    );
    for (const [file, name, body] of [
      [
        "posts",
        "PostsController",
        'declare posts: string[]; static { this.layout("application"); }',
      ],
      [
        "comments",
        "CommentsController",
        'declare comments: number[]; show(): void { this.render("show", { layout: "admin" }); }',
      ],
      ["plain", "PlainController", "declare plain: boolean; static { this.layout(false); }"],
      [
        "drafts",
        "DraftsController",
        'declare drafts: bigint; static { this.layout("admin", { only: "index" }); }',
      ],
      ["picked", "PickedController", 'declare picked: symbol; static { this.layout(":pick"); }'],
    ]) {
      write(
        cwd,
        `app/controllers/${file}-controller.ts`,
        [
          'import { ApplicationController } from "./application-controller.js";',
          `export class ${name} extends ApplicationController { ${body} }`,
        ].join("\n"),
      );
    }
    for (const layout of ["application", "posts", "comments", "plain", "drafts", "admin"]) {
      write(cwd, `app/views/layouts/${layout}.html.tse`, "hi");
    }
    await buildViews({ cwd });
    const fields = (layout: string): string[] =>
      [
        ...fs
          .readFileSync(path.join(cwd, `.trails/views/layouts/${layout}.html.tse.ts`), "utf8")
          .matchAll(/"(posts|comments|plain|drafts|picked)":/gu),
      ].map((m) => m[1]);
    expect(fields("application")).toEqual(["picked", "posts"]);
    expect(fields("posts")).toEqual(["picked"]);
    expect(fields("comments")).toEqual(["comments", "picked"]);
    expect(fields("admin")).toEqual(["comments", "drafts", "picked"]);
    expect(fields("drafts")).toEqual(["drafts", "picked"]);
    expect(fields("plain")).toEqual(["picked"]);
  }, 30_000);

  it("reads a per-render layout from non-literal render options and layout.call(this, ...)", async () => {
    const cwd = mkScratch();
    write(
      cwd,
      "app/controllers/application-controller.ts",
      [
        "export function layout(this: unknown, _layout: unknown): void {}",
        "export class ApplicationController { render(..._args: unknown[]): void {} }",
      ].join("\n"),
    );
    for (const [file, body] of Object.entries({
      comments:
        'declare comments: number[]; show(): void { const options = { layout: "admin" } as const; this.render("show", options); }',
      drafts:
        'declare drafts: bigint; show(options: { layout: "admin" | false }): void { this.render({ layout: "posts", ...options, action: "show" }); }',
      either:
        'declare either: null; show(options: { layout: "admin" } | { foo: number }): void { this.render("show", options); }',
      wide: 'declare wide: symbol; show(options: Record<string, unknown>): void { this.render("show", options); }',
      posts: 'declare posts: string[]; static { layout.call(this, "application"); }',
    })) {
      const name = `${file[0].toUpperCase()}${file.slice(1)}Controller`;
      write(
        cwd,
        `app/controllers/${file}-controller.ts`,
        [
          'import { ApplicationController, layout } from "./application-controller.js";',
          `export class ${name} extends ApplicationController { ${body} }`,
        ].join("\n"),
      );
    }
    for (const name of ["application", "admin", "posts"]) {
      write(cwd, `app/views/layouts/${name}.html.tse`, "hi");
    }
    await buildViews({ cwd });
    const fields = (name: string): string[] =>
      [
        ...fs
          .readFileSync(path.join(cwd, `.trails/views/layouts/${name}.html.tse.ts`), "utf8")
          .matchAll(/"(posts|comments|drafts|either|wide)":/gu),
      ].map((m) => m[1]);
    expect(fields("admin")).toEqual(["comments", "drafts", "either", "wide"]);
    expect(fields("application")).toEqual(["comments", "drafts", "either", "posts", "wide"]);
    expect(fields("posts")).toEqual(["wide"]);
  }, 30_000);

  it("types addFlashTypes readers in a controller's views and layout", async () => {
    const cwd = mkScratch();
    write(
      cwd,
      "app/controllers/posts-controller.ts",
      [
        "export class PostsController {",
        '  static { this.addFlashTypes("warning", "info"); }',
        "  static addFlashTypes(..._types: string[]): void {}",
        "}",
      ].join("\n"),
    );
    write(cwd, "app/views/posts/index.html.tse", "<%= this.warning %>");
    write(cwd, "app/views/layouts/posts.html.tse", "<%= this.info %><%= yield %>");
    await buildViews({ cwd });
    const read = (rel: string): string =>
      fs.readFileSync(path.join(cwd, ".trails/views", `${rel}.ts`), "utf8");
    expect(read("posts/index.html.tse")).toContain('{ "warning": unknown; "info": unknown }');
    expect(read("layouts/posts.html.tse")).toContain('{ "warning": unknown; "info": unknown }');
  }, 30_000);

  it("types a partial's locals from each hash of a conditional render", async () => {
    const cwd = mkScratch();
    write(
      cwd,
      "app/views/posts/show.html.tse",
      '<%= render({ partial: "choice", locals: Math.random() > 0.5 ? { post: 1 } : { title: "t" } }) %>',
    );
    write(cwd, "app/views/posts/_choice.html.tse", "<%= post %><%= title %>");
    await buildViews({ cwd });
    const choice = fs.readFileSync(
      path.join(cwd, ".trails/views/posts/_choice.html.tse.ts"),
      "utf8",
    );
    expect(choice).toMatch(
      /type ObjectLocals = \{ post: [^;]*number[^;]*undefined[^;]*; title: [^}]*string[^}]*undefined/,
    );
  }, 30_000);
});
