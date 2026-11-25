import { File, TopLevel } from "@blazetrails/ruby-compat";
import type { AppGenerator } from "@blazetrails/trailties/generators";

/**
 * @missingRailsArgs join — PERMANENT
 * @missingRailsArgs append_to_file — PERMANENT
 */
export default async function (this: AppGenerator): Promise<void> {
  this.say("Create controllers directory");
  await this.emptyDirectory("app/javascript/controllers");
  await this.copyFile(
    `${import.meta.dirname}/app/javascript/controllers/index_for_node.js`,
    "app/javascript/controllers/index.js",
  );
  await this.copyFile(
    `${import.meta.dirname}/app/javascript/controllers/application.js`,
    "app/javascript/controllers/application.js",
  );
  await this.copyFile(
    `${import.meta.dirname}/app/javascript/controllers/hello_controller.js`,
    "app/javascript/controllers/hello_controller.js",
  );

  if (
    await File.isExistAsync(
      TopLevel.Trails!.root()!.join("app/javascript/entrypoints/application.js").toString(),
    )
  ) {
    this.say("Import Stimulus controllers");
    await this.appendToFile(
      "app/javascript/entrypoints/application.js",
      `import "~/controllers"\n`,
    );
  } else {
    this.say(
      `Couldn't find "app/javascript/entrypoints/application.js".\nYou must import "~/controllers" in your JavaScript entrypoint file`,
      "red",
    );
  }

  this.say("Install Stimulus");
  await this.run("bun add @hotwired/stimulus");
}
