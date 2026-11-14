import { DSL } from "@blazetrails/rake";
import { block } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";

DSL.desc("Install Action Mailbox and its dependencies");
DSL.task(
  "action_mailbox:install",
  block(async () => {
    await Trails.Command!.invoke("generate", ["action_mailbox:install"]);
  }),
);
