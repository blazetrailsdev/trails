import { getEnv } from "@blazetrails/activesupport";
import { DSL } from "@blazetrails/rake";
import { block, exit, rbFSystem } from "@blazetrails/ruby-compat";
import { Runner } from "./runner.js";

DSL.task({ default: "test" });

DSL.desc("Run all tests in test folder except system ones");
DSL.task(
  "test",
  block(async () => {
    const test = getEnv("TEST");
    await Runner.runFromRake("test", test == null ? [] : [test]);
  }),
);

DSL.namespace("test", () => {
  DSL.task(
    "prepare",
    block(() => {}),
  );

  DSL.task({ run: ["test"] });

  DSL.desc("Reset the database and run `bin/trails test`");
  DSL.task(
    "db",
    block(async () => {
      const success = await rbFSystem(
        { TRAILS_ENV: getEnv("TRAILS_ENV") ?? "test" },
        "rake",
        "db:test:prepare",
        "test",
      );
      if (!success) exit(false);
    }),
  );

  for (const name of [
    ...Runner.TEST_FOLDERS,
    "all",
    "generators",
    "units",
    "functionals",
    "system",
  ]) {
    DSL.task(
      name,
      block(async () => {
        await Runner.runFromRake(`test:${name}`);
      }),
    );
  }
});
