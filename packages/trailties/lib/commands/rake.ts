import "../constants.rake.generated.js";
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

  static override async printingCommands(): Promise<[string, string | null][]> {
    const nonAppFilePattern = this.nonAppFilePattern();
    return (await this.rakeTasks())
      .filter(
        (task) =>
          task.comment != null &&
          task.locations.some((location) => nonAppFilePattern.test(location)),
      )
      .map((task) => [task.nameWithArgs(), task.comment]);
  }

  static override async perform(
    task: string,
    args: string[],
    _config: Record<string, unknown>,
  ): Promise<void> {
    await this.withRake([task, ...args], async (rake) => {
      const unrecognizedTask = rake.topLevelTasks
        .filter((t) => t !== "default")
        .find((t) => {
          const name = /[^[]+/.exec(t)?.[0];
          return name === undefined || !rake.lookup(name);
        });
      if (unrecognizedTask !== undefined) {
        this._rakeTasks = rake.tasks;
        throw new UnrecognizedCommandError(
          unrecognizedTask,
          this._rakeTasks.map((t) => t.name),
        );
      }

      rake.options.suppressBacktracePattern = this.nonAppFilePattern();
      await rake.standardExceptionHandling(() => rake.topLevel());
    });
  }

  /** @internal */
  private static _rakeTasks: RakeApplication["tasks"] | undefined;

  /** @internal */
  private static nonAppFilePattern(): RegExp {
    return new RegExp(`^(?!${regexpEscape(root()?.toString() ?? "")})`);
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

  /** @internal */
  private static async rakeTasks(): Promise<RakeApplication["tasks"]> {
    return (this._rakeTasks ??= await this.withRake([], (rake) => rake.tasks));
  }
}
