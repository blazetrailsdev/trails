import { describe, expect, it } from "vitest";
import ts from "typescript";
import { virtualizeTse } from "./tse.js";
import { diagnose } from "./tse-diagnose.js";

const STRICT_OPTIONS: ts.CompilerOptions = {
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  verbatimModuleSyntax: true,
  module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
};

const FIXTURES: Record<string, string> = {
  "no locals": "<h1>Hello</h1>",
  "strict locals empty": "<%# locals: () %><p>no extras</p>",
  "strict locals with defaults":
    "<%# locals: (user:, count: 0) %><h1><%= user %></h1><p><%= count %></p>",
  "partial render": "<%= context.render({ partial: 'users/show', locals: { user: 'test' } }) %>",
  capture: "<%= context.capture(() => { %><li>inside</li><% }) %>",
  contentFor: "<% context.contentFor('nav', () => { %><nav>hi</nav><% }); %>",
  raw: "<%= context.raw('<b>bold</b>') %>",
  yield: "<%= context.yield() %><%= context.yield('sidebar') %>",
  "code block with for loop":
    "<% const items = [1, 2, 3]; %><% for (const item of items) { %><li><%= item %></li><% } %>",
  "types annotation":
    "<%# locals: (user:) %><%! types: { user: { name: string } } !%><h1><%= user.name %></h1>",
  "raw expression": "<%== '<b>unescaped</b>' %>",
  "nested blockExpr":
    "<% const outer = (fn: () => void) => fn(); const inner = (fn: () => void) => fn(); %>" +
    "<%= outer(() => { %><%= inner(() => { %><p>nested</p><% }) %><% }) %>",
  "collection render (block body)":
    "<%= context.render({ partial: 'items/item' }) %><% const x = 1; %>",
};

function assertClean(name: string, source: string) {
  it(name, () => {
    const out = virtualizeTse(source);
    const diags = diagnose(out, { extraCompilerOptions: STRICT_OPTIONS });
    expect(
      diags,
      `Emitted .tse.ts for "${name}" has diagnostics:\n${diags.join("\n")}\n\nEmitted:\n${out}`,
    ).toEqual([]);
  });
}

describe("emitter hygiene — strict flags", () => {
  for (const [name, source] of Object.entries(FIXTURES)) {
    assertClean(name, source);
  }
});

function findNonErasableNodes(source: string): string[] {
  const sf = ts.createSourceFile("/virtual/check.ts", source, ts.ScriptTarget.ES2022, true);
  const violations: string[] = [];
  function walk(node: ts.Node) {
    if (ts.isEnumDeclaration(node)) violations.push(`enum ${node.name.text}`);
    if (ts.isImportEqualsDeclaration(node)) violations.push(`import = (${node.name.text})`);
    if (ts.isModuleDeclaration(node)) violations.push(`namespace ${node.name.text}`);
    ts.forEachChild(node, walk);
  }
  ts.forEachChild(sf, walk);
  return violations;
}

describe("emitter hygiene — erasable syntax only", () => {
  it("emitted output contains no enum, import =, or namespace AST nodes", () => {
    for (const [name, source] of Object.entries(FIXTURES)) {
      const out = virtualizeTse(source);
      const violations = findNonErasableNodes(out);
      expect(violations, `"${name}" emitted non-erasable syntax: ${violations.join(", ")}`).toEqual(
        [],
      );
    }
  });
});
