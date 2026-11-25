import { File, TopLevel } from "@blazetrails/ruby-compat";
import type { AppGenerator } from "@blazetrails/trailties/generators";

/**
 * @missingRailsArgs join — PERMANENT
 * @missingRailsArgs append_to_file — PERMANENT
 */
export default async function (this: AppGenerator): Promise<void> {
  const jsEntrypointPath = TopLevel.Trails!.root()!.join(
    "app/javascript/entrypoints/application.js",
  );
  if (await File.isExistAsync(jsEntrypointPath.toString())) {
    this.say("Import Turbo");
    await this.appendToFile(
      "app/javascript/entrypoints/application.js",
      `import "@hotwired/turbo-rails"\n`,
    );
  } else {
    this.say("You must import @hotwired/turbo-rails in your JavaScript entrypoint file", "red");
  }

  this.say("Install Turbo");
  await this.run("bun add @hotwired/turbo-rails");
}
