import ts from "typescript-5";

/**
 * The framework packages an app module may import. The runtime bundle holds
 * one copy of each, and app code reaches that copy through a generated shim,
 * so a model's `Base` is the `Base` the framework itself uses.
 */
export const PACKAGES: Record<string, () => Promise<Record<string, unknown>>> = {
  "@blazetrails/actionpack": () => import("@blazetrails/actionpack"),
  "@blazetrails/actionview": () => import("@blazetrails/actionview"),
  "@blazetrails/activemodel": () => import("@blazetrails/activemodel"),
  "@blazetrails/activerecord": () => import("@blazetrails/activerecord"),
  "@blazetrails/activesupport": () => import("@blazetrails/activesupport"),
  "@blazetrails/ruby-compat": () => import("@blazetrails/ruby-compat"),
  "@blazetrails/trailties": () => import("@blazetrails/trailties"),
  "@blazetrails/trailties/trails": () => import("@blazetrails/trailties/trails"),
  "@blazetrails/trailties/trailties/active-record": () =>
    import("@blazetrails/trailties/trailties/active-record"),
  "@blazetrails/trailties/trailties/action-controller": () =>
    import("@blazetrails/trailties/trailties/action-controller"),
  "@blazetrails/trailties/trailties/action-view": () =>
    import("@blazetrails/trailties/trailties/action-view"),
};

const loaded = new Map<string, Record<string, unknown>>();

export async function loadPackages(): Promise<void> {
  for (const [name, load] of Object.entries(PACKAGES)) loaded.set(name, await load());
  (globalThis as { __trailsPackages?: unknown }).__trailsPackages = Object.fromEntries(loaded);
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** The ES module source that re-exports a package from the runtime bundle. */
export function packageShim(name: string): string | null {
  const mod = loaded.get(name);
  if (!mod) return null;
  const names = Object.keys(mod).filter((k) => k !== "default" && IDENTIFIER.test(k));
  return [
    `const m = globalThis.__trailsPackages[${JSON.stringify(name)}];`,
    ...names.map((n) => `export const ${n} = m.${n};`),
    `export default m.default;`,
  ].join("\n");
}

const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"']+)\2/g;

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
      verbatimModuleSyntax: false,
      useDefineForClassFields: true,
      inlineSourceMap: true,
      inlineSources: true,
    },
  });
  return outputText.replace(SPECIFIER, (whole, head: string, quote: string, spec: string) => {
    if (spec.startsWith(".") || spec.startsWith("/")) return whole;
    return `${head}${quote}${pkgBase}${encodeURIComponent(spec)}${quote}`;
  });
}
