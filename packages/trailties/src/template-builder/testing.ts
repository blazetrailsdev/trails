import { API, ModuleKind, type Diagnostic } from "typescript/unstable/sync";
import { ScriptTarget } from "typescript/unstable/ast";

export { assertNoRubySource } from "./no-ruby-source.js";

let api: API | undefined;

export function parseTs(source: string): { diagnostics: readonly Diagnostic[] } {
  api ??= new API();
  const result = api.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: {
      target: ScriptTarget.Latest,
      module: ModuleKind.ESNext,
      isolatedModules: true,
      noEmit: true,
    },
  });
  return { diagnostics: result.diagnostics ?? [] };
}
