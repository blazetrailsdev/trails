import { DSL, main } from "@blazetrails/rake";
import { Dir, block } from "@blazetrails/ruby-compat";

await DSL.namespace("tmp", async () => {
  DSL.desc(
    "Clear cache, socket and screenshot files from tmp/ (narrow w/ tmp:cache:clear, tmp:sockets:clear, tmp:screenshots:clear)",
  );
  DSL.task({
    clear: ["tmp:cache:clear", "tmp:sockets:clear", "tmp:screenshots:clear", "tmp:storage:clear"],
  });

  const tmpDirs = ["tmp/cache", "tmp/sockets", "tmp/pids"];

  for (const d of tmpDirs) await main.directory(d);

  DSL.desc("Create tmp directories for cache, sockets, and pids");
  DSL.task({ create: tmpDirs });

  DSL.namespace("cache", () => {
    DSL.task(
      "clear",
      block(async () => {
        await main.rmRf(await Dir.globAsync("tmp/cache/[^.]*"), { verbose: false });
      }),
    );
  });

  DSL.namespace("sockets", () => {
    DSL.task(
      "clear",
      block(async () => {
        await main.rm(await Dir.globAsync("tmp/sockets/[^.]*"), { verbose: false });
      }),
    );
  });

  DSL.namespace("pids", () => {
    DSL.task(
      "clear",
      block(async () => {
        await main.rm(await Dir.globAsync("tmp/pids/[^.]*"), { verbose: false });
      }),
    );
  });

  DSL.namespace("screenshots", () => {
    DSL.task(
      "clear",
      block(async () => {
        await main.rm(await Dir.globAsync("tmp/screenshots/[^.]*"), { verbose: false });
      }),
    );
  });

  DSL.namespace("storage", () => {
    DSL.task(
      "clear",
      block(async () => {
        await main.rmRf(await Dir.globAsync("tmp/storage/[^.]*"), { verbose: false });
      }),
    );
  });
});
