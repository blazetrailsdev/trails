import "../constants.test.generated.js";
import { rbFSystem } from "@blazetrails/ruby-compat/kernel-system";
import { LOAD_PATH } from "@blazetrails/ruby-compat/load";
import { LoadError } from "@blazetrails/ruby-compat/load-error";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../command/base.js";
import { UnrecognizedCommandError, root } from "../command.js";
import { RakeCommand } from "./rake.js";
import { TestUnitReporter } from "../test-unit/reporter.js";
import { Runner } from "../test-unit/runner.js";

export class TestCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    klass.noCommands(() => klass.methodAdded("help"));

    klass.desc("test [PATHS...]", "Run tests except system tests");
    klass.methodAdded("perform");

    klass.desc("models", "Run tests in test/models");
    klass.methodAdded("models");
    klass.desc("helpers", "Run tests in test/helpers");
    klass.methodAdded("helpers");
    klass.desc("channels", "Run tests in test/channels");
    klass.methodAdded("channels");
    klass.desc("controllers", "Run tests in test/controllers");
    klass.methodAdded("controllers");
    klass.desc("mailers", "Run tests in test/mailers");
    klass.methodAdded("mailers");
    klass.desc("integration", "Run tests in test/integration");
    klass.methodAdded("integration");
    klass.desc("jobs", "Run tests in test/jobs");
    klass.methodAdded("jobs");
    klass.desc("mailboxes", "Run tests in test/mailboxes");
    klass.methodAdded("mailboxes");

    klass.desc("all", "Run all tests, including system tests");
    klass.methodAdded("all");
    klass.desc("functionals", "Run tests in test/controllers, test/mailers, and test/functional");
    klass.methodAdded("functionals");
    klass.desc("units", "Run tests in test/models, test/helpers, and test/unit");
    klass.methodAdded("units");
    klass.desc("system", "Run system tests only");
    klass.methodAdded("system");
    klass.desc("generators", "Run tests in test/lib/generators");
    klass.methodAdded("generators");
  }

  static executable(...args: [string?]): string {
    return args.length === 0 ? TestUnitReporter.executable : super.executable(...args);
  }

  async help(commandName: string | null = null, ..._rest: unknown[]): Promise<void> {
    await super.help(commandName);
    if (commandName === "test") {
      this.say("");
      this.say(await (this.constructor as typeof TestCommand).classUsage());
    }
    this.say("");
    if ((await rbFSystem("vitest", "--help")) == null) {
      throw new LoadError("cannot load such file -- vitest");
    }
  }

  async perform(...args: string[]): Promise<void> {
    LOAD_PATH.push(root()!.join("test").toString());

    Runner.parseOptions(args);
    if (!(this.args as string[]).some((arg) => TestCommand.EXACT_TEST_ARGUMENT_PATTERN.test(arg))) {
      await this.runPrepareTask();
    }
    await Runner.run(args);
  }

  async models(...args: string[]): Promise<void> {
    await this.perform("test/models", ...args);
  }

  async helpers(...args: string[]): Promise<void> {
    await this.perform("test/helpers", ...args);
  }

  async channels(...args: string[]): Promise<void> {
    await this.perform("test/channels", ...args);
  }

  async controllers(...args: string[]): Promise<void> {
    await this.perform("test/controllers", ...args);
  }

  async mailers(...args: string[]): Promise<void> {
    await this.perform("test/mailers", ...args);
  }

  async integration(...args: string[]): Promise<void> {
    await this.perform("test/integration", ...args);
  }

  async jobs(...args: string[]): Promise<void> {
    await this.perform("test/jobs", ...args);
  }

  async mailboxes(...args: string[]): Promise<void> {
    await this.perform("test/mailboxes", ...args);
  }

  async all(...args: string[]): Promise<void> {
    await this.perform("test/**/*.test.ts", ...args);
  }

  async functionals(...args: string[]): Promise<void> {
    await this.perform("test/controllers", "test/mailers", "test/functional", ...args);
  }

  async units(...args: string[]): Promise<void> {
    await this.perform("test/models", "test/helpers", "test/unit", ...args);
  }

  async system(...args: string[]): Promise<void> {
    await this.perform("test/system", ...args);
  }

  async generators(...args: string[]): Promise<void> {
    await this.perform("test/lib/generators", ...args);
  }

  /** @internal */
  private static readonly EXACT_TEST_ARGUMENT_PATTERN = new RegExp(
    `^-n|^--name\\b|${Runner.PATH_ARGUMENT_PATTERN.source}`,
    "m",
  );

  /** @internal */
  private async runPrepareTask(): Promise<void> {
    try {
      await RakeCommand.perform("test:prepare", [], {});
    } catch (error) {
      if (!(error instanceof UnrecognizedCommandError && error.name === "test:prepare")) {
        throw error;
      }
    }
  }
}
