import { Task } from "@blazetrails/rake";
import { Dir, File } from "@blazetrails/ruby-compat";
import { ViteAssets } from "@blazetrails/vite-assets";

await ViteAssets.installTasks();
if (
  await File.isExistAsync(
    File.join(Dir.pwd(), "node_modules", ViteAssets.FRAMEWORK_PACKAGES["trails"], "package.json"),
  )
)
  (await Task.get("vite:verify_install")).enhance(["environment"]);
