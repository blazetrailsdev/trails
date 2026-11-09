import "../constants.stats.generated.js";
import { File } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import { CodeStatistics, type DirectoryPair } from "../code-statistics.js";
import { Base } from "../command/base.js";
import { applicationRoot } from "../command.js";

export class StatsCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    klass.desc("stats", "Report code statistics (KLOCs, etc) from the application or engine");
    klass.methodAdded("perform");
  }

  /** @missingRailsCall new — CONVERGEABLE code-statistics-create-stands-in-for-new */
  async perform(): Promise<void> {
    await this.bootApplicationBang();

    const statDirectories = CodeStatistics.directories
      .map(([name, dir]): DirectoryPair => [name, applicationRoot()!.join(dir).toString()])
      .filter(([, dir]) => File.isDirectory(dir));

    (await CodeStatistics.create(...statDirectories)).toString();
  }
}
