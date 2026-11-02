import { getEnv } from "@blazetrails/activesupport";
import { DSL } from "@blazetrails/rake";
import { Errno, STDERR, block, exit, rbFBackquote, rbFSystem } from "@blazetrails/ruby-compat";
import { Trails } from "../rails.js";

DSL.namespace("yarn", () => {
  DSL.desc("Install all JavaScript dependencies as specified via Yarn");
  DSL.task(
    "install",
    block(async () => {
      try {
        const validNodeEnvs = ["test", "development", "production"];
        const nodeEnv =
          getEnv("NODE_ENV") ??
          (validNodeEnvs.includes(String(Trails.env)) ? String(Trails.env) : "production");

        const yarnFlags = (await rbFBackquote("yarn --version")).startsWith("1")
          ? "--no-progress --frozen-lockfile"
          : "--immutable";

        await rbFSystem({ NODE_ENV: nodeEnv }, `yarn install ${yarnFlags}`, { exception: true });
      } catch (e) {
        if (!(e instanceof Errno.ENOENT)) throw e;
        STDERR.puts("yarn install failed to execute.");
        STDERR.puts("Ensure yarn is installed and `yarn --version` runs without errors.");
        exit(1);
      }
    }),
  );
});
