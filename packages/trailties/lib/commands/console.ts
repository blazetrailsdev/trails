import "../constants.console.generated.js";
import { isPresent } from "@blazetrails/activesupport";
import { include, rbClassNewInstance, type Included } from "@blazetrails/ruby-compat/include";
import { STDOUT } from "@blazetrails/ruby-compat/io";
import { rbArgv } from "@blazetrails/ruby-compat/process-adapter";
import { exit } from "@blazetrails/ruby-compat/process-adapter";
import type { ThorClass } from "@blazetrails/thor";
import type { ThorOptions } from "@blazetrails/thor/core-ext/hash-with-indifferent-access";
import { environment } from "../command.js";
import { Base } from "../command/base.js";
import { EnvironmentArgument } from "../command/environment-argument.js";
import { Trails } from "../trails.js";
import { TSREPLConsole } from "./console/tsrepl-console.js";

interface ConsoleOptions {
  sandbox?: boolean | null;
  environment?: string;
}

interface ConsoleRunner {
  start(): unknown;
}

interface ConsoleApp {
  sandbox: boolean | null | undefined;
  config: {
    console?: ConsoleRunner | null;
    disableSandbox?: boolean;
    sandboxByDefault?: boolean;
  };
  name(): string;
  loadConsole(): unknown;
}

export class Console {
  static async start(...args: [app: ConsoleApp, options?: ConsoleOptions]): Promise<void> {
    return (await this.new(...args)).start();
  }

  static async new<T extends Console>(
    this: { prototype: T },
    app: ConsoleApp,
    options: ConsoleOptions = {},
  ): Promise<T> {
    const obj = rbClassNewInstance(this, app, options);
    await app.loadConsole();

    obj.console = app.config.console || new TSREPLConsole(app);
    return obj;
  }

  readonly options: ConsoleOptions;
  readonly app: ConsoleApp;
  console!: ConsoleRunner;

  protected constructor(app: ConsoleApp, options: ConsoleOptions = {}) {
    this.app = app;
    this.options = options;

    app.sandbox = this.isSandbox();

    if (this.isSandbox() && app.config.disableSandbox) {
      STDOUT.puts(
        "Error: Unable to start console in sandbox mode as sandbox mode is disabled (config.disable_sandbox is true).",
      );
      exit(1);
    }
  }

  isSandbox(): boolean | undefined {
    if (this.options.sandbox != null) return this.options.sandbox;

    if (Trails.env.isLocal()) return false;

    return this.app.config.sandboxByDefault;
  }

  environment(): string | undefined {
    return this.options.environment;
  }

  isEnvironment(): string | undefined {
    return this.environment();
  }

  setEnvironmentBang(): void {
    Trails.env = this.environment()!;
  }

  async start(): Promise<void> {
    if (this.isEnvironment()) this.setEnvironmentBang();

    if (this.isSandbox()) {
      STDOUT.puts(`Loading ${Trails.env} environment in sandbox (Trails ${Trails.version()})`);
      STDOUT.puts("Any modifications you make will be rolled back on exit");
    } else {
      STDOUT.puts(`Loading ${Trails.env} environment (Trails ${Trails.version()})`);
    }

    await this.console.start();
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export interface ConsoleCommand extends Included<typeof EnvironmentArgument> {
  /** @internal */
  _environment?: string;
  /** @internal */
  _environmentSpecified?: boolean;
  /** @internal */
  _availableEnvironments?: string[];
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export class ConsoleCommand extends Base {
  declare options: ThorOptions<Record<string, unknown> & ConsoleOptions>;

  static {
    const klass = this as unknown as ThorClass;
    include(this, EnvironmentArgument);
    klass.classOption("sandbox", {
      aliases: "-s",
      type: "boolean",
      default: null,
      desc: "Rollback database modifications on exit.",
    });
    klass.desc("console", "Start the Trails console");
    klass.methodAdded("perform");
  }

  /** @inlinedFrom Rails::Command::EnvironmentArgument#initialize rails/v8.0.5.2/railties/lib/rails/command/environment_argument.rb:16-26 */
  constructor(...[args = [], localOptions = {}, config = {}]: ConstructorParameters<typeof Base>) {
    let consoleOptions: string[] = [];

    if (Array.isArray(localOptions)) {
      const termination = localOptions.indexOf("--");
      if (termination !== -1) {
        consoleOptions = localOptions.slice(termination + 1);
        localOptions = localOptions.slice(0, termination);
      }
    }

    rbArgv().splice(0, rbArgv().length, ...consoleOptions);
    super(args, localOptions, config);

    this._environmentSpecified = isPresent(this.options.environment);

    if (!this._environmentSpecified) {
      this.options = this.options.merge({ environment: environment() });
    } else if (!this.availableEnvironments().includes(this.options.environment!)) {
      this.options = this.options.merge({
        environment: this.expandEnvironmentName(this.options.environment!),
      });
    }
  }

  async perform(): Promise<void> {
    await this.bootApplicationBang();
    await Console.start(Trails.application as unknown as ConsoleApp, this.options);
  }
}

Trails.Console = Console;
