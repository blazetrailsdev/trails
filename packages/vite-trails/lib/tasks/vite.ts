import { Task } from "@blazetrails/rake";
import { Gem } from "@blazetrails/ruby-compat";
import { ViteAssets } from "@blazetrails/vite-assets";

await ViteAssets.installTasks();
if (Gem.loadedSpecs["trails"]) (await Task.get("vite:verify_install")).enhance(["environment"]);
