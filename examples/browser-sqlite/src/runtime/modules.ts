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
