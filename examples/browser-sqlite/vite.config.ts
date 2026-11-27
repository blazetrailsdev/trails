import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { declarationFiles } from "./scripts/declarations.ts";
import { FRAMEWORK_ROOT, PACKAGE_NAMES, SEAT_FRAMEWORK_DIR } from "./src/runtime/package-names.ts";

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
  let build = false;
  return {
    name: "trails-package-urls",
    configResolved(config) {
      build = config.command === "build";
    },
    resolveId: (id) => (id === "virtual:trails-package-urls" ? PACKAGE_URLS : null),
    async load(id) {
      if (id !== PACKAGE_URLS) return null;
      const importer = resolve("src/runtime/modules.ts");
      const entries: Record<string, string> = {};
      for (const name of PACKAGE_NAMES) {
        const resolved = await this.resolve(name, importer);
        if (!resolved) continue;
        if (!build) {
          entries[name] = JSON.stringify(`/@fs${resolved.id}`);
          continue;
        }
        const ref = this.emitFile({ type: "chunk", id: resolved.id, preserveSignature: "strict" });
        entries[name] = `import.meta.ROLLUP_FILE_URL_${ref}`;
      }
      const body = Object.entries(entries).map(([k, v]) => `${JSON.stringify(k)}: ${v}`);
      return `export default {${body.join(", ")}};`;
    },
  };
}

const DECLARATIONS = "\0trails-declarations";

function trailsDeclarations(): Plugin {
  return {
    name: "trails-declarations",
    resolveId: (id) => (id === "virtual:trails-declarations" ? DECLARATIONS : null),
    load: async (id) =>
      id === DECLARATIONS ? `export default ${JSON.stringify(await declarationFiles())};` : null,
  };
}

function importMetaPaths(): Plugin {
  return {
    name: "import-meta-paths",
    transform(code, id) {
      const match = /\/packages\/([^/]+)\/(dist\/[^?]*)/.exec(id);
      if (!match || !/\bimport\.meta\.(dirname|filename)\b/.test(code)) return null;
      const filename = `${FRAMEWORK_ROOT}/${match[1]}/${match[2]}`;
      const dirname = filename.slice(0, filename.lastIndexOf("/"));
      return code
        .replace(/\bimport\.meta\.dirname\b/g, `${SEAT_FRAMEWORK_DIR}(${JSON.stringify(dirname)})`)
        .replace(/\bimport\.meta\.filename\b/g, JSON.stringify(filename));
    },
  };
}

function offlinePrecache(): Plugin {
  let outDir = "";
  return {
    name: "offline-precache",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    async writeBundle() {
      const files = (await readdir(outDir, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => relative(outDir, join(entry.parentPath, entry.name)).split("\\").join("/"))
        .filter((file) => file !== "sw.js")
        .sort();
      const hash = createHash("sha256");
      for (const file of files) hash.update(file).update(await readFile(join(outDir, file)));
      const sw = join(outDir, "sw.js");
      const precache = JSON.stringify({ version: hash.digest("hex").slice(0, 16), files });
      await writeFile(
        sw,
        (await readFile(sw, "utf8")).replace("self.__PRECACHE__", () => precache),
      );
    },
  };
}

export default defineConfig({
  plugins: [
    nodeBuiltinStubs(),
    trailsPackageUrls(),
    trailsDeclarations(),
    importMetaPaths(),
    offlinePrecache(),
  ],
  worker: { format: "es", plugins: () => [trailsDeclarations()] },
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
  build: {
    target: "esnext",
    rollupOptions: {
      input: { index: resolve("index.html"), runtime: resolve("runtime.html") },
      preserveEntrySignatures: "strict",
    },
  },
  optimizeDeps: {
    include: ["sql.js", "path-browserify", "@js-temporal/polyfill", "yaml", "buffer"],
    esbuildOptions: { keepNames: true },
  },
});
