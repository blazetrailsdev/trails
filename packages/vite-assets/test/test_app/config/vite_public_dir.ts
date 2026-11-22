import { createRequire } from "node:module";
import { ViteAssets } from "@blazetrails/vite-assets";

await ViteAssets.configure({ publicOutputDir: "from_ruby" });
ViteAssets.env()["EXAMPLE_PATH"] = new URL(
  "..",
  `file://${createRequire(import.meta.url).resolve("@blazetrails/trailties")}`,
).pathname;
