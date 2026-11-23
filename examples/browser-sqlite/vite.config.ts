import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { PACKAGE_NAMES } from "./src/runtime/package-names.ts";

const resolve = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const STUB_PREFIX = "\0node-stub:";

function nodeBuiltinStubs(): Plugin {
  const builtins = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
  return {
    name: "node-builtin-stubs",
    enforce: "pre",
    resolveId(id) {
      if (id === "node:module" || id === "module") return resolve("src/shims/node-module.ts");
      if (id === "buffer") return null;
      if (builtins.has(id)) return STUB_PREFIX + id.replace(/^node:/, "");
      return null;
    },
    async load(id) {
      if (!id.startsWith(STUB_PREFIX)) return null;
      const name = id.slice(STUB_PREFIX.length);
      const real = (await import(`node:${name}`)) as Record<string, unknown>;
      const names = Object.keys(real).filter(
        (k) => k !== "default" && /^[A-Za-z_$][\w$]*$/.test(k),
      );
      return [
        `const stub = (path) => new Proxy(function () {}, {`,
        `  get: (_t, key) => (key === Symbol.toPrimitive ? () => path : typeof key === "symbol" ? undefined : stub(path + "." + key)),`,
        `  apply: () => { throw new Error(path + " is not available in the browser"); },`,
        `  construct: () => { throw new Error(path + " is not available in the browser"); },`,
        `});`,
        ...names.map((n) => `export const ${n} = stub(${JSON.stringify(`${name}.${n}`)});`),
        `export default stub(${JSON.stringify(name)});`,
      ].join("\n");
    },
  };
}

const PACKAGE_URLS = "\0trails-package-urls";

function trailsPackageUrls(): Plugin {
  return {
    name: "trails-package-urls",
    resolveId: (id) => (id === "virtual:trails-package-urls" ? PACKAGE_URLS : null),
    async load(id) {
      if (id !== PACKAGE_URLS) return null;
      const importer = resolve("src/runtime/modules.ts");
      const entries: Record<string, string> = {};
      for (const name of PACKAGE_NAMES) {
        const resolved = await this.resolve(name, importer);
        if (resolved) entries[name] = `/@fs${resolved.id}`;
      }
      return `export default ${JSON.stringify(entries)};`;
    },
  };
}

export default defineConfig({
  plugins: [nodeBuiltinStubs(), trailsPackageUrls()],
  resolve: {
    alias: [
      { find: /^node:buffer$/, replacement: "buffer" },
      {
        find: /^nodemailer\/lib\/smtp-connection\/index\.js$/,
        replacement: resolve("src/shims/smtp-connection.ts"),
      },
      {
        find: "@blazetrails/trails-tsc/plugins/tse",
        replacement: resolve("../../packages/trails-tsc/dist/plugins/tse.js"),
      },
    ],
  },
  esbuild: { keepNames: true },
  optimizeDeps: {
    include: ["sql.js", "path-browserify", "@js-temporal/polyfill", "yaml", "buffer"],
    esbuildOptions: { keepNames: true },
  },
});
