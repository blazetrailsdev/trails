// Reproduces vitest's `@blazetrails/*` → package `src` aliasing for the worker
// of the lock_file regression test, so the packages' `dist` need not be built.
// Subpath specifiers (`@blazetrails/ruby-compat/name-error`) resolve into the
// package's `src` the way vitest's trailing-slash alias does; a bare package
// name resolves to its `src/index.ts`.
const packagesUrl = new URL("../../../", import.meta.url);

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@blazetrails/")) {
    const [name, ...rest] = specifier.slice("@blazetrails/".length).split("/");
    const target = rest.length > 0 ? `${name}/src/${rest.join("/")}.ts` : `${name}/src/index.ts`;
    return nextResolve(new URL(target, packagesUrl).href, context);
  }
  return nextResolve(specifier, context);
}
