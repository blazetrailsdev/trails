import { DSL } from "@blazetrails/rake";
import { block } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";

DSL.desc("Copy over the migration, and set cache");
DSL.namespace("solid_cache", () => {
  DSL.task(
    "install",
    block(async () => {
      await Trails.Command!.invoke("generate", ["solid_cache:install"]);
    }),
  );
});
