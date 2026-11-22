import { ViteAssets } from "@blazetrails/vite-assets";

await ViteAssets.configure({ publicOutputDir: "from_ruby" });
ViteAssets.env()["EXAMPLE_PATH"] = new URL("../../../../trailties", import.meta.url).pathname;
