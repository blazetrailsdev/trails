import "../../../../constants.change-command.generated.js";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../../../../command/base.js";
import { ChangeGenerator } from "../../../../generators/trails/db/system/change/change-generator.js";

export class ChangeCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    klass.classOption("to", { desc: "The database system to switch to." });
    klass.desc(
      "change",
      "Change `config/database.yml` and your database gem to the target database",
    );
    klass.methodAdded("perform");
  }

  /** @internal */
  private _argv: string[];

  constructor(positionalArgs: string[] = [], optionArgs: string[] = [], ...rest: unknown[]) {
    const argv = [...positionalArgs, ...optionArgs];
    super(positionalArgs, optionArgs, ...(rest as [Record<string, unknown>?]));
    this._argv = argv;
  }

  async perform(..._args: unknown[]): Promise<void> {
    await (ChangeGenerator as unknown as ThorClass).start(this._argv);
  }
}
