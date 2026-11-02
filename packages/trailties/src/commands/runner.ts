import "../class-paths.runner.generated.js";
import { File, TopLevel, exit, include, rbFLoad, stdin } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import type { ThorOptions } from "@blazetrails/thor/core-ext/hash-with-indifferent-access";
import { Base } from "../command/base.js";
import { EnvironmentArgument } from "../command/environment-argument.js";
import { Trails } from "../rails.js";

const AsyncFunction = (async () => {}).constructor as new (
  ...args: string[]
) => (scope: unknown) => Promise<unknown>;

/** @noRailsEquivalent PERMANENT */
function evalToplevel(code: string): Promise<unknown> {
  return new AsyncFunction("__toplevel__", `with (__toplevel__) {\n${code}\n}`)(TopLevel);
}

export class RunnerCommand extends Base {
  declare options: ThorOptions<Record<string, unknown> & { skipExecutor?: boolean }>;

  static {
    const klass = this as unknown as ThorClass;
    klass.classOption("skip_executor", {
      type: "boolean",
      aliases: "-w",
      desc: "Don't wrap with Rails Executor",
      default: false,
    });
    klass.desc(
      "runner [<'Some.js(code)'> | <filename.ts> | -]",
      "Run TypeScript code in the context of your application",
    );
    klass.methodAdded("perform");
  }

  async perform(codeOrFile: string | null = null, ...commandArgv: string[]): Promise<void> {
    void commandArgv;
    if (codeOrFile == null) {
      await (this as unknown as { help(): unknown }).help();
      exit(1);
    }

    await this.bootApplicationBang();
    Trails.application!.loadRunner();

    const wrapWithExecutor = !this.options.skip_executor;
    if (codeOrFile === "-") {
      const source = "application.runner.railties";
      await this.conditionalExecutor(wrapWithExecutor, { source }, async () =>
        evalToplevel((await stdin.read()) as string),
      );
    } else if (await File.isExistAsync(codeOrFile)) {
      const expandedFilePath = File.expandPath(codeOrFile);
      await this.conditionalExecutor(
        wrapWithExecutor,
        { source: "application.runner.railties" },
        () => rbFLoad(expandedFilePath),
      );
    } else {
      try {
        await this.conditionalExecutor(
          wrapWithExecutor,
          { source: "application.runner.railties" },
          () => evalToplevel(codeOrFile),
        );
      } catch (e) {
        if (!(e instanceof SyntaxError || e instanceof ReferenceError)) throw e;
        const executable = (this.constructor as typeof Base).executable();
        if (this.isLooksLikeAFilePath(codeOrFile)) {
          this.error(`The file ${codeOrFile} could not be found, please check and try again.`);
          this.error(`Run '${executable} -h' for help.`);
        } else {
          this.error("Please specify a valid ruby command or the path of a script to run.");
          this.error(`Run '${executable} -h' for help.`);
          this.error("");
          this.error(String(e));
        }

        exit(1);
      }
    }
  }

  /** @internal */
  private conditionalExecutor<T>(enabled: boolean, args: { source: string }, block: () => T): T {
    if (enabled) {
      return Trails.application!.executor.wrap(block, args);
    } else {
      return block();
    }
  }

  /** @internal */
  private isLooksLikeAFilePath(codeOrFile: string): boolean {
    return codeOrFile.endsWith(".ts");
  }
}

include(RunnerCommand, EnvironmentArgument);
