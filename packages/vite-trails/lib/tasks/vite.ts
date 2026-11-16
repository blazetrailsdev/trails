import { Task } from "@blazetrails/rake";
import { ViteAssets } from "@blazetrails/vite-assets";

await ViteAssets.installTasks();
/** @missingRailsCall loaded_specs — PERMANENT */
(await Task.get("vite:verify_install")).enhance(["environment"]);
