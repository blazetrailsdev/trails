import "../../constants.plugin-plugin-command.generated.js";
import { File } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../../command/base.js";
import { PluginGenerator } from "../../generators/trails/plugin/plugin-generator.js";

export class PluginCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    this.hideCommandBang();

    this.bin = "trails";

    klass.methodAdded("help");

    klass.classOption("rc", {
      type: "string",
      default: File.join("~", ".trailsrc"),
      desc: "Initialize the plugin command with previous defaults. Uses .trailsrc in your home directory by default.",
    });

    klass.classOption("noRc", { desc: "Skip evaluating .trailsrc." });

    klass.methodAdded("perform");
  }

  async help(): Promise<void> {
    await this.runPluginGenerator(["--help"]);
  }

  static banner(..._rest: unknown[]): string {
    return `${this.executable()} new [options]`;
  }

  async perform(type: string | null = null, ...pluginArgs: string[]): Promise<void> {
    if (type !== "new") pluginArgs.push("--help");

    if (!Object.hasOwn(this.options, "noRc")) {
      const railsrc = File.expandPath(this.options.rc as string);

      if (await File.isExistAsync(railsrc)) {
        const extraArgs = (await File.readAsync(railsrc))
          .split(/\n+/)
          .flatMap((line) => line.split(/\s+/).filter((arg) => arg !== ""));
        this.say(`Using ${extraArgs.join(" ")} from ${railsrc}`);
        pluginArgs.splice(1, 0, ...extraArgs);
      }
    }

    await this.runPluginGenerator(pluginArgs);
  }

  /** @internal */
  private async runPluginGenerator(pluginArgs: string[]): Promise<void> {
    await (PluginGenerator as unknown as ThorClass).start(pluginArgs);
  }
}
