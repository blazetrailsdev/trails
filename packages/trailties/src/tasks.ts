import { Rake } from "@blazetrails/rake";
import { File, rbFLoad } from "@blazetrails/ruby-compat";

const tasks = ["framework", "log", "misc", "tmp", "yarn", "zeitwerk"];
if (Rake.application!.currentScope.isEmpty()) tasks.push("statistics");

for (const task of tasks) {
  await rbFLoad(
    File.join(import.meta.dirname, "tasks", `${task}${File.extname(import.meta.filename)}`),
  );
}
