import "../constants.runner.generated.js";
import {
  File,
  TopLevel,
  exit,
  argv,
  include,
  rbArgv,
  rbFLoad,
  stdin,
} from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import type { ThorOptions } from "@blazetrails/thor/core-ext/hash-with-indifferent-access";
import { isPresent } from "@blazetrails/activesupport";
import { environment } from "../command.js";
import { Base } from "../command/base.js";
import { EnvironmentArgument } from "../command/environment-argument.js";
import { Trails } from "../rails.js";

const AsyncFunction = (async () => {}).constructor as new (
  ...args: string[]
) => (scope: unknown) => Promise<unknown>;

/** @noRailsEquivalent PERMANENT */
function evalToplevel(code: string, file: string): Promise<unknown> {
  return new AsyncFunction(
    "__toplevel__",
    `with (__toplevel__) {\n${code}\n}\n//# sourceURL=${file}`,
  )(TopLevel);
}

export class RunnerCommand extends Base {
  declare options: ThorOptions<Record<string, unknown> & { environment?: string }>;
  /** @internal */
  declare _environmentSpecified: boolean;
  /** @internal */
  declare availableEnvironments: () => string[];
  /** @internal */
  declare expandEnvironmentName: (name: string) => string;

  static {
    const klass = this as unknown as ThorClass;
    klass.classOption("skip_executor", {
      type: "boolean",
      aliases: "-w",
      desc: "Don't wrap with Rails Executor",
      default: false,
    });
    klass.noCommands(() => klass.methodAdded("help"));
    klass.desc(
      "runner [<'Some.js(code)'> | <filename.ts> | -]",
      "Run TypeScript code in the context of your application",
    );
    klass.methodAdded("perform");
  }

  /** @inlinedFrom Rails::Command::EnvironmentArgument#initialize rails/v8.0.2/railties/lib/rails/command/environment_argument.rb:16-26 */
  constructor(...args: ConstructorParameters<typeof Base>) {
    super(...args);

    this._environmentSpecified = isPresent(this.options.environment);

    if (!this._environmentSpecified) {
      this.options = this.options.merge({ environment: environment() });
    } else if (!this.availableEnvironments().includes(this.options.environment!)) {
      this.options = this.options.merge({
        environment: this.expandEnvironmentName(this.options.environment!),
      });
    }
  }

  async help(commandName: string | null = null, ..._rest: unknown[]): Promise<void> {
    await (Base.prototype as unknown as { help(name: string | null): Promise<void> }).help.call(
      this,
      commandName,
    );
    if (commandName === "runner") {
      const shell = this as unknown as { say(message: string): void };
      shell.say("");
      shell.say((await (this.constructor as typeof Base).classUsage())!);
    }
  }

  async perform(codeOrFile: string | null = null, ...commandArgv: string[]): Promise<void> {
    if (codeOrFile == null) {
      await this.help();
      exit(1);
    }

    await this.bootApplicationBang();
    Trails.application!.loadRunner();

    rbArgv().splice(0, rbArgv().length, ...commandArgv);

    const wrapWithExecutor = !this.options.skip_executor;
    if (codeOrFile === "-") {
      await this.conditionalExecutor(
        wrapWithExecutor,
        { source: "application.runner.railties" },
        async () => evalToplevel((await stdin.read()) as string, "stdin"),
      );
    } else if (await File.isExistAsync(codeOrFile)) {
      const expandedFilePath = File.expandPath(codeOrFile);
      (argv as string[])[1] = expandedFilePath;
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
          () => evalToplevel(codeOrFile, import.meta.filename),
        );
      } catch (e) {
        if (!(e instanceof SyntaxError || e instanceof ReferenceError)) throw e;
        if (this.isLooksLikeAFilePath(codeOrFile)) {
          this.error(`The file ${codeOrFile} could not be found, please check and try again.`);
          this.error(`Run '${(this.constructor as typeof Base).executable()} -h' for help.`);
        } else {
          this.error("Please specify a valid ruby command or the path of a script to run.");
          this.error(`Run '${(this.constructor as typeof Base).executable()} -h' for help.`);
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
