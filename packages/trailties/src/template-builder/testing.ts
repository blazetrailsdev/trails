import ts from "typescript";

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

const RUBY_RE = /^\s*(class|module|def)\s+\w+($|\s+<)/m;

export function assertNoRubySource(text: string): void {
  const m = text.match(RUBY_RE);
  if (m) {
    throw new Error(`Ruby-like source detected: ${JSON.stringify(m[0])}`);
  }
}
