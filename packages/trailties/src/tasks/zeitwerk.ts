import { DSL } from "@blazetrails/rake";
import { STDOUT, abort, block, regexpEscape } from "@blazetrails/ruby-compat";
import { NameError } from "@blazetrails/zeitwerk";
import { Trails } from "../rails.js";
import { ZeitwerkChecker } from "../zeitwerk-checker.js";

const reportUnchecked = (unchecked: string[]): void => {
  STDOUT.puts();
  STDOUT.puts(`WARNING: The following directories will only be checked if you configure
them to be eager loaded:
`);
  STDOUT.puts();

  for (const dir of unchecked) STDOUT.puts(`  ${dir}`);
  STDOUT.puts();

  STDOUT.puts(`You may verify them manually, or add them to config.eager_load_paths
in config/application.rb and run zeitwerk:check again.
`);
  STDOUT.puts();
};

DSL.namespace("zeitwerk", () => {
  /** @noRailsEquivalent CONVERGEABLE zeitwerk-check-name-error-reaches-task-abort */
  DSL.task(
    "defer_boot_eager_load",
    block(() => {
      Trails.application!.config.deferBootEagerLoad = true;
    }),
  );

  DSL.desc("Check project structure for Zeitwerk compatibility");
  DSL.task(
    { check: ["defer_boot_eager_load", "environment"] },
    block(async () => {
      STDOUT.puts("Hold on, I am eager loading the application.");

      let unchecked: string[];
      try {
        unchecked = await ZeitwerkChecker.check();
      } catch (e) {
        if (!(e instanceof NameError)) throw e;
        abort(e.message.replace(new RegExp(`${regexpEscape(Trails.root()!.toString())}.`), ""));
      }

      if (unchecked.length === 0) {
        STDOUT.puts("All is good!");
      } else {
        reportUnchecked(unchecked);
        STDOUT.puts("Otherwise, all is good!");
      }
    }),
  );
});
