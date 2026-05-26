import ts from "typescript";

const DEFAULT_STUB = [
  "export interface TemplateRegistry {}",
  "export type TemplateLocals<T> = T;",
  "export type NoExtraKeys<T> = T & { [K in Exclude<string, keyof T>]?: never };",
].join("\n");

export interface DiagnoseOptions {
  customStub?: string;
  extraCompilerOptions?: ts.CompilerOptions;
}

export function diagnose(source: string, options: DiagnoseOptions = {}): string[] {
  const fileName = "/virtual/show.html.tse.ts";
  const stubSrc = options.customStub ?? DEFAULT_STUB;
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
      ...options.extraCompilerOptions,
      noEmit: true,
      types: [],
      skipLibCheck: true,
      strict: true,
    },
    host,
  });
  return program
    .getSemanticDiagnostics(sourceFile)
    .concat(program.getSyntacticDiagnostics(sourceFile))
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}
