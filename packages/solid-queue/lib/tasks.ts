import { DSL } from "@blazetrails/rake";
import { SystemExit, block } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";
import { Configuration } from "./configuration.js";
import { Supervisor } from "./supervisor.js";

DSL.namespace("solid_queue", () => {
  DSL.desc("Install Solid Queue");
  DSL.task(
    "install",
    block(async () => {
      await Trails.Command!.invoke("generate", ["solid_queue:install"]);
    }),
  );

  DSL.desc("Copy any new Solid Queue migrations to the application");
  DSL.task(
    "update",
    block(async () => {
      await Trails.Command!.invoke("generate", ["solid_queue:update"]);
    }),
  );

  DSL.desc("start solid_queue supervisor to dispatch and process jobs");
  DSL.task(
    { start: "environment" },
    block(async () => {
      await Supervisor.start();
    }),
  );

  DSL.desc(
    "validate the Solid Queue configuration for the current Rails env without starting any process",
  );
  DSL.task(
    { check: "environment" },
    block(async () => {
      const configuration = new Configuration();
      if (!(await configuration.check())) throw new SystemExit(1);
    }),
  );
});
