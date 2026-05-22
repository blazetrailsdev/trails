import ts from "typescript";

export { assertNoRubySource } from "./no-ruby-source.js";

export function parseTs(source: string): { diagnostics: readonly ts.Diagnostic[] } {
  // `transpileModule` with `reportDiagnostics: true` exposes syntactic
  // diagnostics through the public API — unlike the internal
  // `SourceFile.parseDiagnostics` field, this contract is stable.
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
