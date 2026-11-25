import { build } from "esbuild";
import { trailsEsbuildPreset } from "@blazetrails/trailties/esbuild";

const result = await build({
  ...trailsEsbuildPreset("node"),
  entryPoints: ["serverless/lambda.ts"],
  target: "node22",
  splitting: true,
  outdir: "dist",
  entryNames: "handler",
  outExtension: { ".js": ".mjs" },
  metafile: true,
  logLimit: 0,
});
for (const w of result.warnings) console.warn(w.text);
(await import("node:fs")).writeFileSync("dist/meta.json", JSON.stringify(result.metafile));
