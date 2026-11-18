import { DSL, Task } from "@blazetrails/rake";
import { File, Pathname, block, setEnv } from "@blazetrails/ruby-compat";
import { Engine } from "../engine.js";

await DSL.namespace("active_storage", async () => {
  (await Task.get("install:migrations")).clearComments();

  DSL.desc("Copy over the migration needed to the application");
  DSL.task(
    { install: "environment" },
    block(async () => {
      if (Task.isTaskDefined("active_storage:install:migrations")) {
        await (await Task.get("active_storage:install:migrations")).invoke();
      } else {
        await (await Task.get("app:active_storage:install:migrations")).invoke();
      }
    }),
  );

  DSL.task(
    { update: "environment" },
    block(async () => {
      setEnv(
        "MIGRATIONS_PATH",
        new Pathname(File.join(import.meta.dirname, "..", "db", "update-migrate"))
          .relativePathFrom(Engine.instance().root()!)
          .toString(),
      );

      if (Task.isTaskDefined("active_storage:install")) {
        await (await Task.get("active_storage:install")).invoke();
      } else {
        await (await Task.get("app:active_storage:install")).invoke();
      }
    }),
  );
});
