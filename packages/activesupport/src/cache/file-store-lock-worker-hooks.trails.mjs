const packagesUrl = new URL("../../../", import.meta.url);

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@blazetrails/")) {
    const [name, ...rest] = specifier.slice("@blazetrails/".length).split("/");
    const target = rest.length > 0 ? `${name}/src/${rest.join("/")}.ts` : `${name}/src/index.ts`;
    return nextResolve(new URL(target, packagesUrl).href, context);
  }
  return nextResolve(specifier, context);
}
