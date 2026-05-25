import { describe, expect, it } from "vitest";
import ts from "typescript";
import { virtualizeTse } from "./tse.js";

/**
 * Compile emitted `.tse.ts` under the strictest flags to catch hygiene
 * regressions: `strict`, `noUncheckedIndexedAccess`,
 * `exactOptionalPropertyTypes`, and `verbatimModuleSyntax`.
 */
function diagnoseStrict(source: string): string[] {
  const fileName = "/virtual/show.html.tse.ts";
  const stubSrc = [
    "export interface TemplateRegistry {}",
    "export type TemplateLocals<T> = T;",
    "export type NoExtraKeys<T> = T & { [K in Exclude<string, keyof T>]?: never };",
  ].join("\n");
  const stubPath = "/stub/module.d.ts";
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true);
  const stubFile = ts.createSourceFile(stubPath, stubSrc, ts.ScriptTarget.ES2022, true);
  const defaultHost = ts.createCompilerHost({});
  const host: ts.CompilerHost = {
    ...defaultHost,
    fileExists: (f) => f === fileName || f === stubPath || defaultHost.fileExists(f),
    readFile: (f) => (f === fileName ? source : f === stubPath ? stubSrc : defaultHost.readFile(f)),
    getSourceFile: (f, lv, onError) => {
      if (f === fileName) return sourceFile;
      if (f === stubPath) return stubFile;
      return defaultHost.getSourceFile(f, lv, onError);
    },
    resolveModuleNames: (moduleNames, containingFile, _, __, opts) => {
      const real = defaultHost.resolveModuleNames;
      const results = real
        ? real.call(defaultHost, moduleNames, containingFile, _, __, opts)
        : moduleNames.map(() => undefined);
      return results.map((r, i) => {
        if (r) return r;
        void moduleNames[i];
        return { resolvedFileName: stubPath, isExternalLibraryImport: true };
      });
    },
  };
  const program = ts.createProgram({
    rootNames: [fileName],
    options: {
      noEmit: true,
      types: [],
      skipLibCheck: true,
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      verbatimModuleSyntax: true,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
    },
    host,
  });
  return program
    .getSemanticDiagnostics(sourceFile)
    .concat(program.getSyntacticDiagnostics(sourceFile))
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

function assertClean(name: string, source: string) {
  it(name, () => {
    const ts = virtualizeTse(source);
    const diags = diagnoseStrict(ts);
    expect(
      diags,
      `Emitted .tse.ts for "${name}" has diagnostics:\n${diags.join("\n")}\n\nEmitted:\n${ts}`,
    ).toEqual([]);
  });
}

describe("emitter hygiene — strict flags", () => {
  assertClean("no locals", "<h1>Hello</h1>");

  assertClean("strict locals empty", "<%# locals: () %><p>no extras</p>");

  assertClean(
    "strict locals with defaults",
    "<%# locals: (user:, count: 0) %><h1><%= user %></h1><p><%= count %></p>",
  );

  assertClean(
    "partial render",
    "<%= context.render({ partial: 'users/show', locals: { user: 'test' } }) %>",
  );

  assertClean("capture", "<%= context.capture(() => { %><li>inside</li><% }) %>");

  assertClean("contentFor", "<% context.contentFor('nav', () => { %><nav>hi</nav><% }); %>");

  assertClean("raw", "<%= context.raw('<b>bold</b>') %>");

  assertClean("yield", "<%= context.yield() %><%= context.yield('sidebar') %>");

  assertClean(
    "code block with for loop",
    "<% const items = [1, 2, 3]; %><% for (const item of items) { %><li><%= item %></li><% } %>",
  );

  assertClean(
    "types annotation",
    "<%# locals: (user:) %><%! types: { user: { name: string } } !%><h1><%= user.name %></h1>",
  );
});

describe("emitter hygiene — erasable syntax only", () => {
  it("emitted output contains no enum, import =, or namespace declarations", () => {
    const templates = [
      "<h1>Hello</h1>",
      "<%# locals: (user:, count: 0) %><%= user %>",
      "<%# locals: () %><p>empty</p>",
      "<%= context.capture(() => { %><li>hi</li><% }) %>",
    ];
    for (const source of templates) {
      const out = virtualizeTse(source);
      expect(out).not.toMatch(/\benum\s+/);
      expect(out).not.toMatch(/\bimport\s*=/);
      expect(out).not.toMatch(/\bnamespace\s+/);
    }
  });
});
