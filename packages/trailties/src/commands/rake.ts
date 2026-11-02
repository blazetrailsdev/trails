import { Rake, TaskManager, type Application as RakeApplication } from "@blazetrails/rake";
import { extend, regexpEscape } from "@blazetrails/ruby-compat";
import { Actions } from "../command/actions.js";
import { Base } from "../command/base.js";
import { UnrecognizedCommandError, root } from "../command.js";

export class RakeCommand extends Base {
  static {
    extend(this, Actions);
    this.namespace("rake");
  }

  static override async perform(
    task: string,
    args: string[],
    _config: Record<string, unknown>,
  ): Promise<void> {
    await this.withRake([task, ...args], async (rake) => {
      const unrecognizedTask = rake.topLevelTasks
        .filter((t) => t !== "default")
        .find((t) => !rake.lookup(/[^[]+/.exec(t)![0]));
      if (unrecognizedTask !== undefined) {
        throw new UnrecognizedCommandError(
          unrecognizedTask,
          rake.tasks.map((t) => t.name),
        );
      }

      rake.options.suppressBacktracePattern = this.nonAppFilePattern();
      await rake.standardExceptionHandling(() => rake.topLevel());
    });
  }

  /** @internal */
  private static nonAppFilePattern(): RegExp {
    return new RegExp(`^(?!${regexpEscape(root()!.toString())})`);
  }

  /** @internal */
  private static async withRake<T>(
    args: string[],
    block: (rake: RakeApplication) => T | Promise<T>,
  ): Promise<T> {
    TaskManager.recordTaskMetadata = true;

    let result: T;
    await Rake.withApplication(async (rake) => {
      if (args.length > 0) await rake.init(this.bin, args);
      await rake.loadRakefile();
      result = await block(rake);
    });
    return result!;
  }
}
