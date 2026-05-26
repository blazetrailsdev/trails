import { describe, expect, it } from "vitest";
import ts from "typescript";

const TYPE_STUB = `
export interface TemplateRegistry {}
export type TemplateLocals<T> = [T] extends [never] ? Record<string, unknown> : T;

type RenderSingleOptions<P extends string> = {
  partial: P;
  collection?: undefined;
  as?: string;
  spacerTemplate?: undefined;
} & (P extends keyof TemplateRegistry
  ? {} extends TemplateLocals<TemplateRegistry[P]>
    ? { locals?: TemplateLocals<TemplateRegistry[P]> }
    : { locals: TemplateLocals<TemplateRegistry[P]> }
  : { locals?: Record<string, unknown> });

type RenderCollectionOptions<P extends string> = {
  partial: P;
  collection: readonly unknown[];
  as?: string;
  spacerTemplate?: string;
} & (P extends keyof TemplateRegistry
  ? { locals?: Partial<TemplateLocals<TemplateRegistry[P]>> }
  : { locals?: Record<string, unknown> });

export type RenderOptions<P extends string> = RenderSingleOptions<P> | RenderCollectionOptions<P>;

export declare function render<P extends string>(options: RenderOptions<P>): string;

declare module "/stub/module" {
  interface TemplateRegistry {
    "users/user": { user: string; role?: string };
    "static/header": { title?: string };
  }
}
`;

function getDiagnostics(source: string): ts.Diagnostic[] {
  const fileName = "/virtual/test.ts";
  const stubPath = "/stub/module.ts";
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true);
  const stubFile = ts.createSourceFile(stubPath, TYPE_STUB, ts.ScriptTarget.ES2022, true);
  const defaultHost = ts.createCompilerHost({});
  const host: ts.CompilerHost = {
    ...defaultHost,
    fileExists: (f) => f === fileName || f === stubPath || defaultHost.fileExists(f),
    readFile: (f) =>
      f === fileName ? source : f === stubPath ? TYPE_STUB : defaultHost.readFile(f),
    getSourceFile: (f, lv, onError) => {
      if (f === fileName) return sourceFile;
      if (f === stubPath) return stubFile;
      return defaultHost.getSourceFile(f, lv, onError);
    },
    resolveModuleNames: (moduleNames) =>
      moduleNames.map((name) =>
        name === "/stub/module"
          ? { resolvedFileName: stubPath, isExternalLibraryImport: false }
          : undefined,
      ),
  };
  const program = ts.createProgram({
    rootNames: [fileName],
    options: {
      noEmit: true,
      types: [],
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
    host,
  });
  return [
    ...program.getSemanticDiagnostics(sourceFile),
    ...program.getSyntacticDiagnostics(sourceFile),
  ];
}

function codes(source: string): number[] {
  return getDiagnostics(source).map((d) => d.code);
}

const IMPORT = 'import { render } from "/stub/module";';

describe("render conditional generic — semantic diagnostics", () => {
  it("required locals omitted → TS2345", () => {
    expect(codes(`${IMPORT} render({ partial: "users/user" });`)).toEqual([2345]);
  });

  it("required locals incomplete (user missing) → TS2345", () => {
    expect(
      codes(`${IMPORT} render({ partial: "users/user", locals: { role: "admin" } });`),
    ).toEqual([2345]);
  });

  it("excess property in locals → TS2353", () => {
    expect(
      codes(`${IMPORT} render({ partial: "users/user", locals: { user: "a", wrong: 1 } });`),
    ).toEqual([2353]);
  });

  it("all-optional locals — omitting locals is fine", () => {
    expect(getDiagnostics(`${IMPORT} render({ partial: "static/header" });`)).toEqual([]);
  });

  it("correct required + optional locals — no error", () => {
    expect(
      getDiagnostics(
        `${IMPORT} render({ partial: "users/user", locals: { user: "Alice", role: "admin" } });`,
      ),
    ).toEqual([]);
  });

  it("correct required locals only — no error", () => {
    expect(
      getDiagnostics(`${IMPORT} render({ partial: "users/user", locals: { user: "Alice" } });`),
    ).toEqual([]);
  });

  it("dynamic string name falls back permissively — no error", () => {
    expect(
      getDiagnostics(`
        ${IMPORT}
        const name: string = "x";
        render({ partial: name });
        render({ partial: name, locals: { anything: 42 } });
      `),
    ).toEqual([]);
  });
});
