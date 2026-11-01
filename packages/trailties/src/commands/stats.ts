import "../class-paths.stats.generated.js";
import { Dir, File, stdout } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import { CodeStatistics, type DirectoryPair } from "../code-statistics.js";
import { Base } from "../command/base.js";

export class StatsCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    klass.desc("stats", "Report code statistics (KLOCs, etc) from the application or engine");
    klass.methodAdded("perform");
  }

  /**
   * @missingRailsCall new — CONVERGEABLE notes-and-stats-output-is-printed-by-extractor-and-code-statistics
   * @missingRailsArgs join — CONVERGEABLE trails-cli-has-no-app-loader-exec-app
   * @inventedArm write — CONVERGEABLE notes-and-stats-output-is-printed-by-extractor-and-code-statistics
   */
  async perform(): Promise<void> {
    await this.bootApplicationBang();

    const statDirectories = CodeStatistics.directories
      .map(([name, dir]): DirectoryPair => [name, File.join(Dir.pwd(), dir)])
      .filter(([, dir]) => File.isDirectory(dir));

    stdout.write(`${(await CodeStatistics.create(...statDirectories)).toString()}\n`);
  }
}
