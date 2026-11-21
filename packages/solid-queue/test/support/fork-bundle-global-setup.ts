import { type Plugin, build } from "vite";

const root = `${import.meta.dirname}/../..`;

const keepModuleUrls: Plugin = {
  name: "keep-module-urls",
  enforce: "pre",
  transform(code, id) {
    if (!code.includes("import.meta.url")) return null;
    return code
      .replace(/import\(new URL\(("[^"]+"), import\.meta\.url\)\.href\)/g, "import($1)")
      .replaceAll("import.meta.url", JSON.stringify(`file://${id.split("?")[0]}`));
  },
};

export default async function setup() {
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
}
