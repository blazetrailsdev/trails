import path from "node:path";
import ts from "typescript-6";
import { REPO_ROOT } from "./side-effects.js";

export const OPTIONAL_ADAPTER_PEERS = [
  "@blazetrails/pg",
  "@blazetrails/mysql2",
  "@blazetrails/sqlite3",
] as const;

/**
 * Typechecks `import { Base } from "@blazetrails/activerecord"` against the
 * built `dist/` with `skipLibCheck: false`, in a program where the optional
 * adapter peers do not resolve, as in a consumer that installs none of them.
 */
export function consumerDiagnostics(source: string, missing: readonly string[]): string[] {
  const dir = path.join(REPO_ROOT, "packages", "activerecord");
  const file = path.join(dir, "__optional-peers-consumer__.ts");
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    lib: ["lib.esnext.d.ts", "lib.esnext.temporal.d.ts"],
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, lang, ...rest) =>
    name === file ? ts.createSourceFile(name, source, lang) : getSourceFile(name, lang, ...rest);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => name === file || fileExists(name);
  host.resolveModuleNameLiterals = (literals, containing, redirected, opts, sf) =>
    literals.map((lit) => {
      const name = lit.text;
      if (missing.some((m) => name === m || name.startsWith(`${m}/`))) {
        return { resolvedModule: undefined };
      }
      const mode = ts.getModeForUsageLocation(sf, lit, opts);
      return ts.resolveModuleName(name, containing, opts, host, undefined, redirected, mode);
    });
  const program = ts.createProgram([file], options, host);
  return ts.getPreEmitDiagnostics(program).map((d) => {
    const where = d.file ? path.relative(REPO_ROOT, d.file.fileName) : "";
    return `${where} TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`;
  });
}
