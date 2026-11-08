import { Dependencies } from "@blazetrails/activesupport";
import { Dir, File } from "@blazetrails/ruby-compat";
import { Loader } from "@blazetrails/zeitwerk";

export class ZeitwerkChecker {
  static async check(): Promise<string[]> {
    await Loader.eagerLoadAll();

    const autoloaded = [...Dependencies.autoloadPaths, ...Dependencies.autoloadOncePaths];
    const eagerLoaded = [...Dependencies._eagerLoadPaths];

    let unchecked = autoloaded.filter((dir) => !eagerLoaded.includes(dir));
    const selected: string[] = [];
    for (const dir of unchecked) {
      if ((await File.isDirectoryAsync(dir)) && (await Dir.childrenAsync(dir)).length > 0) {
        selected.push(dir);
      }
    }
    unchecked = selected;
    return unchecked;
  }
}
