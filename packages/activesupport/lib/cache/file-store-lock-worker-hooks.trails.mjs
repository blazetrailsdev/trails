const packagesUrl = new URL("../../../", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@blazetrails/")) {
    const [name, ...rest] = specifier.slice("@blazetrails/".length).split("/");
    const target = (root) =>
      new URL(
        rest.length > 0 ? `${name}/${root}/${rest.join("/")}.ts` : `${name}/${root}/index.ts`,
        packagesUrl,
      ).href;
    try {
      return await nextResolve(target("lib"), context);
    } catch {
      return nextResolve(target("src"), context);
    }
  }
  return nextResolve(specifier, context);
}
