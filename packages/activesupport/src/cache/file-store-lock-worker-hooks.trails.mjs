// Reproduces vitest's `@blazetrails/*` → package `src` aliasing for the worker
// of the lock_file regression test, so the packages' `dist` need not be built.
const packagesUrl = new URL("../../../", import.meta.url);

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@blazetrails/")) {
    const name = specifier.slice("@blazetrails/".length);
    return nextResolve(new URL(`${name}/src/index.ts`, packagesUrl).href, context);
  }
  return nextResolve(specifier, context);
}
