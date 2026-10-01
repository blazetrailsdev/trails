import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import ts from "typescript-5";
import { buildViews } from "./build-views.js";
import { init } from "./lsp-plugin.js";

function makeHost(files: Record<string, string>): ts.LanguageServiceHost {
  return {
    getScriptFileNames: () => Object.keys(files),
    getScriptVersion: () => "1",
    getScriptSnapshot: (f) =>
      files[f] !== undefined ? ts.ScriptSnapshot.fromString(files[f]) : undefined,
    getCurrentDirectory: () => "/",
    getCompilationSettings: () => ({}),
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: (f) => files[f] !== undefined,
    readFile: (f) => files[f],
    getScriptKind: () => ts.ScriptKind.TS,
  };
}

const baseInfo = (host: ts.LanguageServiceHost) => ({
  languageService: {} as ts.LanguageService,
  languageServiceHost: host,
  project: { getCurrentDirectory: () => "/" },
  config: {},
});

describe("lspPluginInit", () => {
  it("virtualizes .tse via readFile/getScriptSnapshot and reports TS kind", () => {
    const host = makeHost({ "/views/home.html.tse": "<%= name %>", "/x.ts": "export const x=1;" });
    init({ typescript: ts }).create(baseInfo(host));

    const read = host.readFile("/views/home.html.tse")!;
    expect(read).toContain("_ob.append(name)");
    const snap = host.getScriptSnapshot("/views/home.html.tse")!;
    expect(snap.getText(0, snap.getLength())).toContain("_ob.append(name)");
    expect(host.getScriptKind!("/views/home.html.tse")).toBe(ts.ScriptKind.TS);
    expect(host.readFile("/x.ts")).toBe("export const x=1;");
  });

  it("emits error shim on invalid .tse and getExternalFiles walks app/views", () => {
    const host = makeHost({ "/views/bad.html.tse": "<%# locals: (1bad:) %>" });
    const plugin = init({ typescript: ts });
    plugin.create(baseInfo(host));
    expect(host.readFile("/views/bad.html.tse")).toContain("__tseFailure");

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "trails-tsc-lsp-"));
    fs.mkdirSync(path.join(root, "app/views/users"), { recursive: true });
    fs.writeFileSync(path.join(root, "app/views/home.html.tse"), "hi");
    fs.writeFileSync(path.join(root, "app/views/users/show.html.tse"), "ok");
    fs.writeFileSync(path.join(root, "app/views/skip.txt"), "no");
    expect(plugin.getExternalFiles({ getCurrentDirectory: () => root }).sort()).toEqual([
      path.join(root, "app/views/home.html.tse"),
      path.join(root, "app/views/users/show.html.tse"),
    ]);
  });

  it("infers script kind by extension when host lacks getScriptKind, and honors config.viewsDir", () => {
    const host = { ...makeHost({}), getScriptKind: undefined } as ts.LanguageServiceHost;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "trails-tsc-lsp-cfg-"));
    fs.mkdirSync(path.join(root, "src/templates"), { recursive: true });
    fs.writeFileSync(path.join(root, "src/templates/x.html.tse"), "x");
    const plugin = init({ typescript: ts });
    plugin.create({
      languageService: {} as ts.LanguageService,
      languageServiceHost: host,
      project: { getCurrentDirectory: () => root },
      config: { viewsDir: "src/templates" },
    });
    expect(host.getScriptKind!("/a.ts")).toBe(ts.ScriptKind.TS);
    expect(host.getScriptKind!("/a.json")).toBe(ts.ScriptKind.JSON);
    expect(host.getScriptKind!("/a.tse")).toBe(ts.ScriptKind.TS);
    expect(plugin.getExternalFiles({ getCurrentDirectory: () => root })).toEqual([
      path.join(root, "src/templates/x.html.tse"),
    ]);
  });

  it("virtualizes a view with the scope pnpm build gave its shim", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "trails-tsc-lsp-scope-"));
    const write = (rel: string, body: string): void => {
      fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
      fs.writeFileSync(path.join(cwd, rel), body);
    };
    write(
      "node_modules/@blazetrails/actionview/package.json",
      '{ "name": "@blazetrails/actionview", "types": "index.d.ts" }',
    );
    write(
      "node_modules/@blazetrails/actionview/index.d.ts",
      "export interface TemplateRegistry {}\nexport type TemplateLocals<T> = T;\nexport declare class Base {}",
    );
    write("app/models/post.ts", "export class Post { title = 0; }");
    write(
      "app/helpers/posts-helper.ts",
      "export const PostsHelper = { readingTime(text: string): number { return text.length; } };",
    );
    const view = path.join(cwd, "app/views/posts/_post.html.tse");
    write("app/views/posts/_post.html.tse", "<div>\n  <%= readingTime(post.title) %>\n</div>");
    const options: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      allowNonTsExtensions: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    };
    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => [view],
      getScriptVersion: () => "1",
      getScriptSnapshot: (f) =>
        fs.existsSync(f) ? ts.ScriptSnapshot.fromString(fs.readFileSync(f, "utf8")) : undefined,
      getCurrentDirectory: () => cwd,
      getCompilationSettings: () => options,
      getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
      fileExists: (f) => fs.existsSync(f),
      readFile: (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : undefined),
    };
    const position = (d: ts.Diagnostic) => [
      d.code,
      d.file!.getLineAndCharacterOfPosition(d.start!),
    ];
    init({ typescript: ts }).create({ ...baseInfo(host), project: host });
    const service = ts.createLanguageService(host);
    expect(service.getSemanticDiagnostics(view).map((d) => d.code)).toEqual([2304, 2304]);

    buildViews({ cwd });
    const shim = path.join(cwd, ".trails/views/posts/_post.html.tse.ts");
    const built = ts.createProgram([shim], options);
    const expected = built.getSemanticDiagnostics(built.getSourceFile(shim)).map(position);
    expect(expected.map(([code]) => code)).toEqual([2345]);
    host.getScriptVersion = () => "2";
    expect(service.getSemanticDiagnostics(view).map(position)).toEqual(expected);
    const text = host.readFile(view)!;
    const completions = service.getCompletionsAtPosition(view, text.indexOf("post.title"), {});
    expect(completions!.entries.map((e) => e.name)).toContain("readingTime");
  }, 30_000);
});
