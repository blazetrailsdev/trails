import { rbFSend } from "@blazetrails/ruby-compat";
import { PluginGenerator } from "../generators/trails/plugin/plugin-generator.js";
import { ENGINE_ROOT } from "../app-path.js";

export class Updater {
  private static _generator?: PluginGenerator;

  static generator(): PluginGenerator {
    return (this._generator ??= new PluginGenerator(
      ["plugin"],
      { engine: true },
      { destinationRoot: ENGINE_ROOT },
    ));
  }

  static run(action: string): unknown {
    return rbFSend(this.generator(), action);
  }
}
