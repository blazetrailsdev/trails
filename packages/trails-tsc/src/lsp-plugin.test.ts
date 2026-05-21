import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import ts from "typescript";
import { init } from "./lsp-plugin.js";

function makeHost(files: Record<string, string>): ts.LanguageServiceHost {
  return {
    getScriptFileNames: () => Object.keys(files),
    getScriptVersion: () => "1",
    getScriptSnapshot: (f) =>
      files[f] !== undefined ? ts.ScriptSnapshot.fromString(files[f]!) : undefined,
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

    const read = host.readFile!("/views/home.html.tse")!;
    expect(read).toContain("_ob.append(name)");
    const snap = host.getScriptSnapshot("/views/home.html.tse")!;
    expect(snap.getText(0, snap.getLength())).toContain("_ob.append(name)");
    expect(host.getScriptKind!("/views/home.html.tse")).toBe(ts.ScriptKind.TS);
    expect(host.readFile!("/x.ts")).toBe("export const x=1;");
  });

  it("emits error shim on invalid .tse and getExternalFiles walks app/views", () => {
    const host = makeHost({ "/views/bad.html.tse": "<%# locals: (1bad:) %>" });
    const plugin = init({ typescript: ts });
    plugin.create(baseInfo(host));
    expect(host.readFile!("/views/bad.html.tse")).toContain("__tseFailure");

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
});
