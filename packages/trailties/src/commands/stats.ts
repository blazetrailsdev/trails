import { cwd as getCwd } from "@blazetrails/activesupport/process-adapter";
import { getPathAsync } from "@blazetrails/activesupport";
import { Command } from "commander";
import { CodeStatistics } from "../code-statistics.js";

// Mirror of `bin/rails stats`. Rails source:
// railties/lib/rails/tasks/statistics.rake.
export function statsCommand(): Command {
  return new Command("stats")
    .description("Report code statistics (KLOCs, etc) from the application or engine")
    .action(async () => {
      const path = await getPathAsync();
      const cwd = getCwd();
      const pairs = CodeStatistics.directories.map(
        ([label, p]) => [label, path.join(cwd, p)] as [string, string],
      );
      const stats = await CodeStatistics.create(...pairs);
      console.log(stats.toString());
    });
}
