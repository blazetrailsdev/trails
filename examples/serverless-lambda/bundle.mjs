// esbuild bundle for a serverless target. Drivers for adapters the app does not use are
// replaced by a stub: esbuild hoists an external import to the top of an ESM bundle even when
// only a lazily-imported adapter file reaches it, so "external" would make them load-time deps.
import { build } from "esbuild";

const UNUSED_DRIVERS = (
  process.env.STUB_DRIVERS ?? "better-sqlite3,mysql2,mysql2/promise,pg-native,libsql,@libsql/client"
).split(",");
const stubDrivers = {
  name: "stub-unused-drivers",
  setup(b) {
    const filter = new RegExp(
      `^(${UNUSED_DRIVERS.map((d) => d.replace(/[/.]/g, "\\$&")).join("|")})(/.*)?$`,
    );
    b.onResolve({ filter }, (a) => ({ path: a.path, namespace: "stub-driver" }));
    b.onLoad({ filter: /.*/, namespace: "stub-driver" }, (a) => ({
      contents: `const fail = () => { throw new Error("cannot load such file -- ${a.path} (not bundled)"); };
        const stub = new Proxy(function () {}, { get: (_, k) => k === "__esModule" ? false : fail(), apply: fail, construct: fail });
        export default stub; export const Pool = stub, Client = stub, createClient = stub, createConnection = stub, createPool = stub, types = stub, escapeIdentifier = stub, escapeLiteral = stub;`,
      loader: "js",
    }));
  },
};

const result = await build({
  entryPoints: ["serverless/lambda.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/handler.mjs",
  metafile: true,
  logLimit: 0,
  external: ["libxml2-wasm"],
  plugins: [stubDrivers],
  banner: {
    js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
  },
});
for (const w of result.warnings) console.warn(w.text);
(await import("node:fs")).writeFileSync("dist/meta.json", JSON.stringify(result.metafile));
