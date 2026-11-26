import { Rake } from "@blazetrails/rake";
import { File } from "@blazetrails/ruby-compat/file";
import { rbFLoad } from "@blazetrails/ruby-compat/load";

const tasks = ["framework", "log", "misc", "tmp", "pnpm", "zeitwerk"];
if (Rake.application!.currentScope.isEmpty()) tasks.push("statistics");

for (const task of tasks) {
  await rbFLoad(
    File.join(import.meta.dirname, "tasks", `${task}${File.extname(import.meta.filename)}`),
  );
}
