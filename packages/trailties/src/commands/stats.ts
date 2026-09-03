import { Dir } from "@blazetrails/ruby-compat";
import { getPathAsync } from "@blazetrails/ruby-compat";
import { Command } from "commander";
import { CodeStatistics } from "../code-statistics.js";

export function statsCommand(): Command {
  return new Command("stats")
    .description("Report code statistics (KLOCs, etc) from the application or engine")
    .action(async () => {
      const path = await getPathAsync();
      const cwd = Dir.pwd();
      const pairs = CodeStatistics.directories.map(
        ([label, p]) => [label, path.join(cwd, p)] as [string, string],
      );
      const stats = await CodeStatistics.create(...pairs);
      console.log(stats.toString());
    });
}
