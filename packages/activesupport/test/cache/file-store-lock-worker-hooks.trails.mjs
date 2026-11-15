const packagesUrl = new URL("../../../", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@blazetrails/")) {
    const [name, ...rest] = specifier.slice("@blazetrails/".length).split("/");
    return nextResolve(
      new URL(
        rest.length > 0 ? `${name}/lib/${rest.join("/")}.ts` : `${name}/lib/index.ts`,
        packagesUrl,
      ).href,
      context,
    );
  }
  return nextResolve(specifier, context);
}
