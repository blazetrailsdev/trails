import { build } from "esbuild";

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
  banner: {
    js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
  },
});
for (const w of result.warnings) console.warn(w.text);
(await import("node:fs")).writeFileSync("dist/meta.json", JSON.stringify(result.metafile));
