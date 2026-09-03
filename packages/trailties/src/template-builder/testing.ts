import ts from "typescript";

export { assertNoRubySource } from "./no-ruby-source.js";

export function parseTs(source: string): { diagnostics: readonly ts.Diagnostic[] } {
  const result = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.ESNext,
      isolatedModules: true,
      noEmit: true,
    },
  });
  return { diagnostics: result.diagnostics ?? [] };
}
