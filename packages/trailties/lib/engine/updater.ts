import { TopLevel } from "@blazetrails/ruby-compat/object";
import { rbFSend } from "@blazetrails/ruby-compat/object";
import { PluginGenerator } from "../generators/trails/plugin/plugin-generator.js";

export class Updater {
  private static _generator?: PluginGenerator;

  static generator(): PluginGenerator {
    return (this._generator ??= new PluginGenerator(
      ["plugin"],
      { engine: true },
      { destinationRoot: TopLevel.ENGINE_ROOT },
    ));
  }

  static run(action: string): unknown {
    return rbFSend(this.generator(), action);
  }
}
