import { getEnv } from "@blazetrails/activesupport";
import { DSL } from "@blazetrails/rake";
import { Errno, STDERR, block, exit, rbFSystem } from "@blazetrails/ruby-compat";
import { Trails } from "../trails.js";

DSL.namespace("pnpm", () => {
  DSL.desc("Install all JavaScript dependencies as specified via pnpm");
  DSL.task(
    "install",
    block(async () => {
      try {
        const validNodeEnvs = ["test", "development", "production"];
        const nodeEnv =
          getEnv("NODE_ENV") ??
          (validNodeEnvs.includes(String(Trails.env)) ? String(Trails.env) : "production");

        await rbFSystem({ NODE_ENV: nodeEnv }, "pnpm install --frozen-lockfile", {
          exception: true,
        });
      } catch (e) {
        if (!(e instanceof Errno.ENOENT)) throw e;
        STDERR.puts("pnpm install failed to execute.");
        STDERR.puts("Ensure pnpm is installed and `pnpm --version` runs without errors.");
        exit(1);
      }
    }),
  );
});
