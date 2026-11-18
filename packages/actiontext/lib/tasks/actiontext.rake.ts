import { DSL } from "@blazetrails/rake";
import { block } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";

DSL.desc("Copy over the migration, stylesheet, and JavaScript files");
DSL.task(
  "action_text:install",
  block(async () => {
    await Trails.Command!.invoke("generate", ["action_text:install"]);
  }),
);
