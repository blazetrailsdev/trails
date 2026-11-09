import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function pkgAlias(name: string, entry: string) {
  return {
    find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    replacement: path.resolve(__dirname, entry),
  };
}

function prependImportScripts() {
  return {
    name: "prepend-importscripts",
    generateBundle(_: unknown, bundle: Record<string, { type: string; code?: string }>) {
      for (const file of Object.values(bundle)) {
        if (file.type === "chunk" && file.code) {
          file.code = 'importScripts("/sql-wasm.js");\n' + file.code;
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [prependImportScripts()],
  resolve: {
    alias: [
      // Subpath imports must come before the base alias. The activerecord
      // sqlite drivers (@blazetrails/activerecord/sqlite/<name>) are handled by
      // the generic activerecord subpath alias below — the src/sqlite/ dir
      // matches the specifier, so no special case is needed.
      {
        find: /^@blazetrails\/activesupport\/(.+)$/,
        replacement: path.resolve(__dirname, "../activesupport/lib/$1.ts"),
      },
      pkgAlias("@blazetrails/activesupport", "../activesupport/lib/index.ts"),
      pkgAlias("@blazetrails/arel", "../arel/lib/index.ts"),
      pkgAlias("@blazetrails/activemodel", "../activemodel/lib/index.ts"),
      pkgAlias("@blazetrails/activerecord/migration", "../activerecord/src/migration.ts"),
      {
        find: /^@blazetrails\/activerecord\/(.+)$/,
        replacement: path.resolve(__dirname, "../activerecord/src/$1.ts"),
      },
      pkgAlias("@blazetrails/activerecord", "../activerecord/src/index.ts"),
      pkgAlias("@blazetrails/rack", "../rack/lib/index.ts"),
      pkgAlias("@blazetrails/actionview", "../actionview/lib/index.ts"),
      pkgAlias("@blazetrails/tse-compiler", "../tse-compiler/lib/index.ts"),
      pkgAlias("@blazetrails/actionpack", "../actionpack/lib/index.ts"),
      pkgAlias("@blazetrails/trailties/generators", "../trailties/lib/generators/index.ts"),
      pkgAlias("@blazetrails/globalid/wire", "../globalid/lib/wire.ts"),
      pkgAlias("@blazetrails/globalid/signed-global-id", "../globalid/lib/signed-global-id.ts"),
      pkgAlias("@blazetrails/globalid", "../globalid/lib/index.ts"),
      pkgAlias("@blazetrails/bcrypt", "../bcrypt/lib/index.ts"),
      pkgAlias("@blazetrails/date", "../date/lib/index.ts"),
      pkgAlias("@blazetrails/did-you-mean", "../did-you-mean/lib/index.ts"),
      pkgAlias("@blazetrails/i18n", "../i18n/lib/index.ts"),
      pkgAlias("@blazetrails/builder", "../builder/lib/builder.ts"),
      pkgAlias("@blazetrails/marcel", "../marcel/lib/marcel.ts"),
      pkgAlias("@blazetrails/chronic", "../chronic/lib/chronic.ts"),
      pkgAlias("@blazetrails/tzinfo", "../tzinfo/lib/index.ts"),
      pkgAlias("@blazetrails/et-orbi", "../et-orbi/lib/et-orbi.ts"),
      pkgAlias("@blazetrails/raabro", "../raabro/lib/raabro.ts"),
      pkgAlias("@blazetrails/msgpack", "../msgpack/lib/index.ts"),
      pkgAlias("@blazetrails/nokogiri", "src/stubs/nokogiri-stub.ts"),
    ],
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/lib/frontiers/sandbox-sw.ts"),
      formats: ["iife"],
      name: "SandboxSW",
      fileName: () => "sandbox-sw.js",
    },
    outDir: path.resolve(__dirname, "static"),
    emptyOutDir: false,
    rollupOptions: {
      external: (id: string) =>
        id === "sql.js" ||
        id.startsWith("node:") ||
        id.startsWith("pg") ||
        id.startsWith("mysql2") ||
        id.startsWith("better-sqlite3") ||
        [
          "fs",
          "path",
          "crypto",
          "url",
          "child_process",
          "util",
          "events",
          "stream",
          "net",
          "tls",
          "dns",
          "zlib",
          "timers",
          "process",
        ].includes(id),
      output: {
        globals: {
          "sql.js": "initSqlJs",
        },
      },
    },
  },
});
