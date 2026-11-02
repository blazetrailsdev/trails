import { DeprecatedObjectProxy, callerLocations } from "@blazetrails/activesupport";
import { DSL, Rake } from "@blazetrails/rake";
import { File, TopLevel, block, stderr, stdout } from "@blazetrails/ruby-compat";
import { CodeStatistics, DIRECTORIES, type DirectoryPair } from "../code-statistics.js";
import { deprecator } from "../deprecator.js";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    STATS_DIRECTORIES?: DirectoryPair[];
  }
}

TopLevel.STATS_DIRECTORIES = new DeprecatedObjectProxy(
  DIRECTORIES,
  "`STATS_DIRECTORIES` is deprecated and will be removed in Rails 8.1! Use `Rails::CodeStatistics.register_directory('My Directory', 'path/to/dir)` instead.",
  deprecator(),
) as unknown as DirectoryPair[];

DSL.desc("Report code statistics (KLOCs, etc) from the application or engine");
DSL.task(
  "stats",
  block(async () => {
    const statDirectories = TopLevel.STATS_DIRECTORIES!.map(
      ([name, dir]): DirectoryPair => [
        name,
        `${File.dirname(Rake.application!.rakefileLocation())}/${dir}`,
      ],
    ).filter(([, dir]) => File.isDirectory(dir));

    stderr.write(
      `${deprecator().warn(
        "`bin/rake stats` has been deprecated and will be removed in Rails 8.1.\nPlease use `bin/rails stats` as Rails command instead.\n\n",
        callerLocations(0, 2),
      )}\n`,
    );

    stdout.write(`${(await CodeStatistics.create(...statDirectories)).toString()}\n`);
  }),
);
