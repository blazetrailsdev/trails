import { File, rbFLoad } from "@blazetrails/ruby-compat";

for (const task of ["zeitwerk"]) {
  await rbFLoad(
    File.join(import.meta.dirname, "tasks", `${task}${File.extname(import.meta.filename)}`),
  );
}
