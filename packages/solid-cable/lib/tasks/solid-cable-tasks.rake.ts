import { DSL } from "@blazetrails/rake";
import { block } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";

DSL.desc("Copy over the schema and set cable adapter for Solid Cable");
DSL.namespace("solid-cable", () => {
  DSL.task(
    "install",
    block(async () => {
      await Trails.Command!.invoke("generate", ["solid-cable:install"]);
    }),
  );

  DSL.task(
    "update",
    block(async () => {
      await Trails.Command!.invoke("generate", ["solid-cable:update"]);
    }),
  );
});
