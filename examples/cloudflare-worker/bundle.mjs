import { build } from "esbuild";
import { trailsEsbuildPreset } from "@blazetrails/trailties/esbuild";

const result = await build({
  ...trailsEsbuildPreset("workerd", { url: "file:///bundle/dist/worker.js" }),
  entryPoints: ["worker/index.ts"],
  target: "es2023",
  outfile: "dist/worker.js",
  minify: true,
  logLimit: 0,
});
for (const w of result.warnings) console.warn(w.text);
