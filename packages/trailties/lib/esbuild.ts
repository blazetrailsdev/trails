/** @noRailsEquivalent PERMANENT */
export const withoutLibxml2UntilNokogiriExtensionCompilesInWorkerd = {
  name: "without-libxml2",
  setup(build: {
    onLoad(options: { filter: RegExp }, callback: () => { contents: string; loader: "js" }): void;
  }): void {
    build.onLoad({ filter: /nokogiri\/dist\/extension\.js$/ }, () => ({
      contents: "",
      loader: "js",
    }));
  },
};

/** @noRailsEquivalent PERMANENT */
export function trailsEsbuildPreset(
  target: "node" | "workerd",
  options: { url?: string } = {},
): Record<string, unknown> {
  const base = { bundle: true, platform: "node", format: "esm" };
  if (target === "node") {
    return {
      ...base,
      banner: {
        js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
      },
    };
  }
  const url = JSON.stringify(options.url ?? "file:///bundle/dist/worker.js");
  return {
    ...base,
    conditions: ["workerd", "worker"],
    external: ["node:*", "cloudflare:*"],
    define: { "import.meta.url": url },
    banner: {
      js: `import{createRequire as __cr}from'node:module';const require=__cr(${url});`,
    },
    plugins: [withoutLibxml2UntilNokogiriExtensionCompilesInWorkerd],
  };
}
