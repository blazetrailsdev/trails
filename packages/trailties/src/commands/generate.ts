import { Dir } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../command/base.js";
import { Generators } from "../generators.js";

export class GenerateCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    klass.noCommands(() => klass.methodAdded("help"));
    klass.methodAdded("perform");
  }

  async help(): Promise<void> {
    await this.bootApplicationBang();
    await this.loadGenerators();

    await Generators.help((this.constructor as typeof Base).commandName());
  }

  async perform(..._args: string[]): Promise<void> {
    const generator = this.args.shift() as string | undefined;
    if (generator == null) return this.help();

    await this.bootApplicationBang();
    await this.loadGenerators();

    await Generators.invoke(generator, this.args as string[], {
      behavior: "invoke",
      destinationRoot: Dir.pwd(),
    });
  }
}
