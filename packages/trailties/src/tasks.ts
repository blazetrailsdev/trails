import { Rake } from "@blazetrails/rake";
import { File, rbFLoad } from "@blazetrails/ruby-compat";

const tasks = ["framework", "log", "misc", "tmp", "yarn", "zeitwerk"];
if (Rake.application!.currentScope.isEmpty()) tasks.push("statistics");

/** @inventedArm isExistAsync — CONVERGEABLE port-remaining-rails-tasks-rake-files */
for (const task of tasks) {
  const file = File.join(
    import.meta.dirname,
    "tasks",
    `${task}${File.extname(import.meta.filename)}`,
  );
  if (await File.isExistAsync(file)) await rbFLoad(file);
}
