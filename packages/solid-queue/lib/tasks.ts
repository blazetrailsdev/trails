import { DSL } from "@blazetrails/rake";
import { block } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";
import { Supervisor } from "./supervisor.js";

DSL.namespace("solid_queue", () => {
  DSL.desc("Install Solid Queue");
  DSL.task(
    "install",
    block(async () => {
      await Trails.Command!.invoke("generate", ["solid_queue:install"]);
    }),
  );

  DSL.desc("start solid_queue supervisor to dispatch and process jobs");
  DSL.task(
    { start: "environment" },
    block(async () => {
      await Supervisor.start();
    }),
  );
});
