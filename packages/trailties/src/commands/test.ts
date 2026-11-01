import { rbFSystem } from "@blazetrails/ruby-compat";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../command/base.js";
import { TestUnitReporter } from "../test-unit/reporter.js";
import { Runner } from "../test-unit/runner.js";

export class TestCommand extends Base {
  static {
    const klass = this as unknown as ThorClass;
    klass.noCommands(() => klass.methodAdded("help"));

    klass.desc("test [PATHS...]", "Run tests except system tests");
    klass.methodAdded("perform");

    for (const name of Runner.TEST_FOLDERS) {
      klass.desc(name, `Run tests in test/${name}`);
      Object.defineProperty(this.prototype, name, {
        value(this: TestCommand, ...args: string[]) {
          return this.perform(`test/${name}`, ...args);
        },
        writable: true,
        configurable: true,
      });
      klass.methodAdded(name);
    }

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

  /** @internal */
  private static readonly EXACT_TEST_ARGUMENT_PATTERN = new RegExp(
    `^-n|^--name\\b|${Runner.PATH_ARGUMENT_PATTERN.source}`,
    "m",
  );

  static executable(...args: [string?]): string {
    return args.length === 0 ? TestUnitReporter.executable : super.executable(...args);
  }

  /** @missingRailsCall run — PERMANENT */
  async help(commandName: string | null = null, ..._rest: unknown[]): Promise<void> {
    await super.help(commandName);
    if (commandName === "test") {
      this.say("");
    }
    this.say("");
    await rbFSystem("vitest", "--help");
  }

  async perform(...args: string[]): Promise<void> {
    Runner.parseOptions(args);
    await Runner.run(args);
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
}
