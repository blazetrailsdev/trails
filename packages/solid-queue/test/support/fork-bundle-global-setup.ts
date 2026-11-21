import { type Plugin, build } from "vite";
import type { TestProject } from "vitest/node";

const root = `${import.meta.dirname}/../..`;

const ADAPTER_URL_IMPORTS = 3;
let adapterUrlImports = 0;

const keepModuleUrls: Plugin = {
  name: "keep-module-urls",
  enforce: "pre",
  transform(code, id) {
    if (!code.includes("import.meta.url")) return null;
    return code
      .replace(/import\(new URL\(("[^"]+"), import\.meta\.url\)\.href\)/g, (_match, path) => {
        adapterUrlImports++;
        return `import(${path})`;
      })
      .replaceAll("import.meta.url", JSON.stringify(`file://${id.split("?")[0]}`));
  },
};

export default async function setup(project: TestProject) {
  const filters = (project.vitest as unknown as { filenamePattern?: string[] }).filenamePattern;
  const { testFiles } = await project.globTestFiles(filters);
  if (!testFiles.some((file) => file.includes("/packages/solid-queue/"))) return;

  adapterUrlImports = 0;
  await build({
    configFile: false,
    root,
    logLevel: "error",
    plugins: [keepModuleUrls],
    ssr: { noExternal: true, external: ["better-sqlite3", "pg", "pg-native", "mysql2"] },
    build: {
      ssr: true,
      outDir: `${root}/node_modules/.cache/fork-bundle`,
      emptyOutDir: true,
      minify: false,
      target: "esnext",
      reportCompressedSize: false,
      rollupOptions: {
        input: {
          "fork-entry": `${root}/lib/processes/fork-entry.ts`,
          "supervisor-fork-entry": `${root}/test/support/supervisor-fork-entry.ts`,
          environment: `${root}/test/support/dummy/config/environment.ts`,
        },
        output: { format: "es", entryFileNames: "[name].js" },
      },
    },
  });
  if (adapterUrlImports !== ADAPTER_URL_IMPORTS) {
    throw new Error(
      `fork bundle: expected ${ADAPTER_URL_IMPORTS} import(new URL(...)) rewrites, made ${adapterUrlImports}`,
    );
  }
}
