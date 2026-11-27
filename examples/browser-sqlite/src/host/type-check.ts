import ts from "typescript-5";

export type TypeProblem = {
  path: string;
  line: number;
  column: number;
  message: string;
  severity: "warning";
};

const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  allowImportingTsExtensions: true,
  noEmit: true,
  skipLibCheck: true,
  types: [],
  lib: ["lib.es2023.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
};

const IMPORT_META = "/lib/import-meta.d.ts";
const IMPORT_META_TEXT =
  "interface ImportMeta { readonly dirname: string; readonly filename: string }";

let service: ts.LanguageService | null = null;
let declarations: Record<string, string> = {};
let app: Record<string, string> = {};
const versions = new Map<string, number>();

function read(path: string): string | undefined {
  return path === IMPORT_META ? IMPORT_META_TEXT : (app[path] ?? declarations[path]);
}

function languageService(): ts.LanguageService {
  service ??= ts.createLanguageService(
    {
      getCompilationSettings: () => OPTIONS,
      getScriptFileNames: () => [...Object.keys(app), IMPORT_META],
      getScriptVersion: (path) => String(versions.get(path) ?? 0),
      getScriptSnapshot: (path) => {
        const text = read(path);
        return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => "/",
      getDefaultLibFileName: () => "/lib/lib.d.ts",
      fileExists: (path) => read(path) !== undefined,
      readFile: read,
      directoryExists: (dir) => {
        const prefix = dir.endsWith("/") ? dir : `${dir}/`;
        return [app, declarations].some((files) =>
          Object.keys(files).some((p) => p.startsWith(prefix)),
        );
      },
    },
    ts.createDocumentRegistry(),
  );
  return service;
}

/**
 * The type errors in an app's `.ts` files, as warnings: the playground runs
 * an app that does not type-check, as `tsx` would, and shows them alongside.
 * Syntax errors are left to the runtime, which stops the boot on them.
 */
export function typeProblems(
  declarationFiles: Record<string, string>,
  files: Record<string, string>,
): TypeProblem[] {
  declarations = declarationFiles;
  const next = Object.fromEntries(Object.entries(files).filter(([path]) => path.endsWith(".ts")));
  for (const [path, text] of Object.entries(next)) {
    if (app[path] !== text) versions.set(path, (versions.get(path) ?? 0) + 1);
  }
  app = next;
  const ls = languageService();
  return Object.keys(app).flatMap((path) =>
    ls.getSyntacticDiagnostics(path).length
      ? []
      : ls.getSemanticDiagnostics(path).map((d) => {
          const at = d.file?.getLineAndCharacterOfPosition(d.start ?? 0);
          return {
            path,
            line: (at?.line ?? 0) + 1,
            column: (at?.character ?? 0) + 1,
            message: ts.flattenDiagnosticMessageText(d.messageText, " "),
            severity: "warning" as const,
          };
        }),
  );
}
