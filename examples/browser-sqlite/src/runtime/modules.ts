import ts from "typescript-5";
import packageUrls from "virtual:trails-package-urls";

/**
 * The URL the dev server serves each framework package at. An app module's
 * bare `@blazetrails/*` import is answered with a shim that re-exports that
 * URL, so the app shares the framework's own module instances and live
 * bindings.
 */
export const PACKAGES: Readonly<Record<string, string>> = packageUrls;

/** The ES module source that re-exports a package from its dev-server URL. None has a default export. */
export function packageShim(name: string): string | null {
  const url = PACKAGES[name];
  return url === undefined ? null : `export * from ${JSON.stringify(url)};`;
}

/**
 * Transpiles an app file to an ES module whose bare imports point at the
 * package shims. Relative imports stay relative: the service worker serves
 * every app file at its own path, so they resolve as they do on disk.
 */
export function transpile(source: string, fileName: string, pkgBase: string): string {
  const { outputText } = ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      useDefineForClassFields: true,
      inlineSourceMap: true,
      inlineSources: true,
    },
  });
  const { importedFiles } = ts.preProcessFile(outputText, true, true);
  let out = outputText;
  for (const { fileName: spec, pos } of importedFiles.toSorted((a, b) => b.pos - a.pos)) {
    if (spec.startsWith(".") || spec.startsWith("/")) continue;
    const start = pos + 1;
    out = `${out.slice(0, start)}${pkgBase}${encodeURIComponent(spec)}${out.slice(start + spec.length)}`;
  }
  return out;
}

export type Problem = { path: string; line: number; column: number; message: string };

/**
 * The first syntax error TypeScript reports for an app file, which would
 * otherwise surface as a bare `SyntaxError` at import. Only the first: the
 * parser's later reports for the same file are mostly its recovery from that one.
 */
export function syntaxErrors(source: string, fileName: string): Problem[] {
  const { diagnostics = [] } = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return diagnostics.slice(0, 1).map((d) => {
    const at = d.file?.getLineAndCharacterOfPosition(d.start ?? 0);
    return {
      path: fileName,
      line: (at?.line ?? 0) + 1,
      column: (at?.character ?? 0) + 1,
      message: ts.flattenDiagnosticMessageText(d.messageText, " "),
    };
  });
}

function asyncCall(body: string): { js: string; ok: boolean } {
  const { outputText, diagnostics = [] } = ts.transpileModule(`(async () => ${body})()`, {
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  });
  return { js: outputText.trim().replace(/;$/, ""), ok: diagnostics.length === 0 };
}

/** A console line as the JavaScript of an async call: an expression when it parses as one, else statements. */
export function consoleLine(code: string): string {
  const expression = asyncCall(`(\n${code}\n)`);
  return expression.ok ? expression.js : asyncCall(`{\n${code}\n}`).js;
}
