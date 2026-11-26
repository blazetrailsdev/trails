import { DSL, Task } from "@blazetrails/rake";
import { File, RbConfig, STDOUT as $stdout, TopLevel, block } from "@blazetrails/ruby-compat";
import { rbFSystem } from "@blazetrails/ruby-compat/kernel-system";
import { Turbo } from "../turbo-trails.js";

export const Tasks = {
  async runTurboInstallTemplate(path: string): Promise<boolean | null> {
    return rbFSystem(
      RbConfig.ruby(),
      "./bin/trails",
      "app:template",
      `LOCATION=${File.expandPath(`../install/${path}${File.extname(import.meta.filename)}`, import.meta.dirname)}`,
    );
  },

  async isUsingBun(): Promise<boolean> {
    return File.isExistAsync(TopLevel.Trails!.root()!.join("bun.config.js").toString());
  },
};

Turbo.Tasks = Tasks;

DSL.namespace("turbo", () => {
  DSL.desc("Install Turbo into the app");
  DSL.task(
    "install",
    block(async () => {
      if (
        (await File.isExistAsync(TopLevel.Trails!.root()!.join("package.json").toString())) &&
        (await Turbo.Tasks!.isUsingBun())
      ) {
        await (await Task.get("turbo:install:bun")).invoke();
      } else if (
        await File.isExistAsync(TopLevel.Trails!.root()!.join("package.json").toString())
      ) {
        await (await Task.get("turbo:install:node")).invoke();
      } else {
        $stdout.puts(
          "You must either be running with node (package.json) or importmap-rails (config/importmap.rb) to use this gem.",
        );
      }
    }),
  );

  DSL.namespace("install", () => {
    DSL.desc("Install Turbo into the app with webpacker");
    DSL.task(
      "node",
      block(async () => {
        await Turbo.Tasks!.runTurboInstallTemplate("turbo-with-node");
      }),
    );

    DSL.desc("Install Turbo into the app with bun");
    DSL.task(
      "bun",
      block(async () => {
        await Turbo.Tasks!.runTurboInstallTemplate("turbo-with-bun");
      }),
    );
  });
});
